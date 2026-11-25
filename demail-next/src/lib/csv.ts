import Papa from "papaparse";

export const CONTACT_FIELDS = ["email", "first_name", "last_name", "company", "phone"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];
// A column maps to a core field, to a custom field under its own header, or is ignored.
export type ColumnTarget = ContactField | "custom" | "ignore";
export type ImportRow = Partial<Record<ContactField, string>> & { custom?: Record<string, string> };

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GUESSES: Record<ContactField, string[]> = {
  email: ["email", "e-mail", "email address", "mail"],
  first_name: ["first name", "firstname", "first_name", "given name"],
  last_name: ["last name", "lastname", "last_name", "surname", "family name"],
  company: ["company", "organization", "organisation", "company name"],
  phone: ["phone", "phone number", "mobile", "tel", "telephone"],
};

export function parseCsv(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (r) => resolve({ headers: r.meta.fields ?? [], rows: r.data }),
      error: reject,
    });
  });
}

export function guessTarget(header: string): ColumnTarget {
  const h = header.trim().toLowerCase();
  for (const field of CONTACT_FIELDS) if (GUESSES[field].includes(h)) return field;
  return "custom";
}

export function applyMapping(rows: Record<string, string>[], mapping: Record<string, ColumnTarget>): ImportRow[] {
  return rows.map((row) => {
    const out: ImportRow = {};
    for (const [header, target] of Object.entries(mapping)) {
      const value = (row[header] ?? "").trim();
      if (!value || target === "ignore") continue;
      if (target === "custom") (out.custom ??= {})[header] = value;
      else out[target] = value;
    }
    return out;
  });
}
