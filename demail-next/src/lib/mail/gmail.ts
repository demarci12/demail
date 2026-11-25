import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { MailAuthError, getAccessToken } from "./credentials";
import { buildMime } from "./mime";
import { failFromStatus, type OutgoingMail, type SendOutcome } from "./types";

type Mailbox = Database["public"]["Tables"]["mailboxes"]["Row"];
const API = "https://gmail.googleapis.com/gmail/v1/users/me/messages";
const TIMEOUT_MS = 20_000;

export async function sendGmail(admin: SupabaseClient<Database>, mailbox: Mailbox, mail: OutgoingMail): Promise<SendOutcome> {
  const domain = mailbox.email.split("@")[1] ?? "localhost";
  const { raw, messageId } = buildMime(mail, domain);
  const body = JSON.stringify({ raw: Buffer.from(raw).toString("base64url"), ...(mail.thread ? { threadId: mail.thread.providerThreadId } : {}) });
  const call = (token: string, url: string, init?: RequestInit) =>
    fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  try {
    let token = await getAccessToken(admin, mailbox.id, mailbox.organization_id, "google");
    let res = await call(token, `${API}/send`, { method: "POST", body });
    if (res.status === 401) {
      token = await getAccessToken(admin, mailbox.id, mailbox.organization_id, "google", true);
      res = await call(token, `${API}/send`, { method: "POST", body });
      if (res.status === 401) throw new MailAuthError();
    }
    if (!res.ok) return failFromStatus("Gmail", res.status);
    const sent = (await res.json()) as { id?: string; threadId?: string };
    if (!sent.id) return { ok: false, retryable: false, message: "Gmail returned no message id" };
    let rfcMessageId = messageId;
    try {
      const meta = await call(token, `${API}/${encodeURIComponent(sent.id)}?format=metadata&metadataHeaders=Message-ID`);
      if (meta.ok) {
        const data = (await meta.json()) as { payload?: { headers?: { name: string; value: string }[] } };
        const header = data.payload?.headers?.find((h) => h.name.toLowerCase() === "message-id");
        if (header?.value) rfcMessageId = header.value;
      }
    } catch {
      // The generated Message-ID is used when the lookup fails.
    }
    return { ok: true, id: sent.id, providerThreadId: sent.threadId, rfcMessageId };
  } catch (e) {
    if (e instanceof MailAuthError) throw e;
    return { ok: false, retryable: true, message: "Network error calling Gmail" };
  }
}
