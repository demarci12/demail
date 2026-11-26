import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
type Row = Database["public"]["Tables"]["org_branding"]["Row"];
export type Branding = Pick<Row, "brand_name" | "logo_url" | "support_url" | "privacy_url" | "terms_url" | "accent_color" | "hide_powered_by">;
const pick = (r: Row): Branding => ({
  brand_name: r.brand_name,
  logo_url: r.logo_url,
  support_url: r.support_url,
  privacy_url: r.privacy_url,
  terms_url: r.terms_url,
  accent_color: r.accent_color,
  hide_powered_by: r.hide_powered_by,
});
// The brand of a workspace the signed-in user can open; cached so layout and metadata share one call.
export const getWorkspaceBranding = cache(async (supabase: SupabaseClient<Database>, orgId: string): Promise<Branding | null> => {
  const { data } = await supabase.rpc("workspace_branding", { p_org: orgId });
  const row = data?.[0];
  return row ? pick(row) : null;
});
// For public pages only: the brand of the agency behind a workspace, read with the service role.
export async function getPublicBranding(orgId: string): Promise<Branding | null> {
  const admin = createAdminClient();
  const { data: org } = await admin.from("organizations").select("is_agency, agency_id").eq("id", orgId).maybeSingle();
  const agencyId = org ? (org.is_agency ? orgId : org.agency_id) : null;
  if (!agencyId) return null;
  const { data } = await admin.from("org_branding").select("*").eq("organization_id", agencyId).maybeSingle();
  return data ? pick(data) : null;
}
