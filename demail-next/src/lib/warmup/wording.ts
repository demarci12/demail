export const WARMUP_LIBRARY_FLOOR = 48;

const REFUSED: { pattern: RegExp; reason: string }[] = [
  { pattern: /warm[\s-]?up|warming\s+up/i, reason: "mentions warming" },
  {
    pattern: /\b(test|sample|dummy|placeholder)\s+(e-?mail|message)/i,
    reason: "describes itself as a test",
  },
  { pattern: /automated|auto-?generated/i, reason: "mentions automation" },
  { pattern: /generated\s+(by|message)/i, reason: "mentions generation" },
  { pattern: /simulat/i, reason: "mentions simulation" },
  { pattern: /diagnostic/i, reason: "mentions diagnostics" },
  { pattern: /hypothetical/i, reason: "mentions hypotheticals" },
  { pattern: /fictional/i, reason: "mentions fiction" },
  { pattern: /lorem\s+ipsum/i, reason: "contains filler text" },
  { pattern: /demail/i, reason: "mentions the product" },
  { pattern: /do\s+not\s+reply/i, reason: "carries a do-not-reply notice" },
  { pattern: /unsubscribe/i, reason: "mentions unsubscribing" },
];

export function validateWarmupWording(
  text: string,
): { ok: true } | { ok: false; reason: string } {
  for (const rule of REFUSED) {
    if (rule.pattern.test(text)) return { ok: false, reason: rule.reason };
  }
  return { ok: true };
}
