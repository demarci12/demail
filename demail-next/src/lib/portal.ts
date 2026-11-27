import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { getPublicBranding, type Branding } from "@/lib/branding";
import { publicEnv } from "@/lib/env";
import { isPublicHostname } from "@/lib/input";
import { createAdminClient } from "@/lib/supabase/admin";
export type Portal = { organizationId: string; hostname: string };
const appUrl = () => publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
// The main address, with a port when it has one.
export function appHost(): string {
  return new URL(appUrl()).host.toLowerCase();
}
export async function requestHost(): Promise<string> {
  return ((await headers()).get("host") ?? "").trim().toLowerCase();
}
// A host is a portal only when it matches a verified row of an agency workspace; anything else, or any error, is the main address.
export const portalForHost = cache(async (host: string): Promise<Portal | null> => {
  try {
    if (!host || host === appHost()) return null;
    const hostname = host.replace(/:\d+$/, "");
    if (hostname === new URL(appUrl()).hostname.toLowerCase() || !isPublicHostname(hostname)) return null;
    const admin = createAdminClient();
    const { data: row, error } = await admin.from("portal_domains").select("organization_id, hostname").eq("hostname", hostname).not("verified_at", "is", null).maybeSingle();
    if (error || !row) return null;
    const { data: org, error: orgError } = await admin.from("organizations").select("is_agency").eq("id", row.organization_id).maybeSingle();
    if (orgError || !org?.is_agency) return null;
    return { organizationId: row.organization_id, hostname: row.hostname };
  } catch {
    return null;
  }
});
export async function currentPortal(): Promise<Portal | null> {
  return portalForHost(await requestHost());
}
// Where links that bring the user back to this app should point: the portal host when on one, else the main address.
export async function publicOrigin(): Promise<string> {
  const portal = await currentPortal();
  return portal ? `https://${portal.hostname}` : appUrl();
}
// Cached so a page and its metadata share one lookup.
export const portalBranding = cache(async (): Promise<Branding | null> => {
  const portal = await currentPortal();
  if (!portal) return null;
  try {
    return await getPublicBranding(portal.organizationId);
  } catch {
    return null;
  }
});
