import { createHash } from "node:crypto";

// Deterministic per enrollment and step, so a retried send renders the same variant; null means variant A.
export function pickVariant<T>(enrollmentId: string, stepId: string, variants: T[]): T | null {
  if (variants.length === 0) return null;
  const hash = createHash("sha256").update(`${enrollmentId}:${stepId}`).digest("hex");
  const slot = parseInt(hash.slice(0, 8), 16) % (variants.length + 1);
  return slot === 0 ? null : variants[slot - 1];
}
