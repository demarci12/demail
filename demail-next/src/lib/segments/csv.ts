import Papa from "papaparse";

export const EXPORT_COLUMNS = ["email", "first_name", "last_name", "company", "phone", "subscribed", "created_at"] as const;

// escapeFormulae prefixes a quote to any cell that starts with = + - @ tab or CR, so a spreadsheet never runs imported text as a formula.
export function contactsToCsv(rows: Record<string, unknown>[]): string {
  return Papa.unparse(
    { fields: [...EXPORT_COLUMNS], data: rows.map((r) => EXPORT_COLUMNS.map((c) => (r[c] === null || r[c] === undefined ? "" : String(r[c])))) },
    { escapeFormulae: true, newline: "\r\n" },
  );
}
