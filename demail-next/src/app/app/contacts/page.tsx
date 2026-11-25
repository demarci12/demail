import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { createLabel } from "./actions";

const PAGE_SIZE = 25;

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; label?: string }> }) {
  const { supabase, org } = await getOrgContext();
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const q = (sp.q ?? "").trim();
  const { data: labels } = await supabase.from("labels").select("id, name, color").eq("organization_id", org.id).order("name");
  const label = labels?.find((l) => l.id === sp.label);

  let query = supabase
    .from("contacts")
    .select("id, email, first_name, last_name, company, subscribed", { count: "exact" })
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (q) {
    // Strip characters that have meaning in a PostgREST filter expression.
    const term = q.replace(/[%,()*\\]/g, " ").trim();
    if (term) query = query.or(["email", "first_name", "last_name", "company"].map((c) => `${c}.ilike.%${term}%`).join(","));
  }
  if (label) {
    const { data: links } = await supabase.from("contact_labels").select("contact_id").eq("label_id", label.id).eq("organization_id", org.id);
    query = query.in("id", (links ?? []).map((l) => l.contact_id));
  }
  const { data: contacts, count } = await query;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (label) params.set("label", label.id);
    params.set("page", String(p));
    return `/app/contacts?${params}`;
  };

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <PageHeader
        title="Contacts"
        actions={
          <>
            <Link href="/app/contacts/import" className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm">
              Import CSV
            </Link>
            <Link href="/app/contacts/new" className="inline-flex h-9 items-center rounded-md bg-sky-600 px-3 text-sm font-medium text-white">
              Add contact
            </Link>
          </>
        }
      />
      <form className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Search email, name or company" />
        <Select name="label" defaultValue={label?.id ?? ""} className="w-48">
          <option value="">All labels</option>
          {(labels ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Company</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(contacts ?? []).map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2">
                  <Link href={`/app/contacts/${c.id}`} className="text-sky-700 hover:underline">
                    {c.email}
                  </Link>
                </td>
                <td className="px-4 py-2">{[c.first_name, c.last_name].filter(Boolean).join(" ")}</td>
                <td className="px-4 py-2">{c.company}</td>
                <td className="px-4 py-2">{c.subscribed ? "Subscribed" : "Unsubscribed"}</td>
              </tr>
            ))}
            {(contacts ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  No contacts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {total} contacts, page {Math.min(page, pages)} of {pages}
        </span>
        <span className="flex gap-3">
          {page > 1 && <Link href={href(page - 1)}>Previous</Link>}
          {page < pages && <Link href={href(page + 1)}>Next</Link>}
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
