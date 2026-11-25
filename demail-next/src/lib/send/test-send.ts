import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { escapeHtml } from "@/lib/merge";
import { linkifyPlain } from "@/lib/tracking/rewrite";
import { MailAuthError } from "@/lib/mail/credentials";
import { sendThrough } from "@/lib/mail/send";
import type { SendOutcome } from "@/lib/mail/types";
type Mailbox = Database["public"]["Tables"]["mailboxes"]["Row"];
// A test of a saved step: no tracking, no messages row, and unsubscribe links that verify for no contact.
export async function sendStepTest(
  admin: SupabaseClient<Database>,
  mailbox: Mailbox,
  input: { to: string; subject: string; text: string; testKey: string; baseUrl: string },
): Promise<SendOutcome> {
  if (mailbox.status !== "active") return { ok: false, retryable: false, message: "This mailbox is not active" };
  const to = input.to.trim().toLowerCase();
  const { data: suppressed } = await admin.from("suppressed_recipients").select("id, expires_at").eq("organization_id", mailbox.organization_id).eq("email", to);
  if ((suppressed ?? []).some((s) => !s.expires_at || new Date(s.expires_at) > new Date())) return { ok: false, retryable: false, message: "That address is on the suppression list" };
  const base = input.baseUrl.replace(/\/$/, "");
  const link = `${base}/unsubscribe/preview`;
  const sigPlain = mailbox.signature_plain ? `\n\n${mailbox.signature_plain}` : "";
  const name = mailbox.from_name.replace(/["<>\r\n]/g, "").trim();
  try {
    return await sendThrough(admin, mailbox, {
      from: name ? `${name} <${mailbox.email}>` : mailbox.email,
      to,
      replyTo: mailbox.reply_to,
      subject: `[Test] ${input.subject}`,
      text: `${input.text}${sigPlain}\n\n--\nTo stop receiving these emails: ${link}`,
      html: `${linkifyPlain(input.text + sigPlain, null)}<p style="font-size:12px;color:#64748b"><a href="${escapeHtml(link)}">Unsubscribe</a></p>`,
      unsubscribeUrl: link,
      oneClickUrl: `${base}/api/unsubscribe/preview`,
      // Resend drops a second click inside the same minute.
      idempotencyKey: `test:${input.testKey}:${Math.floor(Date.now() / 60000)}`,
    });
  } catch (e) {
    if (e instanceof MailAuthError) return { ok: false, retryable: false, message: "Reconnect this mailbox first" };
    return { ok: false, retryable: true, message: "Could not reach the mail provider" };
  }
}
