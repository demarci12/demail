import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { MailAuthError, getAccessToken } from "@/lib/mail/credentials";
import { parseAddress } from "@/lib/mail/mime";
import { SyncError, splitReferences, stripHtml, truncate, type Inbound, type SyncMailbox, type SyncResult } from "./types";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TIMEOUT_MS = 20_000;

type Part = { mimeType?: string; headers?: { name: string; value: string }[]; body?: { data?: string }; parts?: Part[] };
type Full = { id: string; threadId?: string; internalDate?: string; payload?: Part };
type History = { id: string; messagesAdded?: { message: { id: string } }[] };

function findPart(part: Part | undefined, type: string): string | null {
  if (!part) return null;
  if (part.mimeType === type && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
  for (const child of part.parts ?? []) {
    const found = findPart(child, type);
    if (found !== null) return found;
  }
  return null;
}

function parse(msg: Full): Inbound {
  const headers = new Map<string, string>();
  for (const h of msg.payload?.headers ?? []) if (!headers.has(h.name.toLowerCase())) headers.set(h.name.toLowerCase(), h.value);
  const from = parseAddress(headers.get("from") ?? "");
  const plain = findPart(msg.payload, "text/plain");
  const html = plain === null ? findPart(msg.payload, "text/html") : null;
  const inReplyTo = splitReferences(headers.get("in-reply-to"))[0] ?? null;
  return {
    providerMessageId: msg.id,
    providerThreadId: msg.threadId ?? null,
    rfcMessageId: splitReferences(headers.get("message-id"))[0] ?? null,
    inReplyTo,
    references: splitReferences(headers.get("references")),
    fromEmail: from.address.toLowerCase(),
    fromName: from.name,
    to: (headers.get("to") ?? "").split(",").map((v) => parseAddress(v.trim()).address.toLowerCase()).filter(Boolean),
    subject: headers.get("subject") ?? "",
    text: truncate(plain ?? (html ? stripHtml(html) : "")),
    sentAt: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
    contentType: msg.payload?.mimeType ?? "",
    headers: {
      autoSubmitted: headers.get("auto-submitted"),
      precedence: headers.get("precedence"),
      xAutoreply: headers.get("x-autoreply"),
      xAutoResponseSuppress: headers.get("x-auto-response-suppress"),
    },
  };
}

// Reads new inbox mail since the stored historyId; the first run only stores the current historyId.
export async function syncGmail(admin: SupabaseClient<Database>, mailbox: SyncMailbox, cursor: string | null, limit: number): Promise<SyncResult> {
  let token = await getAccessToken(admin, mailbox.id, mailbox.organization_id, "google");
  // One forced refresh on 401, then the credentials are treated as revoked.
  async function get(path: string): Promise<Response> {
    const call = () => fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    let res = await call();
    if (res.status === 401) {
      token = await getAccessToken(admin, mailbox.id, mailbox.organization_id, "google", true);
      res = await call();
      if (res.status === 401) throw new MailAuthError();
    }
    return res;
  }
  async function profileHistoryId() {
    const res = await get("/profile");
    if (!res.ok) throw new SyncError(`Gmail returned HTTP ${res.status}`);
    const id = ((await res.json()) as { historyId?: string }).historyId;
    if (!id) throw new SyncError("Gmail returned no history id");
    return id;
  }
  async function fetchMessages(ids: string[]) {
    const out: Inbound[] = [];
    for (const id of ids) {
      const res = await get(`/messages/${encodeURIComponent(id)}?format=full`);
      if (res.status === 404) continue;
      if (!res.ok) throw new SyncError(`Gmail returned HTTP ${res.status}`);
      out.push(parse((await res.json()) as Full));
    }
    return out;
  }
  if (!cursor) return { messages: [], cursor: await profileHistoryId() };

  const ids: string[] = [];
  let latest = cursor;
  let page: string | undefined;
  let capped = false;
  do {
    const qs = `startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded&labelId=INBOX${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`;
    const res = await get(`/history?${qs}`);
    if (res.status === 404) {
      // The stored historyId expired: restart from now and look back two days once.
      const fresh = await profileHistoryId();
      const list = await get(`/messages?q=${encodeURIComponent("in:inbox newer_than:2d")}&maxResults=${limit}`);
      if (!list.ok) throw new SyncError(`Gmail returned HTTP ${list.status}`);
      const found = ((await list.json()) as { messages?: { id: string }[] }).messages ?? [];
      return { messages: await fetchMessages(found.map((m) => m.id)), cursor: fresh };
    }
    if (!res.ok) throw new SyncError(`Gmail returned HTTP ${res.status}`);
    const body = (await res.json()) as { history?: History[]; nextPageToken?: string; historyId?: string };
    for (const record of body.history ?? []) {
      const added = (record.messagesAdded ?? []).map((a) => a.message.id).filter((id) => !ids.includes(id));
      if (ids.length > 0 && ids.length + added.length > limit) {
        capped = true;
        break;
      }
      ids.push(...added);
      latest = record.id;
    }
    if (capped) break;
    if (!body.nextPageToken && body.historyId) latest = body.historyId;
    page = body.nextPageToken;
  } while (page);
  return { messages: await fetchMessages(ids), cursor: latest };
}
