import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org";
import { contactsToCsv } from "@/lib/segments/csv";
import { filtersToRules } from "@/lib/segments/filters";
import { readRules } from "@/lib/segments/rules";
import type { Json } from "@/lib/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_ROWS = 50000;

// CSV of the contacts the list currently shows (same filters). Cells that start with a formula character are quoted by contactsToCsv.
export async function GET(request: Request) {
  const { supabase, org } = await getOrgContext();
  const sp = new URL(request.url).searchParams;
  let segmentRules: Json | null = null;
  const segment = sp.get("segment");
  if (segment && /^[0-9a-f-]{36}$/i.test(segment)) {
    const { data } = await supabase.from("segments").select("rules").eq("id", segment).eq("organization_id", org.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "segment_not_found" }, { status: 404 });
    segmentRules = readRules(data.rules) as unknown as Json;
  }
  const rules = filtersToRules({ label: sp.get("label") ?? undefined, subscribed: sp.get("subscribed") ?? undefined, company: sp.get("company") ?? undefined, verify: sp.get("verify") ?? undefined }) as unknown as Json;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; rows.length < MAX_ROWS; from += 1000) {
    const { data, error } = await supabase.rpc("contacts_search", { p_org: org.id, p_rules: segmentRules ?? rules, p_extra: segmentRules ? rules : null, p_q: sp.get("q") }).range(from, from + 999);
    if (error) return NextResponse.json({ error: "export_failed" }, { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return new NextResponse(contactsToCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="contacts.csv"', "Cache-Control": "no-store" },
  });
}
