// Merge fields: {{first_name}} or {{company|your company}}. Plain lookup and replace, no eval.
const TOKEN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\|([^{}]*))?\}\}/g;
export const MERGE_FIELDS = ["first_name", "last_name", "company", "email", "phone"] as const;
export type MergeData = Record<string, string | null | undefined>;
export type RenderResult = { ok: true; text: string } | { ok: false; missing: string[] };
export const SAMPLE_CONTACT: MergeData = {
  email: "alex@example.com",
  first_name: "Alex",
  last_name: "Rivera",
  company: "Example Co",
  phone: "+1 555 0100",
};
type ContactLike = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  phone: string | null;
  custom_fields: unknown;
};
// Builds the lookup table for one contact, with custom fields as extra keys.
export function contactData(c: ContactLike): MergeData {
  const data: MergeData = {};
  if (c.custom_fields && typeof c.custom_fields === "object" && !Array.isArray(c.custom_fields)) {
    for (const [k, v] of Object.entries(c.custom_fields)) if (typeof v === "string") data[k] = v;
  }
  return { ...data, email: c.email, first_name: c.first_name, last_name: c.last_name, company: c.company, phone: c.phone };
}
// A field that is empty and has no fallback is an error, so a blank is never sent.
export function renderTemplate(template: string, data: MergeData, escape: (value: string) => string = (v) => v): RenderResult {
  const missing = new Set<string>();
  const text = template.replace(TOKEN, (_all, name: string, fallback: string | undefined) => {
    const value = data[name]?.trim();
    if (value) return escape(value);
    if (fallback !== undefined) return escape(fallback.trim());
    missing.add(name);
    return "";
  });
  return missing.size > 0 ? { ok: false, missing: [...missing] } : { ok: true, text };
}
// Names of tokens with no fallback, in first-seen order; these must hold a value for every contact.
export function requiredFields(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(TOKEN)) if (m[2] === undefined) names.add(m[1]);
  return [...names];
}
export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
