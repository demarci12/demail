// Pure validators for untrusted text; no imports so check scripts can load this file directly.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
const MARKUP = /[<>{}[\]\\"`]/;
const HOSTNAME = /[\p{L}\p{N}-]+\.[a-z]{2,24}(?![\p{L}\p{N}])/iu;
const COMBINING_RUN = /\p{M}{3,}/u;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEL_RE = /^[+()0-9 .-]{3,40}$/;
const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

function isControl(code: number) {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

// Normalizes, drops control, bidi and zero-width characters, trims and cuts to max characters.
export function cleanText(value: unknown, max: number, multiline = false): string {
  const s = (value == null ? "" : String(value)).normalize("NFC").replace(INVISIBLE, "");
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (multiline && (ch === "\n" || ch === "\t")) out += ch;
    else if (!multiline && (ch === "\n" || ch === "\t" || ch === "\r")) out += " ";
    else if (!isControl(code)) out += ch;
  }
  if (!multiline) out = out.replace(/\s+/g, " ");
  return Array.from(out.trim()).slice(0, max).join("").trim();
}

function hasLinkish(s: string) {
  const lower = s.toLowerCase();
  return MARKUP.test(s) || s.includes("@") || lower.includes("://") || lower.includes("www.");
}

// A person's name: no markup, links, addresses or hostnames, and no stacked combining marks.
export function isSafeName(s: string): boolean {
  if (hasLinkish(s) || /https?:/i.test(s)) return false;
  const folded = s.replace(/[\u3002\uFF0E\uFF61]/g, ".");
  if (HOSTNAME.test(folded)) return false;
  return !COMBINING_RUN.test(s);
}

// A company name: dots are fine ("Booking.com Ltd"), markup, links and addresses are not.
export function isSafeCompany(s: string): boolean {
  return !hasLinkish(s);
}
// A free-text answer that can become a merge field: quotes and brackets are fine, tags, merge braces, links, addresses and hostnames are not.
export function isSafeAnswer(s: string): boolean {
  const lower = s.toLowerCase();
  if (/[<>{}@]/.test(s) || lower.includes("://") || lower.includes("www.") || /https?:/i.test(s)) return false;
  if (HOSTNAME.test(s.replace(/[\u3002\uFF0E\uFF61]/g, "."))) return false;
  return !COMBINING_RUN.test(s);
}
// A name chosen in another workspace, cleaned at render: anything that fails the name rules shows the fallback.
export function displayName(value: unknown, fallback: string, max = 100): string {
  const s = cleanText(value, max);
  return s && isSafeName(s) ? s : fallback;
}

export function isHttpsUrl(s: string, max = 500): boolean {
  if (typeof s !== "string" || s.length === 0 || s.length > max) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}

// IPv4 as is, IPv6 cut to its /64 so one network counts as one address.
export function ipPrefix(ip: string | null): string {
  const raw = (ip ?? "").trim().replace(/^\[|\]$/g, "").split("%")[0].toLowerCase().slice(0, 64);
  if (!raw) return "none";
  if (!raw.includes(":")) return raw;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(raw);
  if (mapped) return mapped[1];
  let s = raw;
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    const b = v4.slice(1).map(Number);
    s = `${s.slice(0, v4.index)}${((b[0] << 8) | b[1]).toString(16)}:${((b[2] << 8) | b[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return raw;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = halves.length === 2 ? [...head, ...Array<string>(Math.max(8 - head.length - tail.length, 0)).fill("0"), ...tail] : head;
  return groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":");
}

export const FIELD_TYPES = ["text", "email", "tel", "textarea", "select", "checkbox"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short text",
  email: "Email",
  tel: "Phone",
  textarea: "Long text",
  select: "Dropdown",
  checkbox: "Checkbox",
};
export const MAPS_TO = ["email", "first_name", "last_name", "company", "phone", "custom", "none"] as const;
export type MapsTo = (typeof MAPS_TO)[number];
export const MAPS_TO_LABELS: Record<MapsTo, string> = {
  email: "Email",
  first_name: "First name",
  last_name: "Last name",
  company: "Company",
  phone: "Phone",
  custom: "Custom field",
  none: "Only keep the answer",
};
export type FormField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  maps_to: MapsTo;
  options?: string[];
  placeholder?: string;
};

// Validates and normalizes a stored or edited field list; null when any rule fails.
export function parseFields(raw: unknown): FormField[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 20) return null;
  const keys = new Set<string>();
  const mapped = new Set<MapsTo>();
  const out: FormField[] = [];
  let emailFields = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const f = item as Record<string, unknown>;
    if (typeof f.key !== "string" || !KEY_RE.test(f.key) || keys.has(f.key)) return null;
    keys.add(f.key);
    const label = cleanText(f.label, 100);
    if (!label) return null;
    if (!FIELD_TYPES.includes(f.type as FieldType) || !MAPS_TO.includes(f.maps_to as MapsTo) || typeof f.required !== "boolean") return null;
    const type = f.type as FieldType;
    const maps_to = f.maps_to as MapsTo;
    if (type === "checkbox" && maps_to !== "custom" && maps_to !== "none") return null;
    if (maps_to !== "custom" && maps_to !== "none") {
      if (mapped.has(maps_to)) return null;
      mapped.add(maps_to);
    }
    if (maps_to === "email") {
      if (type !== "email" || f.required !== true) return null;
      emailFields++;
    }
    const field: FormField = { key: f.key, label, type, required: f.required, maps_to };
    if (type === "select") {
      if (!Array.isArray(f.options) || f.options.length < 1 || f.options.length > 20) return null;
      const options = f.options.map((o) => cleanText(o, 100));
      if (options.some((o) => !o)) return null;
      field.options = options;
    }
    if (f.placeholder !== undefined && f.placeholder !== null) {
      const placeholder = cleanText(f.placeholder, 100);
      if (placeholder) field.placeholder = placeholder;
    }
    out.push(field);
  }
  return emailFields === 1 ? out : null;
}

export type SubmissionContact = {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  custom_fields: Record<string, string | boolean>;
};
export type SubmissionResult =
  | { ok: true; contact: SubmissionContact; answers: Record<string, string | boolean>; consented: boolean }
  | { ok: false; error: "invalid" | "name" | "link" | "consent" };

// Reads f_<key> inputs and the consent box, and maps answers onto contact fields; only checked text reaches custom (merge) fields.
export function validateSubmission(fields: FormField[], get: (name: string) => string | null, consentRequired: boolean): SubmissionResult {
  const answers: Record<string, string | boolean> = {};
  const custom: Record<string, string | boolean> = {};
  const contact: Omit<SubmissionContact, "custom_fields"> = { email: "" };
  for (const f of fields) {
    const raw = get(`f_${f.key}`);
    if (f.type === "checkbox") {
      const checked = raw === "on";
      if (f.required && !checked) return { ok: false, error: "invalid" };
      if (!checked) continue;
      answers[f.key] = true;
      if (f.maps_to === "custom") custom[f.key] = true;
      continue;
    }
    let value: string;
    if (f.type === "textarea") value = cleanText(raw, 2000, true);
    else if (f.type === "email") {
      value = cleanText(raw, 400).toLowerCase();
      if (value && (value.length > 320 || !EMAIL_RE.test(value))) return { ok: false, error: "invalid" };
    } else if (f.type === "tel") {
      value = cleanText(raw, 60);
      if (value && !TEL_RE.test(value)) return { ok: false, error: "invalid" };
    } else if (f.type === "select") {
      value = cleanText(raw, 100);
      if (value && !(f.options ?? []).includes(value)) return { ok: false, error: "invalid" };
    } else value = cleanText(raw, 200);
    if (!value) {
      if (f.required) return { ok: false, error: "invalid" };
      continue;
    }
    answers[f.key] = value;
    switch (f.maps_to) {
      case "email":
        contact.email = value;
        break;
      case "first_name":
      case "last_name":
        if (!isSafeName(value)) return { ok: false, error: "name" };
        contact[f.maps_to] = value;
        break;
      case "company":
        if (!isSafeCompany(value)) return { ok: false, error: "name" };
        contact.company = value;
        break;
      case "phone":
        contact.phone = value;
        break;
      case "custom":
        // Dropdown values come from the form owner; an email answer stays in the submission only.
        if (f.type === "select") custom[f.key] = value;
        else if (f.type !== "email") {
          if (!isSafeAnswer(value)) return { ok: false, error: "link" };
          custom[f.key] = value;
        }
        break;
      default:
        break;
    }
  }
  if (!contact.email || !EMAIL_RE.test(contact.email)) return { ok: false, error: "invalid" };
  const consented = get("consent") === "on";
  if (consentRequired && !consented) return { ok: false, error: "consent" };
  return { ok: true, contact: { ...contact, custom_fields: custom }, answers, consented };
}
