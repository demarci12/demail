import { createHash } from "node:crypto";

// Deterministic per enrollment and step, so a retried send renders the same variant; null means variant A.
export function pickVariant<T>(enrollmentId: string, stepId: string, variants: T[]): T | null {
  if (variants.length === 0) return null;
  const hash = createHash("sha256").update(`${enrollmentId}:${stepId}`).digest("hex");
  const slot = parseInt(hash.slice(0, 8), 16) % (variants.length + 1);
  return slot === 0 ? null : variants[slot - 1];
}

// A promoted variant is the only one sent; a promoted label with no active variant behind it falls back to the even split.
export function chooseVariant<T extends { label: string }>(enrollmentId: string, step: { id: string; promoted_label?: string | null }, variants: T[]): T | null {
  if (step.promoted_label === "A") return null;
  const promoted = step.promoted_label ? variants.find((v) => v.label === step.promoted_label) : undefined;
  return promoted ?? pickVariant(enrollmentId, step.id, variants);
}
