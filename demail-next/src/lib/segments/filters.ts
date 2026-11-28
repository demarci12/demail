import type { Rules } from "./rules";

// The contacts list filters (URL parameters) as one rule document, so the list, the CSV export and saved segments share one evaluator.
export function filtersToRules(f: { label?: string; subscribed?: string; company?: string; verify?: string }): Rules {
  const conditions: Rules["conditions"] = [];
  if (f.label && /^[0-9a-f-]{36}$/i.test(f.label)) conditions.push({ field: "label", op: "has", value: f.label });
  if (f.subscribed === "yes" || f.subscribed === "no") conditions.push({ field: "subscribed", op: "is", value: f.subscribed === "yes" ? "true" : "false" });
  if (f.company?.trim()) conditions.push({ field: "company", op: "contains", value: f.company.trim().slice(0, 200) });
  if (f.verify && ["valid", "risky", "invalid", "unknown", "unverified"].includes(f.verify)) conditions.push({ field: "verify_status", op: "is", value: f.verify });
  return { match: "all", conditions };
}
