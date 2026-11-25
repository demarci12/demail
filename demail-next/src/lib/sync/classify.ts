import type { Inbound } from "./types";

export type InboundKind = "reply" | "auto_reply" | "bounce";

export function classify(m: Inbound): InboundKind {
  const local = m.fromEmail.split("@")[0]?.toLowerCase() ?? "";
  const type = m.contentType.toLowerCase();
  if (local === "mailer-daemon" || local === "postmaster" || type.includes("delivery-status") || /undeliverable|delivery status notification/i.test(m.subject)) return "bounce";
  const h = m.headers;
  const autoSubmitted = h.autoSubmitted?.trim().toLowerCase();
  const precedence = h.precedence?.trim().toLowerCase();
  if (
    (autoSubmitted && autoSubmitted !== "no") ||
    (precedence && ["bulk", "auto_reply", "junk"].includes(precedence)) ||
    h.xAutoreply !== undefined ||
    h.xAutoResponseSuppress !== undefined ||
    /^\s*(automatic reply|out of office)/i.test(m.subject)
  ) {
    return "auto_reply";
  }
  return "reply";
}
