// Pure helpers for campaign rules and winner promotion; no imports so check scripts can load this file directly.
export const RULE_TRIGGERS = ["reply_intent", "meeting", "link_click"] as const;
export type RuleTrigger = (typeof RULE_TRIGGERS)[number];
export const RULE_TRIGGER_LABELS: Record<RuleTrigger, string> = {
  reply_intent: "A reply is classified as",
  meeting: "A reply asks for a meeting",
  link_click: "A link is clicked",
};
// 'unsubscribe' is left out on purpose: those contacts are suppressed, never moved.
export const RULE_INTENTS = ["interested", "meeting", "question", "not_interested", "out_of_office", "referral", "other"] as const;
export type RuleIntent = (typeof RULE_INTENTS)[number];
export const RULE_INTENT_LABELS: Record<RuleIntent, string> = {
  interested: "Interested",
  meeting: "Wants a meeting",
  question: "Has a question",
  not_interested: "Not interested",
  out_of_office: "Out of office",
  referral: "Refers someone else",
  other: "Other",
};
export const RULE_OUTCOME_LABELS: Record<string, string> = {
  moved: "Moved",
  skipped_blocked: "Skipped (unsubscribed, suppressed or invalid address)",
  skipped_limit: "Skipped (already moved 3 times in 30 days)",
  skipped_already_enrolled: "Skipped (already in the target campaign)",
  skipped_target: "Skipped (target campaign is completed or gone)",
  skipped_step: "Skipped (not at an earlier step, or stopped for another reason)",
};
export type PromotionRow = { label: string; sent: number; replied: number };
export type PromotionState = {
  reason: "one_variant" | "sample" | "no_clear_winner" | "winner";
  winner?: string;
  z?: number;
  min_sample: number;
  rows: PromotionRow[];
};
export const PROMOTION_Z = 1.96;
// Reads the jsonb the database returns; anything unexpected becomes null so the page shows no verdict.
export function parsePromotion(raw: unknown): PromotionState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const reasons = ["one_variant", "sample", "no_clear_winner", "winner"];
  if (typeof o.reason !== "string" || !reasons.includes(o.reason) || !Array.isArray(o.rows)) return null;
  const rows: PromotionRow[] = [];
  for (const r of o.rows) {
    const x = r as Record<string, unknown>;
    if (typeof x?.label !== "string" || !/^[A-Z]$/.test(x.label)) return null;
    rows.push({ label: x.label, sent: Number(x.sent) || 0, replied: Number(x.replied) || 0 });
  }
  return {
    reason: o.reason as PromotionState["reason"],
    winner: typeof o.winner === "string" && /^[A-Z]$/.test(o.winner) ? o.winner : undefined,
    z: typeof o.z === "number" ? o.z : undefined,
    min_sample: Number(o.min_sample) || 0,
    rows,
  };
}
