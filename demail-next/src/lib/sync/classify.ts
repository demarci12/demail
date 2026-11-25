import type { Inbound } from "./types";

export type InboundKind = "reply" | "auto_reply" | "bounce";

export function classify(m: Inbound): InboundKind {
  const local = m.fromEmail.split("@")[0]?.toLowerCase() ?? "";
  const type = m.contentType.toLowerCase();
  // Delay and warning notices are not failures, so they never suppress.
  const delay = /\(delay\)|\bdelay(ed)?\b|\bwarning\b|still trying/i.test(m.subject);
  const dsn = local === "mailer-daemon" || local === "postmaster" || type.includes("delivery-status") || /undeliverable|delivery status notification|mail delivery failed|returned mail/i.test(m.subject);
  if (dsn && delay) return "auto_reply";
  if (dsn) return "bounce";
  const h = m.headers;
  const autoSubmitted = h.autoSubmitted?.trim().toLowerCase();
  const precedence = h.precedence?.trim().toLowerCase();
  if (
    (autoSubmitted && autoSubmitted !== "no") ||
    (precedence && ["bulk", "auto_reply", "junk"].includes(precedence)) ||
    h.xAutoreply !== undefined ||
    /\b(oof|autoreply)\b/i.test(h.xAutoResponseSuppress ?? "") ||
    /^\s*(automatic reply|out of office)/i.test(m.subject)
  ) {
    return "auto_reply";
  }
  return "reply";
}
