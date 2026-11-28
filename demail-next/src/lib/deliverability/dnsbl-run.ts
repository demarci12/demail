import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { dnsblZones, queryList, type DnsblAnswer } from "./dnsbl";

type Admin = ReturnType<typeof createAdminClient>;

const BATCH = 15;
const STALE_HOURS = 12;
const CONCURRENT_TARGETS = 5;
const BUDGET_MS = 40_000;
const KEEP_DAYS = 30;

// Pauses cold sending for workspaces that opted in, for each sending domain with a listing newer than its last resume.
export async function applyDnsblPauses(admin: Admin, organizationId?: string): Promise<number> {
  let settings = admin.from("dnsbl_settings").select("organization_id").eq("auto_pause", true).limit(1000);
  if (organizationId) settings = settings.eq("organization_id", organizationId);
  const { data: orgs, error } = await settings;
  if (error) throw new Error("could not read DNSBL settings");
  const ids = (orgs ?? []).map((o) => o.organization_id);
  if (ids.length === 0) return 0;
  const [{ data: listed }, { data: pauses }] = await Promise.all([
    admin.from("dnsbl_results").select("organization_id, domain, list, listed_since").in("organization_id", ids).eq("kind", "sending").eq("status", "listed"),
    admin.from("dnsbl_pauses").select("organization_id, domain, active, resumed_at").in("organization_id", ids),
  ]);
  const byDomain = new Map<string, { organization_id: string; domain: string; lists: string[]; since: number }>();
  for (const r of listed ?? []) {
    const key = `${r.organization_id}|${r.domain}`;
    const cur = byDomain.get(key) ?? { organization_id: r.organization_id, domain: r.domain, lists: [], since: 0 };
    cur.lists.push(r.list);
    cur.since = Math.max(cur.since, r.listed_since ? new Date(r.listed_since).getTime() : 0);
    byDomain.set(key, cur);
  }
  const existing = new Map((pauses ?? []).map((p) => [`${p.organization_id}|${p.domain}`, p]));
  let paused = 0;
  for (const [key, d] of byDomain) {
    const p = existing.get(key);
    if (p?.active) continue;
    if (p?.resumed_at && d.since <= new Date(p.resumed_at).getTime()) continue;
    const { error: upsertError } = await admin.from("dnsbl_pauses").upsert(
      { organization_id: d.organization_id, domain: d.domain, active: true, reason: `Listed on ${d.lists.join(", ")}`, paused_at: new Date().toISOString() },
      { onConflict: "organization_id,domain" },
    );
    if (!upsertError) paused++;
  }
  return paused;
}

async function checkTarget(admin: Admin, t: { organization_id: string; domain: string; kind: string }, zones: string[], cache: Map<string, Promise<DnsblAnswer>>) {
  const answers = await Promise.all(
    zones.map((zone) => {
      const key = `${t.domain}|${zone}`;
      if (!cache.has(key)) cache.set(key, queryList(t.domain, zone));
      return cache.get(key)!;
    }),
  );
  const { data: prev } = await admin.from("dnsbl_results").select("list, status, listed_since").eq("organization_id", t.organization_id).eq("domain", t.domain);
  const before = new Map((prev ?? []).map((r) => [r.list, r]));
  const now = new Date().toISOString();
  const rows = zones.map((list, i) => {
    const was = before.get(list);
    const a = answers[i];
    // A listing keeps its start through an unknown answer, so a flaky resolver does not restart the clock.
    const listed_since = a.status === "listed" ? (was?.status === "listed" ? was.listed_since : now) : a.status === "unknown" && was?.status === "listed" ? was.listed_since : null;
    return { organization_id: t.organization_id, domain: t.domain, kind: t.kind as "sending" | "portal", list, status: a.status, answer: a.answer, listed_since, checked_at: now };
  });
  const { error } = await admin.from("dnsbl_results").upsert(rows, { onConflict: "organization_id,domain,list" });
  if (error) throw new Error("could not store DNSBL results");
  // Rows of lists that are no longer configured are removed so the page shows only current lists.
  await admin.from("dnsbl_results").delete().eq("organization_id", t.organization_id).eq("domain", t.domain).not("list", "in", `(${zones.join(",")})`);
}

// One tick: checks the stalest domains within a time budget, applies opt-in pauses and drops results of removed domains.
export async function runDnsblChecks() {
  const admin = createAdminClient();
  const started = Date.now();
  const zones = dnsblZones();
  const { data, error } = await admin.rpc("dnsbl_due_targets", { p_limit: BATCH, p_stale_hours: STALE_HOURS });
  if (error) throw new Error("could not list DNSBL targets");
  const targets = data ?? [];
  const cache = new Map<string, Promise<DnsblAnswer>>();
  let checked = 0;
  for (let i = 0; i < targets.length && Date.now() - started < BUDGET_MS; i += CONCURRENT_TARGETS) {
    const results = await Promise.allSettled(targets.slice(i, i + CONCURRENT_TARGETS).map((t) => checkTarget(admin, t, zones, cache)));
    checked += results.filter((r) => r.status === "fulfilled").length;
  }
  const paused = await applyDnsblPauses(admin);
  await admin.from("dnsbl_results").delete().lt("checked_at", new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString());
  return { checked, paused };
}
