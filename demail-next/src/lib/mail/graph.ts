import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { escapeHtml } from "@/lib/merge";
import { MailAuthError, getAccessToken } from "./credentials";
import { parseAddress } from "./mime";
import { failFromStatus, type OutgoingMail, type SendOutcome } from "./types";

type Mailbox = Database["public"]["Tables"]["mailboxes"]["Row"];
const API = "https://graph.microsoft.com/v1.0/me";
const TIMEOUT_MS = 20_000;
const MAX_RETRY_AFTER_MS = 5 * 60_000;

type Draft = { id?: string; conversationId?: string; internetMessageId?: string };

// Graph accepts only x- custom headers, so no List-Unsubscribe is sent here; the footer link and suppression remain.
export async function sendGraph(admin: SupabaseClient<Database>, mailbox: Mailbox, mail: OutgoingMail): Promise<SendOutcome> {
  const from = parseAddress(mail.from);
  const message = {
    subject: mail.subject.replace(/[\u0000-\u001f\u007f]+/g, " ").trim(),
    body: { contentType: "HTML", content: mail.html ?? `<div style="white-space:pre-wrap">${escapeHtml(mail.text)}</div>` },
    toRecipients: [{ emailAddress: { address: mail.to } }],
    ...(mail.replyTo ? { replyTo: [{ emailAddress: { address: parseAddress(mail.replyTo).address } }] } : {}),
  };
  let token = "";
  const call = (path: string, init?: RequestInit) =>
    fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  // One forced token refresh on 401, then the credentials are treated as revoked.
  async function request(path: string, init?: RequestInit) {
    let res = await call(path, init);
    if (res.status === 401) {
      token = await getAccessToken(admin, mailbox.id, mailbox.organization_id, "microsoft", true);
      res = await call(path, init);
      if (res.status === 401) throw new MailAuthError();
    }
    return res;
  }
  const fail = (res: Response) => {
    const seconds = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : undefined;
    return failFromStatus("Microsoft Graph", res.status, res.status === 429 ? wait : undefined);
  };
  try {
    token = await getAccessToken(admin, mailbox.id, mailbox.organization_id, "microsoft");
    let draft: Draft;
    if (mail.thread?.inReplyToRfcId) {
      const filter = encodeURIComponent(`internetMessageId eq '${mail.thread.inReplyToRfcId.replace(/'/g, "''")}'`);
      const found = await request(`/messages?$filter=${filter}&$select=id&$top=1`);
      if (!found.ok) return fail(found);
      const prevId = ((await found.json()) as { value?: { id: string }[] }).value?.[0]?.id;
      if (!prevId) return { ok: false, retryable: true, message: "Previous message not found in the mailbox yet" };
      const reply = await request(`/messages/${encodeURIComponent(prevId)}/createReply`, { method: "POST", body: "{}" });
      if (!reply.ok) return fail(reply);
      draft = (await reply.json()) as Draft;
      if (!draft.id) return { ok: false, retryable: false, message: "Microsoft Graph returned no draft id" };
      const patched = await request(`/messages/${encodeURIComponent(draft.id)}`, { method: "PATCH", body: JSON.stringify(message) });
      if (!patched.ok) return fail(patched);
    } else {
      const created = await request("/messages", {
        method: "POST",
        body: JSON.stringify({ ...message, ...(from.name ? { from: { emailAddress: { name: from.name, address: from.address } } } : {}) }),
      });
      if (!created.ok) return fail(created);
      draft = (await created.json()) as Draft;
      if (!draft.id) return { ok: false, retryable: false, message: "Microsoft Graph returned no draft id" };
    }
    const sent = await request(`/messages/${encodeURIComponent(draft.id)}/send`, { method: "POST" });
    if (!sent.ok) return fail(sent);
    return { ok: true, id: draft.id, providerThreadId: draft.conversationId, rfcMessageId: draft.internetMessageId };
  } catch (e) {
    if (e instanceof MailAuthError) throw e;
    return { ok: false, retryable: true, message: "Network error calling Microsoft Graph" };
  }
}
