import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { canSeal, openFor } from "@/lib/crypto/secretbox";
import { verifyTargets } from "@/lib/verify/run";
import { FREE_PROVIDERS, DISPOSABLE_DOMAINS } from "@/lib/verify/lists";
import { findContact, verifyEmail, type ProviderRow } from "./adapters";
import { decide, type BuiltIn, type Vote } from "./consensus";
import { runWaterfall, type Field, type Person, type WaterfallProvider } from "./waterfall";

// One click works on a small slice so it fits a request and a cost the member can see.
export const MAX_PER_CLICK = 20;
const CONCURRENCY = 4;
const BUDGET_MS = 40_000;

type Admin = ReturnType<typeof createAdminClient>;
type Loaded = { id: string; label: string; row: ProviderRow; key: string };
export type RunSummary = { ok: boolean; message: string };

async function load(admin: Admin, org: string, role: "enrich" | "verify"): Promise<{ providers: Loaded[]; error?: string }> {
  const { data: settings } = await admin.from("enrichment_settings").select("enabled").eq("organization_id", org).maybeSingle();
  if (!settings?.enabled) return { providers: [], error: "Enrichment is off for this workspace. An owner or admin can turn it on in Settings, Enrichment." };
  if (!canSeal()) return { providers: [], error: "MAILBOX_ENCRYPTION_KEY is not set on the server." };
  const { data: rows } = await admin.from("enrichment_providers").select("id, kind, label, base_url").eq("organization_id", org).eq("role", role).eq("enabled", true).order("position").order("created_at");
  const ids = (rows ?? []).map((r) => r.id);
  const { data: creds } = ids.length ? await admin.from("enrichment_credentials").select("provider_id, ciphertext").eq("organization_id", org).in("provider_id", ids) : { data: [] };
  const sealed = new Map((creds ?? []).map((c) => [c.provider_id, c.ciphertext]));
  const providers: Loaded[] = [];
  for (const r of rows ?? []) {
    const c = sealed.get(r.id);
    if (!c) continue;
    try {
      providers.push({ id: r.id, label: r.label, row: { kind: r.kind, base_url: r.base_url }, key: openFor("enrichment-key", c) });
    } catch {
      // A key that no longer opens is skipped, like a provider with no key.
    }
  }
  return { providers };
}

async function pool<T>(items: T[], deadline: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let item = queue.shift(); item !== undefined && Date.now() < deadline; item = queue.shift()) await fn(item);
    }),
  );
}

const domainOf = (email: string): string | null => {
  const d = email.split("@")[1]?.toLowerCase() ?? "";
  return d && !FREE_PROVIDERS.has(d) && !DISPOSABLE_DOMAINS.has(d) ? d : null;
};

// Waterfall email and phone lookup for contacts the member picked. Existing values are never overwritten.
export async function enrichContacts(org: string, ids: string[], fields: Field[]): Promise<RunSummary> {
  const admin = createAdminClient();
  const { providers, error } = await load(admin, org, "enrich");
  if (error) return { ok: false, message: error };
  if (providers.length === 0) return { ok: false, message: "Add an enrichment provider with a key in Settings, Enrichment." };
  const { data: contacts } = await admin.from("contacts").select("id, email, first_name, last_name, company, phone").eq("organization_id", org).in("id", ids.slice(0, MAX_PER_CLICK));
  const { data: have } = await admin.from("contact_enrichment").select("contact_id, field").eq("organization_id", org).in("contact_id", (contacts ?? []).map((c) => c.id));
  const haveSet = new Set((have ?? []).map((h) => `${h.contact_id}:${h.field}`));
  const results: Json[] = [];
  let calls = 0;
  let skipped = 0;
  let capped = false;
  let contactsWithHits = 0;
  await pool(contacts ?? [], Date.now() + BUDGET_MS, async (c) => {
    const want = fields.filter((f) => (f === "phone" ? !c.phone?.trim() : true) && !haveSet.has(`${c.id}:${f}`));
    const first = c.first_name?.trim() ?? "";
    const last = c.last_name?.trim() ?? "";
    const domain = domainOf(c.email);
    if (want.length === 0 || !first || !last || (!domain && !c.company?.trim())) {
      skipped++;
      return;
    }
    const person: Person = { firstName: first.slice(0, 80), lastName: last.slice(0, 80), company: c.company?.trim().slice(0, 120) || null, domain };
    const chain: WaterfallProvider[] = providers.map((p) => ({
      label: p.label,
      fields: p.row.kind === "hunter" ? ["email"] : ["email", "phone"],
      reserve: async () => {
        const { data } = await admin.rpc("reserve_enrichment_call", { p_org: org });
        return data === true;
      },
      find: (who) => findContact(p.row, p.key, who),
    }));
    const r = await runWaterfall(chain, person, want);
    calls += r.calls;
    capped ||= r.capped;
    let hit = false;
    for (const f of want) {
      const found = r.found[f];
      if (found) {
        results.push({ id: c.id, field: f, value: found.value, source: found.source });
        hit = true;
      }
    }
    if (hit) contactsWithHits++;
  });
  let stored = 0;
  if (results.length) {
    const { data, error: e } = await admin.rpc("set_contact_enrichment", { p_org: org, p_results: results });
    if (e) return { ok: false, message: "Could not store the results." };
    stored = data ?? 0;
  }
  const tail = capped ? " The daily call cap was reached, so some contacts were not tried." : "";
  return { ok: true, message: `Used ${calls} provider calls. Found ${stored} values for ${contactsWithHits} of ${(contacts ?? []).length} contacts, skipped ${skipped} with no name, domain or company.${tail}` };
}

// Asks 2 or 3 verification providers about each picked address and stores the agreed result.
export async function consensusVerify(org: string, ids: string[]): Promise<RunSummary> {
  const admin = createAdminClient();
  const { providers: all, error } = await load(admin, org, "verify");
  if (error) return { ok: false, message: error };
  const providers = all.slice(0, 3);
  if (providers.length < 2) return { ok: false, message: "Consensus needs at least two verification providers with keys. Add them in Settings, Enrichment." };
  const picked = ids.slice(0, MAX_PER_CLICK);
  const { data: first } = await admin.from("contacts").select("id, organization_id, email, verify_status").eq("organization_id", org).in("id", picked);
  // The built-in result is the floor, so contacts without one get it first.
  const fresh = (first ?? []).filter((c) => !c.verify_status);
  if (fresh.length) await verifyTargets(fresh);
  const { data: contacts } = await admin.from("contacts").select("id, email, verify_status").eq("organization_id", org).in("id", picked);
  const results: Json[] = [];
  let calls = 0;
  let capped = false;
  let undecided = 0;
  await pool(contacts ?? [], Date.now() + BUDGET_MS, async (c) => {
    if (c.verify_status === "invalid") return;
    const votes: Vote[] = [];
    for (const p of providers) {
      const { data } = await admin.rpc("reserve_enrichment_call", { p_org: org });
      if (data !== true) {
        capped = true;
        break;
      }
      calls++;
      try {
        votes.push(await verifyEmail(p.row, p.key, c.email));
      } catch {
        votes.push("unknown");
      }
    }
    const d = decide(c.verify_status as BuiltIn, votes);
    if (!d) {
      undecided++;
      return;
    }
    results.push({ id: c.id, email: c.email, status: d.status, votes: d.votes, catch_all: d.catchAll });
  });
  let stored = 0;
  if (results.length) {
    const { data, error: e } = await admin.rpc("set_contact_consensus", { p_org: org, p_results: results });
    if (e) return { ok: false, message: "Could not store the results." };
    stored = data ?? 0;
  }
  const tail = capped ? " The daily call cap was reached, so some contacts were not checked." : "";
  return { ok: true, message: `Used ${calls} provider calls. Stored ${stored} consensus results, ${undecided} had fewer than two clear answers or were already invalid.${tail}` };
}
