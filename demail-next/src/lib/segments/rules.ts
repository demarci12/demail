import { z } from "zod";

export const TEXT_FIELDS = ["email", "first_name", "last_name", "company", "phone"] as const;
export const TEXT_OPS = ["contains", "not_contains", "equals", "starts_with", "is_empty", "not_empty"] as const;
export const FIELD_LABELS = {
  email: "Email",
  first_name: "First name",
  last_name: "Last name",
  company: "Company",
  phone: "Phone",
  subscribed: "Subscription",
  label: "Label",
  created_at: "Added",
  verify_status: "Verification",
} as const;
export const OP_LABELS: Record<string, string> = {
  contains: "contains",
  not_contains: "does not contain",
  equals: "is",
  starts_with: "starts with",
  is_empty: "is empty",
  not_empty: "is not empty",
  is: "is",
  has: "has",
  not_has: "does not have",
  before: "before",
  after: "after",
};
// Operators offered per field, in the order the form lists them.
export const OPS_FOR: Record<keyof typeof FIELD_LABELS, readonly string[]> = {
  email: TEXT_OPS,
  first_name: TEXT_OPS,
  last_name: TEXT_OPS,
  company: TEXT_OPS,
  phone: TEXT_OPS,
  subscribed: ["is"],
  label: ["has", "not_has"],
  created_at: ["before", "after"],
  verify_status: ["is"],
};

const uuid = z.string().uuid();
const condition = z
  .object({
    field: z.enum(["email", "first_name", "last_name", "company", "phone", "subscribed", "label", "created_at", "verify_status"]),
    op: z.enum(["contains", "not_contains", "equals", "starts_with", "is_empty", "not_empty", "is", "has", "not_has", "before", "after"]),
    value: z.string().trim().max(200).default(""),
  })
  .superRefine((c, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!OPS_FOR[c.field].includes(c.op)) return fail("That operator does not fit the field.");
    if (c.op === "is_empty" || c.op === "not_empty") return;
    if (c.field === "subscribed" && c.value !== "true" && c.value !== "false") return fail("Subscription must be subscribed or unsubscribed.");
    if (c.field === "label" && !uuid.safeParse(c.value).success) return fail("That label does not exist. Type a label name exactly.");
    if (c.field === "verify_status" && !["valid", "risky", "invalid", "unknown", "unverified"].includes(c.value)) return fail("Verification must be valid, risky, invalid, unknown or unverified.");
    if (c.field === "created_at" && !/^\d{4}-\d{2}-\d{2}$/.test(c.value)) return fail("Enter a date.");
    if ((TEXT_FIELDS as readonly string[]).includes(c.field) && c.value === "") return fail("Enter a value.");
  });

export const rulesSchema = z.object({
  match: z.enum(["all", "any"]),
  conditions: z.array(condition).max(10),
});
export type Rules = z.infer<typeof rulesSchema>;
export type Condition = Rules["conditions"][number];

export const EMPTY_RULES: Rules = { match: "all", conditions: [] };

// Reads the rows of the segment form; rows left blank (no value for a value-taking operator) are dropped.
export function rulesFromForm(formData: FormData, labels: { id: string; name: string }[] = []): { rules: Rules } | { error: string } {
  const fields = formData.getAll("field").map(String);
  const ops = formData.getAll("op").map(String);
  const values = formData.getAll("value").map(String);
  const rows: unknown[] = [];
  for (let i = 0; i < fields.length && i < 10; i++) {
    const op = ops[i] ?? "";
    let value = (values[i] ?? "").trim();
    if (!fields[i]) continue;
    // The form shows label names and subscription words; the stored rule keeps the label id and true or false.
    if (fields[i] === "label") value = labels.find((l) => l.name.toLowerCase() === value.toLowerCase())?.id ?? value;
    if (fields[i] === "subscribed") value = { subscribed: "true", yes: "true", unsubscribed: "false", no: "false" }[value.toLowerCase()] ?? value;
    if (value === "" && op !== "is_empty" && op !== "not_empty") continue;
    rows.push({ field: fields[i], op, value });
  }
  const parsed = rulesSchema.safeParse({ match: formData.get("match") === "any" ? "any" : "all", conditions: rows });
  return parsed.success ? { rules: parsed.data } : { error: parsed.error.issues[0]?.message ?? "Check the conditions." };
}

// Rules read from the database are checked again before use.
export function readRules(value: unknown): Rules {
  const parsed = rulesSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_RULES;
}

export function describeRules(rules: Rules, labels: Map<string, string>): string {
  if (rules.conditions.length === 0) return "All contacts";
  const parts = rules.conditions.map((c) => {
    const value = c.field === "label" ? `"${labels.get(c.value) ?? "a deleted label"}"` : c.field === "subscribed" ? (c.value === "true" ? "subscribed" : "unsubscribed") : c.value ? `"${c.value}"` : "";
    return `${FIELD_LABELS[c.field]} ${OP_LABELS[c.op]} ${value}`.trim();
  });
  return parts.join(rules.match === "all" ? " and " : " or ");
}
