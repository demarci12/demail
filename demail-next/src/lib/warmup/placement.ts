import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { MailAuthError, getAccessToken } from "@/lib/mail/credentials";
type Admin = SupabaseClient<Database>;
type Target = { id: string; organization_id: string; provider: string };
export type Placement = "inbox" | "spam" | "other";
export type Found = { providerMessageId: string; providerThreadId: string | null; placement: Placement };
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const GRAPH = "https://graph.microsoft.com/v1.0/me";
const TIMEOUT_MS = 20_000;
const folderIds = new Map<string, { inbox: string; junk: string }>();
// Calls a provider API with one forced token refresh on 401, then treats the credentials as revoked.
async function authed(admin: Admin, mailbox: Target, provider: "google" | "microsoft", url: string, init?: RequestInit): Promise<Response> {
  let token = await getAccessToken(admin, mailbox.id, mailbox.organization_id, provider);
  const call = () => fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  let res = await call();
  if (res.status === 401) {
    token = await getAccessToken(admin, mailbox.id, mailbox.organization_id, provider, true);
    res = await call();
    if (res.status === 401) throw new MailAuthError();
  }
  return res;
}
async function findGmail(admin: Admin, mailbox: Target, rfcMessageId: string): Promise<Found | null> {
  const id = rfcMessageId.replace(/^<|>$/g, "");
  const list = await authed(admin, mailbox, "google", `${GMAIL}/messages?q=${encodeURIComponent(`rfc822msgid:${id}`)}&includeSpamTrash=true&maxResults=1`);
  if (!list.ok) throw new Error(`Gmail search returned HTTP ${list.status}`);
  const found = ((await list.json()) as { messages?: { id: string }[] }).messages?.[0];
  if (!found) return null;
  const res = await authed(admin, mailbox, "google", `${GMAIL}/messages/${encodeURIComponent(found.id)}?format=minimal`);
  if (!res.ok) throw new Error(`Gmail read returned HTTP ${res.status}`);
  const msg = (await res.json()) as { id: string; threadId?: string; labelIds?: string[] };
  const labels = msg.labelIds ?? [];
  const placement: Placement = labels.includes("SPAM") ? "spam" : labels.includes("INBOX") ? "inbox" : "other";
  return { providerMessageId: msg.id, providerThreadId: msg.threadId ?? null, placement };
}
async function folders(admin: Admin, mailbox: Target) {
  const cached = folderIds.get(mailbox.id);
  if (cached) return cached;
  const get = async (name: string) => {
    const res = await authed(admin, mailbox, "microsoft", `${GRAPH}/mailFolders/${name}?$select=id`);
    if (!res.ok) throw new Error(`Microsoft Graph folder lookup returned HTTP ${res.status}`);
    return ((await res.json()) as { id: string }).id;
  };
  const value = { inbox: await get("inbox"), junk: await get("junkemail") };
  folderIds.set(mailbox.id, value);
  return value;
}
async function findGraph(admin: Admin, mailbox: Target, rfcMessageId: string): Promise<Found | null> {
  const filter = encodeURIComponent(`internetMessageId eq '${rfcMessageId.replace(/'/g, "''")}'`);
  const res = await authed(admin, mailbox, "microsoft", `${GRAPH}/messages?$filter=${filter}&$select=id,conversationId,parentFolderId&$top=1`);
  if (!res.ok) throw new Error(`Microsoft Graph search returned HTTP ${res.status}`);
  const msg = ((await res.json()) as { value?: { id: string; conversationId?: string; parentFolderId?: string }[] }).value?.[0];
  if (!msg) return null;
  const { inbox, junk } = await folders(admin, mailbox);
  const placement: Placement = msg.parentFolderId === junk ? "spam" : msg.parentFolderId === inbox ? "inbox" : "other";
  return { providerMessageId: msg.id, providerThreadId: msg.conversationId ?? null, placement };
}
// Looks for the message in the recipient mailbox, spam and trash included; null while it has not arrived.
export async function findInRecipient(admin: Admin, recipient: Target, rfcMessageId: string): Promise<Found | null> {
  if (recipient.provider === "google") return findGmail(admin, recipient, rfcMessageId);
  if (recipient.provider === "microsoft") return findGraph(admin, recipient, rfcMessageId);
  return null;
}
// Microsoft only: Gmail would need the gmail.modify scope, which Demail does not request. Returns the moved message id.
export async function rescueFromSpam(admin: Admin, recipient: Target, providerMessageId: string): Promise<string | null> {
  if (recipient.provider !== "microsoft") return null;
  const res = await authed(admin, recipient, "microsoft", `${GRAPH}/messages/${encodeURIComponent(providerMessageId)}/move`, {
    method: "POST",
    body: JSON.stringify({ destinationId: "inbox" }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { id?: string }).id ?? providerMessageId;
}
