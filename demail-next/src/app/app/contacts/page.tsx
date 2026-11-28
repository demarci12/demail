import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { Json } from "@/lib/database.types";
import { filtersToRules } from "@/lib/segments/filters";
import { readRules } from "@/lib/segments/rules";
import { bulkContacts } from "./bulk-actions";
import { createLabel } from "./actions";
import { SelectAll } from "./select-all";

const PAGE_SIZE = 50;
const UUID = /^[0-9a-f-]{36}$/i;

type Params = { q?: string; page?: string; label?: string; subscribed?: string; company?: string; segment?: string; verify?: string; error?: string; msg?: string };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase, org, canManage } = await getOrgContext();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const q = (sp.q ?? "").trim().slice(0, 200);
  const [{ data: labels }, { data: segments }, { data: campaigns }] = await Promise.all([
    supabase.from("labels").select("id, name").eq("organization_id", org.id).order("name"),
    supabase.from("segments").select("id, name, rules").eq("organization_id", org.id).order("name"),
    supabase.from("campaigns").select("id, name, status").eq("organization_id", org.id).neq("status", "completed").order("created_at", { ascending: false }),
  ]);
  const label = labels?.find((l) => l.id === sp.label);
  const segment = segments?.find((s) => s.id === sp.segment);
  const subscribed = sp.subscribed === "yes" || sp.subscribed === "no" ? sp.subscribed : "";
  const company = (sp.company ?? "").trim().slice(0, 200);
  const verify = ["valid", "risky", "invalid", "unknown", "unverified"].includes(sp.verify ?? "") ? (sp.verify as string) : "";
  const filters = filtersToRules({ label: label?.id, subscribed, company, verify });
  const segmentRules = segment ? (readRules(segment.rules) as unknown as Json) : null;

  const { data: contacts, count } = await supabase
    .rpc(
      "contacts_search",
      { p_org: org.id, p_rules: segmentRules ?? (filters as unknown as Json), p_extra: segmentRules ? (filters as unknown as Json) : null, p_q: q || null },
      { count: "exact" },
    )
    .select("id, email, first_name, last_name, company, subscribed, verify_status")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const query = (p: number | null) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (label) params.set("label", label.id);
    if (subscribed) params.set("subscribed", subscribed);
    if (company) params.set("company", company);
    if (verify) params.set("verify", verify);
    if (segment && UUID.test(segment.id)) params.set("segment", segment.id);
    if (p) params.set("page", String(p));
    return params.toString();
  };
  const here = `/app/contacts${query(page) ? `?${query(page)}` : ""}`;
  const filtered = !!(q || label || subscribed || company || segment || verify);

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <PageHeader
        title="Contacts"
        actions={
          <>
            <Link href="/app/segments" className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm">
              Segments
            </Link>
            <Link href={`/app/contacts/export${query(null) ? `?${query(null)}` : ""}`} prefetch={false} className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm">
              Export CSV
            </Link>
            <Link href="/app/contacts/import" className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm">
              Import CSV
            </Link>
            <Link href="/app/contacts/new" className="inline-flex h-9 items-center rounded-md bg-sky-600 px-3 text-sm font-medium text-white">
              Add contact
            </Link>
          </>
        }
      />
      {sp.error && <Alert>{sp.error}</Alert>}
      {sp.msg && <Alert tone="info">{sp.msg}</Alert>}
      <form className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
        <Input name="q" defaultValue={q} placeholder="Search email, name or company" className="col-span-2" />
        <Select name="label" defaultValue={label?.id ?? ""} aria-label="Label">
          <option value="">All labels</option>
          {(labels ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Select name="subscribed" defaultValue={subscribed} aria-label="Subscription">
          <option value="">Any subscription</option>
          <option value="yes">Subscribed</option>
          <option value="no">Unsubscribed</option>
        </Select>
        <Select name="verify" defaultValue={verify} aria-label="Verification">
          <option value="">Any verification</option>
          <option value="valid">Valid</option>
          <option value="risky">Risky</option>
          <option value="invalid">Invalid</option>
          <option value="unknown">Unknown</option>
          <option value="unverified">Not verified yet</option>
        </Select>
        <Select name="segment" defaultValue={segment?.id ?? ""} aria-label="Segment">
          <option value="">No segment</option>
          {(segments ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Input name="company" defaultValue={company} placeholder="Company contains" />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {filtered && (
          <Link href="/app/contacts" className="self-center text-sm text-sky-700">
            Clear filters
          </Link>
        )}
      </form>
      <form action={bulkContacts}>
        <input type="hidden" name="return" value={here} />
        <Card className="p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 text-sm">
            <span className="text-slate-600">With the ticked contacts:</span>
            <Select name="op" defaultValue="label_add" className="w-44" aria-label="Action">
              <option value="label_add">Add label</option>
              <option value="label_remove">Remove label</option>
              <option value="enroll">Enroll in campaign</option>
              {canManage && <option value="delete">Delete</option>}
            </Select>
            <Select name="label" defaultValue="" className="w-44" aria-label="Label for the action">
              <option value="">Label (for label actions)</option>
              {(labels ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
            <Select name="campaign" defaultValue="" className="w-48" aria-label="Campaign for the action">
              <option value="">Campaign (for enroll)</option>
              {(campaigns ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.status})
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="w-8 px-4 py-2">
                  <SelectAll />
                </th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Verification</th>
              </tr>
            </thead>
            <tbody>
              {(contacts ?? []).map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <input type="checkbox" name="id" value={c.id} aria-label={`Select ${c.email}`} />
                  </td>
                  <td className="px-4 py-2">
                    <Link href={`/app/contacts/${c.id}`} className="text-sky-700 hover:underline">
                      {c.email}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{[c.first_name, c.last_name].filter(Boolean).join(" ")}</td>
                  <td className="px-4 py-2">{c.company}</td>
                  <td className="px-4 py-2">{c.subscribed ? "Subscribed" : "Unsubscribed"}</td>
                  <td className="px-4 py-2">
                    <span className={c.verify_status === "invalid" ? "text-red-700" : c.verify_status === "risky" ? "text-amber-700" : c.verify_status === "valid" ? "text-emerald-700" : "text-slate-500"}>{c.verify_status ?? "Not verified"}</span>
                  </td>
                </tr>
              ))}
              {(contacts ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    {filtered ? "No contacts match these filters." : "No contacts yet. Import a CSV or add one."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </form>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {total} contacts, page {Math.min(page, pages)} of {pages}
        </span>
        <span className="flex gap-3">
          {page > 1 && <Link href={`/app/contacts?${query(page - 1)}`}>Previous</Link>}
          {page < pages && <Link href={`/app/contacts?${query(page + 1)}`}>Next</Link>}
        </span>
      </div>
      <form action={createLabel.bind(null, "/app/contacts")} className="flex max-w-sm gap-2">
        <Input name="name" placeholder="New label" maxLength={60} required />
        <Button type="submit" variant="secondary">
          Add label
        </Button>
      </form>
    </div>
  );
}
