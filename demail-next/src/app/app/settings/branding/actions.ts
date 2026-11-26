"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { cleanText, isHttpsUrl, isSafeName } from "@/lib/input";
const PATH = "/app/settings/branding";
const HEX_RE = /^#[0-9a-f]{6}$/;
const LINKS = "Links must be full https:// addresses.";
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
