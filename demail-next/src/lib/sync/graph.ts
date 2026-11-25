import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { MailAuthError, getAccessToken } from "@/lib/mail/credentials";
import { SyncError, splitReferences, stripHtml, truncate, type Inbound, type SyncMailbox, type SyncResult } from "./types";

const ORIGIN = "https://graph.microsoft.com/";
const START = `${ORIGIN}v1.0/me/mailFolders/inbox/messages/delta`;
const SELECT = "id,conversationId,internetMessageId,subject,from,toRecipients,receivedDateTime,body,uniqueBody,internetMessageHeaders";
const TIMEOUT_MS = 20_000;
const WEEK_MS = 7 * 24 * 3_600_000;

type Address = { emailAddress?: { name?: string; address?: string } };
type GraphMessage = {
  "@removed"?: unknown;
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  subject?: string;
  from?: Address;
  toRecipients?: Address[];
  receivedDateTime?: string;
  body?: { content?: string; contentType?: string };
  uniqueBody?: { content?: string; contentType?: string };
  internetMessageHeaders?: { name: string; value: string }[];
};

function parse(msg: GraphMessage): Inbound {
  const headers = new Map<string, string>();
  for (const h of msg.internetMessageHeaders ?? []) if (!headers.has(h.name.toLowerCase())) headers.set(h.name.toLowerCase(), h.value);
  const content = msg.uniqueBody?.content ?? msg.body?.content ?? "";
  const isHtml = (msg.uniqueBody?.contentType ?? msg.body?.contentType) === "html";
  return {
    providerMessageId: msg.id,
    providerThreadId: msg.conversationId ?? null,
    rfcMessageId: msg.internetMessageId ?? null,
    inReplyTo: splitReferences(headers.get("in-reply-to"))[0] ?? null,
    references: splitReferences(headers.get("references")),
    fromEmail: (msg.from?.emailAddress?.address ?? "").toLowerCase(),
    fromName: msg.from?.emailAddress?.name ?? "",
    to: (msg.toRecipients ?? []).map((r) => (r.emailAddress?.address ?? "").toLowerCase()).filter(Boolean),
    subject: msg.subject ?? "",
    text: truncate(isHtml ? stripHtml(content) : content),
    sentAt: msg.receivedDateTime ? new Date(msg.receivedDateTime) : new Date(),
    contentType: headers.get("content-type") ?? "",
    headers: {
      autoSubmitted: headers.get("auto-submitted"),
      precedence: headers.get("precedence"),
      xAutoreply: headers.get("x-autoreply"),
      xAutoResponseSuppress: headers.get("x-auto-response-suppress"),
    },
  };
}

// Reads the inbox delta; the cursor is the next page link while capped and the deltaLink once caught up.
export async function syncGraph(admin: SupabaseClient<Database>, mailbox: SyncMailbox, cursor: string | null, limit: number): Promise<SyncResult> {
  let token = await getAccessToken(admin, mailbox.id, mailbox.organization_id, "microsoft");
  async function get(url: string): Promise<Response> {
    const call = () =>
      fetch(url, {
        headers: { authorization: `Bearer ${token}`, prefer: `outlook.body-content-type="text", odata.maxpagesize=${Math.min(limit, 50)}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    let res = await call();
    if (res.status === 401) {
      token = await getAccessToken(admin, mailbox.id, mailbox.organization_id, "microsoft", true);
      res = await call();
      if (res.status === 401) throw new MailAuthError();
    }
    return res;
  }
  function initialUrl() {
    const since = new Date(Math.max(new Date(mailbox.created_at).getTime(), Date.now() - WEEK_MS)).toISOString();
    return `${START}?$filter=${encodeURIComponent(`receivedDateTime ge ${since}`)}&$select=${SELECT}`;
  }
  // A stored cursor is only followed when it points at Graph, so the token never leaves for another host.
  let url = cursor && cursor.startsWith(ORIGIN) ? cursor : initialUrl();
  const messages: Inbound[] = [];
  let restarted = false;
  for (;;) {
    const res = await get(url);
    if (res.status === 410 && !restarted) {
      restarted = true;
      url = initialUrl();
      continue;
    }
    if (!res.ok) throw new SyncError(`Microsoft Graph returned HTTP ${res.status}`);
    const body = (await res.json()) as { value?: GraphMessage[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };
    for (const m of body.value ?? []) if (!m["@removed"] && m.id) messages.push(parse(m));
    const next = body["@odata.nextLink"];
    if (!next) {
      if (!body["@odata.deltaLink"]) throw new SyncError("Microsoft Graph returned no delta link");
      return { messages, cursor: body["@odata.deltaLink"] };
    }
    if (messages.length >= limit) return { messages, cursor: next };
    url = next;
  }
}
