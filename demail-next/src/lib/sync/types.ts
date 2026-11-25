export type InboundHeaders = {
  autoSubmitted?: string;
  precedence?: string;
  xAutoreply?: string;
  xAutoResponseSuppress?: string;
};
export type Inbound = {
  providerMessageId: string;
  providerThreadId: string | null;
  rfcMessageId: string | null;
  inReplyTo: string | null;
  references: string[];
  fromEmail: string;
  fromName: string;
  to: string[];
  subject: string;
  text: string;
  sentAt: Date;
  contentType: string;
  headers: InboundHeaders;
};
export type SyncResult = { messages: Inbound[]; cursor: string };
export type SyncMailbox = { id: string; organization_id: string; created_at: string };
// Messages are safe to store and show in last_error: they never carry provider response bodies.
export class SyncError extends Error {}
export const MAX_BODY_BYTES = 100 * 1024;
export function truncate(text: string) {
  const buf = Buffer.from(text, "utf8");
  return buf.length <= MAX_BODY_BYTES ? text : buf.subarray(0, MAX_BODY_BYTES).toString("utf8");
}
export function stripHtml(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}
export function splitReferences(value: string | undefined | null) {
  return (value ?? "").match(/<[^<>\s]+>/g) ?? [];
}
