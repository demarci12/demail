// Pure waterfall: no imports, so the check script can load this file directly.
export type Field = "email" | "phone";
export type Person = { firstName: string; lastName: string; company: string | null; domain: string | null };
export type Found = { email?: string | null; phone?: string | null };
export type WaterfallProvider = {
  label: string;
  fields: Field[];
  // Returns false when the workspace cap is reached; a call is counted before it is made.
  reserve: () => Promise<boolean>;
  find: (person: Person) => Promise<Found>;
};
export type WaterfallResult = {
  found: Partial<Record<Field, { value: string; source: string }>>;
  calls: number;
  failures: number;
  capped: boolean;
};

// Providers run in list order. A provider is called only while a wanted field is still missing and it can supply one,
// so the next provider is tried only when the previous found nothing for that field.
export async function runWaterfall(providers: WaterfallProvider[], person: Person, want: Field[]): Promise<WaterfallResult> {
  const out: WaterfallResult = { found: {}, calls: 0, failures: 0, capped: false };
  for (const p of providers) {
    const missing = want.filter((f) => !out.found[f] && p.fields.includes(f));
    if (missing.length === 0) continue;
    if (!(await p.reserve())) {
      out.capped = true;
      break;
    }
    out.calls++;
    let got: Found;
    try {
      got = await p.find(person);
    } catch {
      out.failures++;
      continue;
    }
    for (const f of missing) {
      const value = got[f];
      if (typeof value === "string" && value) out.found[f] = { value, source: p.label };
    }
  }
  return out;
}
