import "server-only";
import type { Json } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyEmails } from "./check";

type Target = { id: string; organization_id: string; email: string };

// Verifies the given contacts and stores one batch of results per organization.
export async function verifyTargets(targets: Target[]): Promise<{ checked: number; invalid: number }> {
  if (targets.length === 0) return { checked: 0, invalid: 0 };
  const results = await verifyEmails(targets.map((t) => t.email));
  const admin = createAdminClient();
  const byOrg = new Map<string, Json[]>();
  let invalid = 0;
  targets.forEach((t, i) => {
    const r = results[i];
    if (r.status === "invalid") invalid++;
    const list = byOrg.get(t.organization_id) ?? [];
    list.push({ id: t.id, email: t.email, status: r.status, reason: r.reason, suggestion: r.suggestion, flags: r.flags });
    byOrg.set(t.organization_id, list);
  });
  for (const [org, rows] of byOrg) {
    const { error } = await admin.rpc("set_contact_verification", { p_org: org, p_results: rows });
    if (error) throw new Error("Could not store verification results.");
  }
  return { checked: targets.length, invalid };
}

// Cron tick: the oldest unverified or stale contacts across all workspaces.
export async function runVerifyTick(limit = 200) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("contacts_to_verify", { p_limit: limit });
  if (error) throw new Error("Could not read the verification queue.");
  return verifyTargets(data ?? []);
}
