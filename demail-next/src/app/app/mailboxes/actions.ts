"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrgContext } from "@/lib/org";
import { publicEnv } from "@/lib/env";
import { cleanText, isSafeName } from "@/lib/input";
import { EMAIL_PATTERN } from "@/lib/csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { readRefreshToken } from "@/lib/mail/credentials";
import { revokeGoogle } from "@/lib/mail/oauth";
import { newFilterTag } from "@/lib/warmup/tag";
const schema = z.object({
  email: z.string().trim().toLowerCase().regex(EMAIL_PATTERN).max(320),
  from_name: z.string().trim().max(200),
  daily_limit: z.coerce.number().int().min(1).max(5000),
  min_gap_seconds: z.coerce.number().int().min(0).max(86400),
  status: z.enum(["active", "paused", "disconnected"]),
});
const fail = (message: string): never => redirect("/app/mailboxes?error=" + encodeURIComponent(message));
export async function addMailbox(formData: FormData) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can add sender identities.");
  const parsed = schema.safeParse({
    email: formData.get("email"),
    from_name: formData.get("from_name") ?? "",
    daily_limit: formData.get("daily_limit"),
    min_gap_seconds: formData.get("min_gap_seconds"),
    status: formData.get("status"),
  });
  if (!parsed.success) return fail("Check the email address, daily limit and minimum gap.");
  const { error } = await supabase.from("mailboxes").insert({ ...parsed.data, organization_id: org.id });
  if (error) return fail(error.code === "23505" ? "That sender already exists." : "Could not add the sender.");
  revalidatePath("/app/mailboxes");
  redirect("/app/mailboxes");
}
export async function setMailboxStatus(id: string, status: "active" | "paused") {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can change senders.");
  await supabase.from("mailboxes").update({ status }).eq("id", id).eq("organization_id", org.id);
  revalidatePath("/app/mailboxes");
}
export async function deleteMailbox(id: string) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can remove senders.");
  const { data: mailbox } = await supabase.from("mailboxes").select("provider").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (mailbox?.provider === "google") {
    const token = await readRefreshToken(createAdminClient(), id, org.id);
    if (token) await revokeGoogle(token);
  }
  await supabase.from("mailboxes").delete().eq("id", id).eq("organization_id", org.id);
  revalidatePath("/app/mailboxes");
}
const notice = (message: string): never => redirect("/app/mailboxes?message=" + encodeURIComponent(message));
const WARMUP_PROVIDERS = ["google", "microsoft"];
// Turns warmup on or off for a Gmail or Microsoft mailbox. The ramp restarts when it was off for more than 7 days.
export async function setWarmup(id: string, enabled: boolean) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can change warmup.");
  const { data: m } = await supabase
    .from("mailboxes")
    .select("provider, warmup_started_at, warmup_disabled_at")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (!m) return fail("Mailbox not found.");
  if (!WARMUP_PROVIDERS.includes(m.provider)) return fail("Warmup works with Google and Microsoft mailboxes, not Resend senders.");
  const now = new Date();
  if (!enabled) {
    await supabase.from("mailboxes").update({ warmup_enabled: false, warmup_disabled_at: now.toISOString() }).eq("id", id).eq("organization_id", org.id);
    revalidatePath("/app/mailboxes");
    return;
  }
  const idleMs = m.warmup_disabled_at ? now.getTime() - new Date(m.warmup_disabled_at).getTime() : 0;
  const restart = !m.warmup_started_at || idleMs > 7 * 86_400_000;
  const { error } = await supabase
    .from("mailboxes")
    .update({ warmup_enabled: true, warmup_disabled_at: null, ...(restart ? { warmup_started_at: now.toISOString() } : {}) })
    .eq("id", id)
    .eq("organization_id", org.id);
  if (error) return fail("Could not turn warmup on.");
  const { count } = await supabase
    .from("mailboxes")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .eq("status", "active")
    .in("provider", ["google", "microsoft"]);
  revalidatePath("/app/mailboxes");
  if ((count ?? 0) < 2) notice("Warmup is on, but it needs at least two active Google or Microsoft mailboxes in this workspace before any mail is sent.");
}
const windowSchema = z.object({ warmup_start: z.string().regex(/^\d{2}:\d{2}$/), warmup_end: z.string().regex(/^\d{2}:\d{2}$/), timezone: z.string().trim().min(1).max(64) });
export async function setWarmupWindow(id: string, formData: FormData) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can change warmup.");
  const parsed = windowSchema.safeParse({ warmup_start: formData.get("warmup_start"), warmup_end: formData.get("warmup_end"), timezone: formData.get("timezone") });
  if (!parsed.success || parsed.data.warmup_end <= parsed.data.warmup_start) return fail("Enter a workday where the end is after the start.");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
  } catch {
    return fail("Unknown timezone. Use a name like Europe/Budapest.");
  }
  const { error } = await supabase.from("mailboxes").update(parsed.data).eq("id", id).eq("organization_id", org.id);
  if (error) return fail("Could not save the workday.");
  revalidatePath("/app/mailboxes");
}
// The tag is created the first time it is enabled and kept when it is disabled.
export async function setWarmupFilterTag(id: string, enabled: boolean) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can change warmup.");
  const { data: m } = await supabase.from("mailboxes").select("warmup_filter_tag").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!m) return fail("Mailbox not found.");
  const tag = m.warmup_filter_tag ?? (enabled ? newFilterTag() : null);
  await supabase.from("mailboxes").update({ warmup_filter_tag_enabled: enabled, warmup_filter_tag: tag }).eq("id", id).eq("organization_id", org.id);
  revalidatePath("/app/mailboxes");
}
const rampSchema = z.object({ ramp_enabled: z.boolean(), ramp_start: z.coerce.number().int().min(1).max(5000), ramp_step: z.coerce.number().int().min(0).max(5000) });
// The ramp restarts from week 1 each time it is switched on. The mailbox daily limit and health band still apply.
export async function setRamp(id: string, formData: FormData) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return fail("Only owners and admins can change the ramp.");
  const parsed = rampSchema.safeParse({ ramp_enabled: formData.get("ramp_enabled") === "on", ramp_start: formData.get("ramp_start"), ramp_step: formData.get("ramp_step") });
  if (!parsed.success) return fail("Enter a start of 1 to 5000 a day and a weekly step of 0 to 5000.");
  const { data: m } = await supabase.from("mailboxes").select("ramp_enabled").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!m) return fail("Mailbox not found.");
  const restart = parsed.data.ramp_enabled && !m.ramp_enabled;
  const { error } = await supabase
    .from("mailboxes")
    .update({ ...parsed.data, ...(restart ? { ramp_started_at: new Date().toISOString() } : {}) })
    .eq("id", id)
    .eq("organization_id", org.id);
  if (error) return fail("Could not save the ramp.");
  revalidatePath("/app/mailboxes");
}
export type ConnectLinkState = { link?: string; error?: string };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const intIn = (min: number, max: number, fallback: number) =>
  z.preprocess((v) => (v == null || (typeof v === "string" && v.trim() === "") ? fallback : v), z.coerce.number().int().min(min).max(max));
const linkSchema = z.object({ days: intIn(1, 30, 7), max_uses: intIn(1, 50, 1) });
// The token is returned once; only its sha256 is stored.
export async function createConnectLink(_prev: ConnectLinkState, formData: FormData): Promise<ConnectLinkState> {
  const { supabase, org, canManage } = await getOrgContext();
  if (!canManage) return { error: "Only owners and admins can create connect links." };
  const label = cleanText(formData.get("label"), 80);
  if (label && !isSafeName(label)) return { error: "A label cannot contain links, addresses or markup." };
  const parsed = linkSchema.safeParse({ days: formData.get("days"), max_uses: formData.get("max_uses") });
  if (!parsed.success) return { error: "A link is valid for 1 to 30 days and connects 1 to 50 mailboxes." };
  const { data, error } = await supabase.rpc("create_connect_link", { p_org: org.id, p_label: label, p_days: parsed.data.days, p_max_uses: parsed.data.max_uses });
  if (error || !data) {
    return { error: error?.message.includes("too many open") ? "Revoke an open link first. A workspace can have 20 at a time." : "Could not create the connect link." };
  }
  revalidatePath("/app/mailboxes");
  return { link: `${publicEnv().NEXT_PUBLIC_APP_URL}/connect/${data}` };
}
export async function revokeConnectLink(id: string) {
  const { supabase, org, canManage } = await getOrgContext();
  if (!UUID_RE.test(id) || !canManage) return fail("Only owners and admins can revoke connect links.");
  const { error } = await supabase.from("mailbox_connect_links").delete().eq("id", id).eq("organization_id", org.id);
  if (error) return fail("Could not revoke the connect link.");
  revalidatePath("/app/mailboxes");
  return notice("The connect link was revoked.");
}
