import "server-only";
import { Resend } from "resend";
import { serverEnv } from "@/lib/env";
export type OutgoingMail = {
  from: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  html?: string;
  unsubscribeUrl: string;
  idempotencyKey: string;
};
export type SendOutcome =
  | { ok: true; id: string }
  | { ok: false; retryable: boolean; message: string };
let client: Resend | null = null;
// Every mail carries List-Unsubscribe and the RFC 8058 one-click header.
export async function sendMail(mail: OutgoingMail): Promise<SendOutcome> {
  client ??= new Resend(serverEnv().RESEND_API_KEY);
  try {
    const { data, error } = await client.emails.send(
      {
        from: mail.from,
        to: [mail.to],
        replyTo: mail.replyTo ?? undefined,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        headers: {
          "List-Unsubscribe": `<${mail.unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      },
      { idempotencyKey: mail.idempotencyKey },
    );
    if (error || !data) {
      const code = error?.statusCode ?? null;
      const retryable = code === null || code === 429 || code >= 500 || error?.name === "concurrent_idempotent_requests";
      return { ok: false, retryable, message: error?.message ?? "Resend returned no id" };
    }
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, retryable: true, message: e instanceof Error ? e.message : "Network error" };
  }
}
