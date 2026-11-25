import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Inbound } from "./types";

export type Match = {
  thread: { id: string; subject: string | null; last_message_at: string } | null;
  contactId: string | null;
  campaignId: string | null;
};

// Ties an inbound message to our own mail: provider thread first, then In-Reply-To or References. No match means ignore it.
export async function matchInbound(admin: SupabaseClient<Database>, mailbox: { id: string; organization_id: string }, m: Inbound): Promise<Match | null> {
  let thread: Match["thread"] = null;
  let contactId: string | null = null;
  let campaignId: string | null = null;
  let matched = false;
  if (m.providerThreadId) {
    const { data: t } = await admin
      .from("threads")
      .select("id, subject, last_message_at, contact_id, campaign_id")
      .eq("mailbox_id", mailbox.id)
      .eq("organization_id", mailbox.organization_id)
      .eq("provider_thread_id", m.providerThreadId)
      .maybeSingle();
    if (t) {
      thread = { id: t.id, subject: t.subject, last_message_at: t.last_message_at };
      contactId = t.contact_id;
      campaignId = t.campaign_id;
      matched = true;
    }
    if (!contactId) {
      const { data: sent } = await admin
        .from("messages")
        .select("contact_id, campaign_id")
        .eq("mailbox_id", mailbox.id)
        .eq("organization_id", mailbox.organization_id)
        .eq("provider_thread_id", m.providerThreadId)
        .limit(1)
        .maybeSingle();
      if (sent) {
        contactId = sent.contact_id;
        campaignId = sent.campaign_id;
        matched = true;
      }
    }
  }
  if (!matched) {
    const ids = [m.inReplyTo, ...m.references].filter((id): id is string => !!id);
    if (ids.length === 0) return null;
    const { data: sent } = await admin
      .from("messages")
      .select("contact_id, campaign_id")
      .eq("mailbox_id", mailbox.id)
      .eq("organization_id", mailbox.organization_id)
      .in("rfc_message_id", ids)
      .limit(1)
      .maybeSingle();
    if (!sent) return null;
    contactId = sent.contact_id;
    campaignId = sent.campaign_id;
  }
  return { thread, contactId, campaignId };
}
