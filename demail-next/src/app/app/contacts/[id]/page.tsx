import { notFound } from "next/navigation";
import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContactFields } from "../fields";
import { createLabel, deleteContact, setContactLabel, updateContact } from "../actions";

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, org, canManage } = await getOrgContext();
  const { data: contact } = await supabase.from("contacts").select("*").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!contact) notFound();
  const [{ data: labels }, { data: links }] = await Promise.all([
    supabase.from("labels").select("id, name").eq("organization_id", org.id).order("name"),
    supabase.from("contact_labels").select("label_id").eq("contact_id", id).eq("organization_id", org.id),
  ]);
  const assigned = new Set((links ?? []).map((l) => l.label_id));
  const custom = contact.custom_fields && typeof contact.custom_fields === "object" && !Array.isArray(contact.custom_fields) ? Object.entries(contact.custom_fields) : [];

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <PageHeader title={contact.email} actions={<Link href="/app/contacts" className="text-sm text-sky-700">Back to contacts</Link>} />
      {sp.error && <Alert>{sp.error}</Alert>}
      {sp.saved && <Alert tone="info">Saved.</Alert>}
      {!contact.subscribed && <Alert tone="info">This contact is unsubscribed and will not receive campaign email.</Alert>}
      <Card>
        <form action={updateContact.bind(null, id)} className="flex flex-col gap-3">
          <ContactFields values={contact} />
          <Button type="submit">Save</Button>
        </form>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Labels</h2>
        <div className="flex flex-wrap gap-2">
          {(labels ?? []).map((l) => (
            <form key={l.id} action={setContactLabel.bind(null, id, l.id, !assigned.has(l.id))}>
              <button
                type="submit"
                className={`rounded-full border px-3 py-1 text-xs ${assigned.has(l.id) ? "border-sky-400 bg-sky-50 text-sky-700" : "border-slate-300 text-slate-600"}`}
              >
                {l.name}
              </button>
            </form>
          ))}
          {(labels ?? []).length === 0 && <span className="text-sm text-slate-500">No labels yet.</span>}
        </div>
        <form action={createLabel.bind(null, `/app/contacts/${id}`)} className="flex gap-2">
          <input name="name" required maxLength={60} placeholder="New label" className="h-9 flex-1 rounded-md border border-slate-300 px-3 text-sm" />
          <Button type="submit" variant="secondary">
            Add label
          </Button>
        </form>
      </Card>
      {custom.length > 0 && (
        <Card>
          <h2 className="mb-2 font-medium">Custom fields</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {custom.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-500">{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
      {canManage && (
        <form action={deleteContact.bind(null, id)}>
          <Button type="submit" variant="danger">
            Delete contact
          </Button>
        </form>
      )}
    </div>
  );
}
