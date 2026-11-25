"use client";
import { useState } from "react";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { applyMapping, CONTACT_FIELDS, guessTarget, parseCsv, type ColumnTarget } from "@/lib/csv";
import { importContacts, type ImportResult } from "../actions";

const LABELS: Record<ColumnTarget, string> = {
  email: "Email",
  first_name: "First name",
  last_name: "Last name",
  company: "Company",
  phone: "Phone",
  custom: "Custom field",
  ignore: "Ignore",
};

export default function ImportPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, ColumnTarget>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    setResult(null);
    setError("");
    if (!file) return;
    try {
      const parsed = await parseCsv(file);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(Object.fromEntries(parsed.headers.map((h) => [h, guessTarget(h)])));
    } catch {
      setError("Could not read that file as CSV.");
    }
  }

  const hasEmail = Object.values(mapping).includes("email");

  async function run() {
    setBusy(true);
    setError("");
    const mapped = applyMapping(rows, mapping);
    const total: ImportResult = { created: 0, updated: 0, skipped: 0, invalid: 0 };
    // Send in slices so each request stays well under the body size limit.
    for (let i = 0; i < mapped.length; i += 2000) {
      const part = await importContacts(mapped.slice(i, i + 2000));
      total.created += part.created;
      total.updated += part.updated;
      total.skipped += part.skipped;
      total.invalid += part.invalid;
      if (part.error) {
        setError(part.error);
        break;
      }
    }
    setResult(total);
    setBusy(false);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="Import contacts" />
      <Card className="flex flex-col gap-3">
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
        <p className="text-xs text-slate-500">The first row must hold column names. Existing contacts with the same email are updated. Suppressed addresses are skipped.</p>
      </Card>
      {headers.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium">Map columns ({rows.length} rows)</h2>
          {headers.map((h) => (
            <div key={h} className="grid grid-cols-2 items-center gap-3 text-sm">
              <span className="truncate">{h}</span>
              <Select value={mapping[h]} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value as ColumnTarget })}>
                {[...CONTACT_FIELDS, "custom", "ignore"].map((t) => (
                  <option key={t} value={t}>
                    {LABELS[t as ColumnTarget]}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          {!hasEmail && <Alert>Map one column to Email.</Alert>}
          <Button onClick={run} disabled={!hasEmail || busy || rows.length === 0}>
            {busy ? "Importing" : "Import"}
          </Button>
        </Card>
      )}
      {error && <Alert>{error}</Alert>}
      {result && (
        <Alert tone="info">
          Created {result.created}, updated {result.updated}, skipped {result.skipped}, invalid {result.invalid}.
        </Alert>
      )}
    </div>
  );
}
