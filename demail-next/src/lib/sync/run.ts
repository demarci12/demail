import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mailEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";
import { MailAuthError } from "@/lib/mail/credentials";
import { classify } from "./classify";
import { syncGmail } from "./gmail";
import { syncGraph } from "./graph";
import { matchInbound } from "./match";
import { SyncError, type Inbound } from "./types";

type Admin = SupabaseClient<Database>;
type Mailbox = Database["public"]["Tables"]["mailboxes"]["Row"];

export type SyncTickResult = { claimed: number; synced: number; stored: number; replies: number; bounces: number; failed: number };

const BUDGET_MS = 45_000;
const HOT_MS = 60_000;
const IDLE_MS = 10 * 60_000;

function snippetOf(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

// Stores one matched inbound message and applies its effect; returns the kind stored or null when ignored.
async function ingest(admin: Admin, mailbox: Mailbox, m: Inbound) {
  if (m.fromEmail === mailbox.email.toLowerCase()) return null;
  const match = await matchInbound(admin, mailbox, m);
  if (!match) return null;
  const org = mailbox.organization_id;
  if (match.thread) {
    const { data: dupe } = await admin.from("thread_messages").select("id").eq("thread_id", match.thread.id).eq("provider_message_id", m.providerMessageId).maybeSingle();
    if (dupe) return null;
  }
  const providerThreadId = m.providerThreadId ?? m.providerMessageId;
  const sentAt = m.sentAt.toISOString();
  const lastAt = match.thread && match.thread.last_message_at > sentAt ? match.thread.last_message_at : sentAt;
  const { data: thread, error: threadError } = await admin
    .from("threads")
    .upsert(
      {
        organization_id: org,
        mailbox_id: mailbox.id,
        provider_thread_id: providerThreadId,
        subject: match.thread?.subject ?? m.subject,
        contact_id: match.contactId,
        campaign_id: match.campaignId,
        snippet: snippetOf(m.text),
        last_message_at: lastAt,
        is_unread: true,
        status: "open",
      },
      { onConflict: "mailbox_id,provider_thread_id" },
    )
    .select("id")
    .single();
  if (threadError || !thread) throw new SyncError("Could not store thread");
  const kind = classify(m);
  const { error: insertError } = await admin.from("thread_messages").insert({
    organization_id: org,
    thread_id: thread.id,
    direction: "in",
    kind,
    provider_message_id: m.providerMessageId,
    rfc_message_id: m.rfcMessageId,
    in_reply_to: m.inReplyTo,
    from_email: m.fromEmail,
    from_name: m.fromName,
    to_emails: m.to,
    subject: m.subject,
    body_text: m.text,
    sent_at: sentAt,
  });
  if (insertError) {
    if (insertError.code === "23505") return null;
    throw new SyncError("Could not store message");
  }
  if (match.contactId) {
    if (kind === "reply") {
      await admin.rpc("stop_enrollments_on_reply", { p_org: org, p_contact: match.contactId, p_campaign: match.campaignId ?? undefined });
    } else if (kind === "bounce") {
      const { data: contact } = await admin.from("contacts").select("email").eq("id", match.contactId).eq("organization_id", org).maybeSingle();
      if (contact) {
        const { error } = await admin
          .from("suppressed_recipients")
          .insert({ organization_id: org, email: contact.email, reason: "Delivery failure", source: "bounce", campaign_id: match.campaignId });
        if (error && error.code !== "23505") throw new SyncError("Could not suppress bounced address");
      }
      await admin
        .from("campaign_contacts")
        .update({ status: "stopped", next_send_at: null, stopped_reason: "bounced" })
        .eq("organization_id", org)
        .eq("contact_id", match.contactId)
        .eq("status", "active");
    }
  }
  return kind;
}

// One sync tick: claims due mailboxes and reads new matching mail, within a wall-clock budget.
export async function runSyncTick(opts: { organizationId?: string } = {}): Promise<SyncTickResult> {
  const env = mailEnv();
  const admin = createAdminClient();
  const started = Date.now();
  const result: SyncTickResult = { claimed: 0, synced: 0, stored: 0, replies: 0, bounces: 0, failed: 0 };
  await admin.rpc("refresh_sync_hotness");
  const { data: claimed, error } = await admin.rpc("claim_due_mailbox_syncs", { batch: env.SYNC_BATCH_SIZE, p_org: opts.organizationId });
  if (error) throw new Error(`claim_due_mailbox_syncs failed: ${error.message}`);
  const states = claimed ?? [];
  result.claimed = states.length;
  for (const state of states) {
    // Unprocessed leases expire on their own after five minutes.
    if (Date.now() - started > BUDGET_MS) break;
    const { data: mailbox } = await admin.from("mailboxes").select("*").eq("id", state.mailbox_id).eq("organization_id", state.organization_id).maybeSingle();
    if (!mailbox || mailbox.status !== "active") continue;
    try {
      const sync = mailbox.provider === "google" ? syncGmail : syncGraph;
      const out = await sync(admin, mailbox, state.cursor, env.SYNC_MESSAGES_PER_MAILBOX);
      for (const m of out.messages) {
        // One bad message must not stall the mailbox, so it is skipped and logged.
        const kind = await ingest(admin, mailbox, m).catch(() => {
          console.error("message ingest failed", { mailbox: mailbox.id });
          return null;
        });
        if (!kind) continue;
        result.stored++;
        if (kind === "reply") result.replies++;
        if (kind === "bounce") result.bounces++;
      }
      const now = new Date();
      await admin
        .from("mailbox_sync_state")
        .update({
          cursor: out.cursor,
          last_synced_at: now.toISOString(),
          consecutive_errors: 0,
          next_sync_at: new Date(now.getTime() + (state.hot ? HOT_MS : IDLE_MS)).toISOString(),
        })
        .eq("mailbox_id", state.mailbox_id)
        .eq("organization_id", state.organization_id);
      await admin.from("mailboxes").update({ last_synced_at: now.toISOString(), last_error: null }).eq("id", mailbox.id).eq("organization_id", mailbox.organization_id);
      result.synced++;
    } catch (e) {
      result.failed++;
      // The mailbox is already disconnected and is not claimed again until it is reconnected.
      if (e instanceof MailAuthError) continue;
      const n = state.consecutive_errors + 1;
      await admin
        .from("mailbox_sync_state")
        .update({ consecutive_errors: n, next_sync_at: new Date(Date.now() + Math.min(60, 2 ** n) * 60_000).toISOString() })
        .eq("mailbox_id", state.mailbox_id)
        .eq("organization_id", state.organization_id);
      await admin
        .from("mailboxes")
        .update({ last_error: e instanceof SyncError ? e.message : "Sync failed, retrying" })
        .eq("id", mailbox.id)
        .eq("organization_id", mailbox.organization_id);
      console.error("mailbox sync failed", { mailbox: mailbox.id, reason: e instanceof SyncError ? e.message : e instanceof Error ? e.name : "unknown" });
    }
  }
  return result;
}
