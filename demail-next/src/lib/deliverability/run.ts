import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";
import { checkDomain, checkPortalTxt, type ProviderHint } from "./dns";

type Admin = ReturnType<typeof createAdminClient>;
type Domain = Database["public"]["Tables"]["sending_domains"]["Row"];
type Portal = Database["public"]["Tables"]["portal_domains"]["Row"];
export type PortalCheck = "verified" | "missing" | "taken";

const BATCH = 20;
const STALE_MS = 24 * 3_600_000;

// Checks one domain and stores the result; the caller has already verified it belongs to the organization.
export async function checkAndStore(admin: Admin, d: Pick<Domain, "id" | "organization_id" | "domain" | "provider_hint" | "dkim_selector">) {
  const c = await checkDomain(d.domain, d.provider_hint as ProviderHint, d.dkim_selector);
  await admin
    .from("sending_domains")
    .update({
      spf_status: c.spf.status,
      dkim_status: c.dkim.status,
      dmarc_status: c.dmarc.status,
      spf_record: c.spf.record,
      dmarc_record: c.dmarc.record,
      last_checked_at: new Date().toISOString(),
    })
    .eq("id", d.id)
    .eq("organization_id", d.organization_id);
}

// Checks one portal domain's TXT record; a hostname another agency already verified stays unverified here.
export async function checkAndStorePortal(admin: Admin, row: Pick<Portal, "organization_id" | "hostname" | "verify_token" | "verified_at">): Promise<PortalCheck> {
  const found = await checkPortalTxt(row.hostname, row.verify_token);
  const now = new Date().toISOString();
  const verified_at = found ? (row.verified_at ?? now) : null;
  const { error } = await admin.from("portal_domains").update({ verified_at, last_checked_at: now }).eq("organization_id", row.organization_id);
  if (!error) return found ? "verified" : "missing";
  if (error.code !== "23505") throw new Error("could not store the portal domain check");
  const { error: retry } = await admin.from("portal_domains").update({ verified_at: null, last_checked_at: now }).eq("organization_id", row.organization_id);
  if (retry) throw new Error("could not store the portal domain check");
  return "taken";
}
// Hostnames come only from sending_domains, which validates them at insert.
export async function runDomainChecks() {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await admin
    .from("sending_domains")
    .select("id, organization_id, domain, provider_hint, dkim_selector")
    .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (error) throw new Error("could not list sending domains");
  let checked = 0;
  for (const d of data ?? []) {
    await checkAndStore(admin, d);
    checked++;
  }
  // Verified portal domains are rechecked daily, in parallel so the tick stays inside the function limit.
  const { data: portalRows, error: portalError } = await admin
    .from("portal_domains")
    .select("organization_id, hostname, verify_token, verified_at")
    .not("verified_at", "is", null)
    .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (portalError) {
    console.error("could not list portal domains");
    return { checked, portals: 0 };
  }
  const results = await Promise.allSettled((portalRows ?? []).map((p) => checkAndStorePortal(admin, p)));
  const portals = results.filter((r) => r.status === "fulfilled").length;
  return { checked, portals };
}
