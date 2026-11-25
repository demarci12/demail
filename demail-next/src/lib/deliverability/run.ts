import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";
import { checkDomain, type ProviderHint } from "./dns";

type Admin = ReturnType<typeof createAdminClient>;
type Domain = Database["public"]["Tables"]["sending_domains"]["Row"];

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
  return { checked };
}
