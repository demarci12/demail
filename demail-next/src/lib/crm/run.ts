import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";
import { openFor } from "@/lib/crypto/secretbox";
import { CrmError, createContact, createNote, searchContactsSince } from "./hubspot";
import { fillBlanks, mapHubSpotContact, millis, replyNoteBody } from "./map";
type Admin = SupabaseClient<Database>;
type Connection = Database["public"]["Tables"]["crm_connections"]["Row"];
export type CrmTickResult = { claimed: number; pulled: number; created: number; pushed: number; failed: number };
const BUDGET_MS = 45_000;
const MAX_PAGES = 5;
const PUSH_BATCH = 25;
const PROVIDER = "hubspot" as const;
// Escapes LIKE wildcards so an address is matched literally and case-insensitively.
const literal = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
async function findContact(admin: Admin, org: string, email: string, caseInsensitive: boolean) {
  const query = admin.from("contacts").select("id, first_name, last_name, company, phone, subscribed").eq("organization_id", org);
  const { data } = await (caseInsensitive ? query.ilike("email", literal(email)) : query.eq("email", email)).limit(1).maybeSingle();
  return data;
}
async function linkContact(admin: Admin, org: string, contactId: string, externalId: string) {
  // A HubSpot id already linked to another contact here raises 23505 and is left as it is.
  const { error } = await admin
    .from("crm_contact_links")
    .upsert({ organization_id: org, provider: PROVIDER, contact_id: contactId, external_id: externalId, synced_at: new Date().toISOString() }, { onConflict: "contact_id,provider" });
  if (error && error.code !== "23505") throw new Error("Could not store contact link");
}
async function pull(admin: Admin, conn: Connection, token: string, result: CrmTickResult, deadline: number) {
  const org = conn.organization_id;
  const cursor = conn.pull_cursor ?? 0;
  let maxMs = cursor;
  let after: string | null = null;
  let pages = 0;
  let fullPages = 0;
  do {
    const page = await searchContactsSince(token, cursor, after);
    pages++;
    if (page.results.length >= 100) fullPages++;
    for (const r of page.results) {
      const ms = millis(r.properties.lastmodifieddate);
      if (ms !== null && ms > maxMs) maxMs = ms;
      const m = mapHubSpotContact(r.properties);
      if (!m) continue;
      result.pulled++;
      let contact = await findContact(admin, org, m.email, false);
      let created = false;
      if (!contact) {
        const { data, error } = await admin
          .from("contacts")
          .insert({ organization_id: org, email: m.email, first_name: m.first_name, last_name: m.last_name, company: m.company, phone: m.phone, subscribed: !m.optedOut })
          .select("id, first_name, last_name, company, phone, subscribed")
          .single();
        if (error && error.code !== "23505") throw new Error("Could not create contact");
        if (data) {
          contact = data;
          created = true;
          result.created++;
          if (conn.label_id) {
            const { error: labelError } = await admin.from("contact_labels").insert({ organization_id: org, contact_id: data.id, label_id: conn.label_id });
            if (labelError && labelError.code !== "23505") throw new Error("Could not label contact");
          }
        } else {
          contact = await findContact(admin, org, m.email, true);
        }
      }
      if (!contact) continue;
      if (!created) {
        const patch: Database["public"]["Tables"]["contacts"]["Update"] = fillBlanks(contact, m);
        // An opt-out in HubSpot unsubscribes here; nothing ever subscribes a contact again.
        if (m.optedOut && contact.subscribed) patch.subscribed = false;
        if (Object.keys(patch).length > 0) {
          const { error } = await admin.from("contacts").update(patch).eq("id", contact.id).eq("organization_id", org);
          if (error) throw new Error("Could not update contact");
        }
      }
      await linkContact(admin, org, contact.id, r.id);
    }
    after = page.after;
  } while (after && pages < MAX_PAGES && Date.now() < deadline);
  // More than a tick of contacts share one timestamp: step past it (documented limit).
  const pullCursor = maxMs > cursor ? maxMs : fullPages === MAX_PAGES ? cursor + 1 : conn.pull_cursor;
  return { pullCursor, morePending: !!after };
}
async function push(admin: Admin, conn: Connection, token: string, result: CrmTickResult, deadline: number) {
  const org = conn.organization_id;
  const { data: messages, error } = await admin
    .from("thread_messages")
    .select("id, thread_id, from_email, subject, body_text, sent_at, created_at")
    .eq("organization_id", org)
    .eq("direction", "in")
    .eq("kind", "reply")
    .gt("created_at", conn.push_cursor)
    .order("created_at")
    .limit(PUSH_BATCH);
  if (error) throw new Error("Could not read replies");
  const rows = messages ?? [];
  if (rows.length === 0) return false;
  const { data: threads } = await admin.from("threads").select("id, contact_id, campaign_id, subject").eq("organization_id", org).in("id", [...new Set(rows.map((m) => m.thread_id))]);
  const threadById = new Map((threads ?? []).map((t) => [t.id, t]));
  const contactIds = [...new Set((threads ?? []).map((t) => t.contact_id).filter((id): id is string => !!id))];
  const campaignIds = [...new Set((threads ?? []).map((t) => t.campaign_id).filter((id): id is string => !!id))];
  const [{ data: contacts }, { data: campaigns }, { data: links }] = await Promise.all([
    contactIds.length
      ? admin.from("contacts").select("id, email, first_name, last_name, company, phone").eq("organization_id", org).in("id", contactIds)
      : Promise.resolve({ data: [] as { id: string; email: string; first_name: string | null; last_name: string | null; company: string | null; phone: string | null }[] }),
    campaignIds.length
      ? admin.from("campaigns").select("id, name").eq("organization_id", org).in("id", campaignIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    contactIds.length
      ? admin.from("crm_contact_links").select("contact_id, external_id").eq("organization_id", org).eq("provider", PROVIDER).in("contact_id", contactIds)
      : Promise.resolve({ data: [] as { contact_id: string; external_id: string }[] }),
  ]);
  const contactById = new Map((contacts ?? []).map((c) => [c.id, c]));
  const campaignName = new Map((campaigns ?? []).map((c) => [c.id, c.name]));
  const external = new Map((links ?? []).map((l) => [l.contact_id, l.external_id]));
  for (const m of rows) {
    if (Date.now() >= deadline) return true;
    const thread = threadById.get(m.thread_id);
    const contact = thread?.contact_id ? contactById.get(thread.contact_id) : undefined;
    if (thread && contact) {
      let externalId = external.get(contact.id);
      if (!externalId) {
        externalId = await createContact(token, {
          email: contact.email,
          firstname: contact.first_name,
          lastname: contact.last_name,
          company: contact.company,
          phone: contact.phone,
        });
        await linkContact(admin, org, contact.id, externalId);
        external.set(contact.id, externalId);
      }
      await createNote(token, externalId, {
        timestamp: m.sent_at,
        body: replyNoteBody({
          subject: m.subject ?? thread.subject,
          fromEmail: m.from_email,
          campaignName: thread.campaign_id ? (campaignName.get(thread.campaign_id) ?? null) : null,
          body: m.body_text,
        }),
      });
      result.pushed++;
    }
    // Advance after each note so a crash repeats at most one.
    const { error: cursorError } = await admin.from("crm_connections").update({ push_cursor: m.created_at }).eq("organization_id", org).eq("provider", PROVIDER);
    if (cursorError) throw new Error("Could not advance push cursor");
  }
  return rows.length === PUSH_BATCH;
}
// One CRM tick: claims due HubSpot connections, pulls changed contacts and pushes new replies as notes.
export async function runCrmTick(opts: { organizationId?: string } = {}): Promise<CrmTickResult> {
  const admin = createAdminClient();
  const deadline = Date.now() + BUDGET_MS;
  const result: CrmTickResult = { claimed: 0, pulled: 0, created: 0, pushed: 0, failed: 0 };
  const { data: claimed, error } = await admin.rpc("claim_due_crm_syncs", { batch: 5, p_org: opts.organizationId });
  if (error) throw new Error("claim_due_crm_syncs failed");
  const connections = claimed ?? [];
  result.claimed = connections.length;
  for (const conn of connections) {
    const org = conn.organization_id;
    if (Date.now() >= deadline) {
      await admin.from("crm_connections").update({ lease_until: null }).eq("organization_id", org).eq("provider", PROVIDER);
      continue;
    }
    try {
      const { data: cred } = await admin.from("crm_credentials").select("ciphertext").eq("organization_id", org).eq("provider", PROVIDER).maybeSingle();
      if (!cred) throw new Error("missing credentials");
      const token = openFor("crm-token", cred.ciphertext);
      let pullCursor = conn.pull_cursor;
      let morePending = false;
      if (conn.pull_contacts) ({ pullCursor, morePending } = await pull(admin, conn, token, result, deadline));
      const pushFull = conn.push_replies ? await push(admin, conn, token, result, deadline) : false;
      const now = Date.now();
      await admin
        .from("crm_connections")
        .update({
          lease_until: null,
          last_synced_at: new Date(now).toISOString(),
          last_error: null,
          consecutive_errors: 0,
          pull_cursor: pullCursor,
          next_sync_at: new Date(now + (morePending || pushFull ? 1 : 15) * 60_000).toISOString(),
        })
        .eq("organization_id", org)
        .eq("provider", PROVIDER);
    } catch (e) {
      result.failed++;
      const n = conn.consecutive_errors + 1;
      const code = e instanceof CrmError ? e.code : "error";
      console.error("crm sync failed", { organization: org, code });
      await admin
        .from("crm_connections")
        .update({
          consecutive_errors: n,
          last_error: e instanceof CrmError ? e.message : "Sync failed, retrying",
          next_sync_at: new Date(Date.now() + Math.min(60, 2 ** n) * 60_000).toISOString(),
          lease_until: null,
        })
        .eq("organization_id", org)
        .eq("provider", PROVIDER);
    }
  }
  return result;
}
