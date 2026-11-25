export type MailThread = {
  providerThreadId: string;
  inReplyToRfcId: string | null;
  references: string[];
};

export type OutgoingMail = {
  from: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  html?: string;
  unsubscribeUrl: string;
  oneClickUrl: string;
  idempotencyKey: string;
  thread?: MailThread;
};

export type SendOutcome =
  | { ok: true; id: string; providerThreadId?: string; rfcMessageId?: string }
  | { ok: false; retryable: boolean; message: string; retryAfterMs?: number };

// Maps a provider HTTP status to an outcome without echoing the response body.
export function failFromStatus(service: string, status: number, retryAfterMs?: number): Extract<SendOutcome, { ok: false }> {
  const retryable = status === 408 || status === 429 || status >= 500;
  return { ok: false, retryable, message: `${service} returned HTTP ${status}`, retryAfterMs };
}
