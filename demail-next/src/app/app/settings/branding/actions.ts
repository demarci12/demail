"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { cleanText, isHttpsUrl, isSafeName, normalizeHostname } from "@/lib/input";
import { checkAndStorePortal } from "@/lib/deliverability/run";
import { appHost } from "@/lib/portal";
import { createAdminClient } from "@/lib/supabase/admin";
const PATH = "/app/settings/branding";
const HEX_RE = /^#[0-9a-f]{6}$/;
const LINKS = "Links must be full https:// addresses.";
const CHECK_GAP_MS = 60_000;
const fail = (message: string): never => redirect(`${PATH}?error=${encodeURIComponent(message)}`);
const done = (message: string): never => {
  revalidatePath("/app", "layout");
  return redirect(`${PATH}?msg=${encodeURIComponent(message)}`);
};
async function manager() {
  const ctx = await getOrgContext();
  if (!ctx.org.is_agency || !ctx.canManage) return fail("Only owners and admins of an agency can change its branding.");
  return ctx;
}
// Blank means no link; anything else must be an https URL.
function link(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) return null;
  if (!isHttpsUrl(value)) return fail(LINKS);
  return value;
}
export async function saveBranding(formData: FormData) {
  const { supabase, org } = await manager();
  const brand_name = cleanText(formData.get("brand_name"), 60);
  if (!brand_name) return fail("Enter a brand name up to 60 characters.");
  if (!isSafeName(brand_name)) return fail("Brand names cannot contain links, web or email addresses.");
  const accent_color = String(formData.get("accent_color") ?? "").trim().toLowerCase();
  if (!HEX_RE.test(accent_color)) return fail("Pick an accent color like #0284c7.");
  const row = {
    organization_id: org.id,
    brand_name,
    logo_url: link(formData, "logo_url"),
    support_url: link(formData, "support_url"),
    privacy_url: link(formData, "privacy_url"),
    terms_url: link(formData, "terms_url"),
    accent_color,
    hide_powered_by: formData.get("hide_powered_by") === "on",
  };
  const { error } = await supabase.from("org_branding").upsert(row, { onConflict: "organization_id" });
  if (error) return fail("Could not save the branding.");
  return done("Branding saved.");
}
export async function removeBranding() {
  const { supabase, org } = await manager();
  const { error } = await supabase.from("org_branding").delete().eq("organization_id", org.id);
  if (error) return fail("Could not remove the branding.");
  return done("Branding removed. Demail is shown again.");
}
export async function addPortalDomain(formData: FormData) {
  const { supabase, org } = await manager();
  const hostname = normalizeHostname(formData.get("hostname"));
  if (!hostname) return fail("Enter a public hostname like portal.example.com.");
  if (hostname === appHost().replace(/:\d+$/, "")) return fail("That is the main address of this app. Use a hostname of your own.");
  const { error } = await supabase.from("portal_domains").insert({ organization_id: org.id, hostname });
  if (error?.code === "23505") return fail("This agency already has a custom domain. Remove it before adding another.");
  if (error) return fail("Could not add the custom domain.");
  return done("Custom domain added. Publish the TXT record, then check it.");
}
export async function checkPortalDomain() {
  const { supabase, org } = await manager();
  const { data: row, error } = await supabase
    .from("portal_domains")
    .select("organization_id, hostname, verify_token, verified_at, last_checked_at")
    .eq("organization_id", org.id)
    .maybeSingle();
  if (error) return fail("Could not load the custom domain.");
  if (!row) return fail("Add a custom domain first.");
  if (row.last_checked_at && Date.now() - new Date(row.last_checked_at).getTime() < CHECK_GAP_MS) return fail("Checked less than a minute ago. Try again shortly.");
  let result: Awaited<ReturnType<typeof checkAndStorePortal>>;
  try {
    // The member cannot write verification columns, so the service role stores the result after the role check above.
    result = await checkAndStorePortal(createAdminClient(), { ...row, organization_id: org.id });
  } catch {
    return fail("Could not check the custom domain.");
  }
  if (result === "taken") return fail("Another agency already verified this hostname.");
  if (result === "missing") return fail(`The TXT record at _demail.${row.hostname} was not found yet. DNS changes can take a while to appear.`);
  return done("Custom domain verified.");
}
export async function removePortalDomain() {
  const { supabase, org } = await manager();
  const { error } = await supabase.from("portal_domains").delete().eq("organization_id", org.id);
  if (error) return fail("Could not remove the custom domain.");
  return done("Custom domain removed.");
}
