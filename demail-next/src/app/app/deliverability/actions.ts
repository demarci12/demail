"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAndStore } from "@/lib/deliverability/run";
import { applyDnsblPauses } from "@/lib/deliverability/dnsbl-run";

const HOSTNAME = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const schema = z.object({
  domain: z.string().trim().toLowerCase().max(253).regex(HOSTNAME),
  provider_hint: z.enum(["google", "microsoft", "resend", "other"]),
  dkim_selector: z
    .string()
    .trim()
    .toLowerCase()
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/)
    .or(z.literal("")),
});

const fail = (message: string): never => redirect("/app/deliverability?error=" + encodeURIComponent(message));
const done = (message: string): never => redirect("/app/deliverability?message=" + encodeURIComponent(message));

export async function addDomain(formData: FormData) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can add sending domains.");
  const parsed = schema.safeParse({
    domain: formData.get("domain"),
    provider_hint: formData.get("provider_hint"),
    dkim_selector: formData.get("dkim_selector") ?? "",
  });
  if (!parsed.success) return fail("Enter a valid hostname such as example.com, and pick a provider.");
  const { error } = await supabase.from("sending_domains").insert({
    organization_id: org.id,
    domain: parsed.data.domain,
    provider_hint: parsed.data.provider_hint,
    dkim_selector: parsed.data.dkim_selector || null,
  });
  if (error) return fail(error.code === "23505" ? "That domain is already listed." : "Could not add the domain.");
  revalidatePath("/app/deliverability");
  redirect("/app/deliverability");
}

export async function checkDomainNow(id: string) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can run domain checks.");
  // The read goes through row level security and the organization filter, so another workspace's domain is never found.
  const { data: domain } = await supabase
    .from("sending_domains")
    .select("id, organization_id, domain, provider_hint, dkim_selector, last_checked_at")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!domain) return fail("Domain not found.");
  if (domain.last_checked_at && Date.now() - new Date(domain.last_checked_at).getTime() < 60_000) {
    return fail("This domain was checked less than a minute ago. Try again shortly.");
  }
  await checkAndStore(createAdminClient(), domain);
  revalidatePath("/app/deliverability");
  return done("Check finished.");
}

export async function removeDomain(id: string) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can remove sending domains.");
  await supabase.from("sending_domains").delete().eq("id", id).eq("organization_id", org.id);
  revalidatePath("/app/deliverability");
}

export async function setDnsblAutoPause(formData: FormData) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can change blocklist settings.");
  const on = formData.get("auto_pause") === "on";
  const { error } = await supabase.from("dnsbl_settings").upsert({ organization_id: org.id, auto_pause: on, updated_at: new Date().toISOString() }, { onConflict: "organization_id" });
  if (error) return fail("Could not save the blocklist setting.");
  if (on) await applyDnsblPauses(createAdminClient(), org.id);
  revalidatePath("/app/deliverability");
  return done(on ? "Auto-pause is on." : "Auto-pause is off. Domains already paused stay paused until you resume them.");
}

export async function resumeDnsblDomain(domain: string) {
  const { user, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can resume sending.");
  if (!HOSTNAME.test(domain)) return fail("Domain not found.");
  const { error } = await createAdminClient()
    .from("dnsbl_pauses")
    .update({ active: false, resumed_at: new Date().toISOString(), resumed_by: user.id })
    .eq("organization_id", org.id)
    .eq("domain", domain)
    .eq("active", true);
  if (error) return fail("Could not resume sending.");
  revalidatePath("/app/deliverability");
  return done("Sending resumed. The domain pauses again only if a new listing appears.");
}
