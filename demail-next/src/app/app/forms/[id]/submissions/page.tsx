import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { parseFields } from "@/lib/input";
import { Card, PageHeader } from "@/components/ui/card";
const when = (at: string) => `${new Date(at).toISOString().replace("T", " ").slice(0, 16)} UTC`;
// Answers are untrusted visitor text, so they render as plain React text, cut to 300 characters.
function answerText(value: unknown) {
  const text = typeof value === "boolean" ? (value ? "Yes" : "No") : typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}
export default async function FormSubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await getOrgContext();
  const { data: form } = await supabase.from("forms").select("id, name, fields").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!form) notFound();
  const { data: rows } = await supabase
    .from("form_submissions")
    .select("id, contact_id, answers, consented, enrolled, created_at")
    .eq("organization_id", org.id)
    .eq("form_id", form.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const contactIds = [...new Set((rows ?? []).map((r) => r.contact_id))];
  const { data: contacts } = contactIds.length
    ? await supabase.from("contacts").select("id, email").eq("organization_id", org.id).in("id", contactIds)
    : { data: [] as { id: string; email: string }[] };
  const emailById = new Map((contacts ?? []).map((c) => [c.id, c.email]));
  const labelByKey = new Map((parseFields(form.fields) ?? []).map((f) => [f.key, f.label]));
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={`${form.name}: submissions`} />
      <Link href={`/app/forms/${form.id}`} className="-mt-4 text-sm text-sky-700 hover:underline">
        Back to the form
      </Link>
      <Card className="p-0">
        <ul>
          {(rows ?? []).map((r) => {
            const answers = r.answers && typeof r.answers === "object" && !Array.isArray(r.answers) ? Object.entries(r.answers) : [];
            return (
              <li key={r.id} className="flex flex-col gap-1 border-b border-slate-100 p-3 text-sm last:border-0">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-slate-500">{when(r.created_at)}</span>
                  <Link href={`/app/contacts/${r.contact_id}`} className="text-sky-700 hover:underline">
                    {emailById.get(r.contact_id) ?? "Contact"}
                  </Link>
                  <span className="text-slate-500">{r.consented ? "Consented" : "No consent box ticked"}</span>
                  {r.enrolled && <span className="text-slate-500">Enrolled</span>}
                </div>
                {answers.map(([key, value]) => (
                  <p key={key} className="whitespace-pre-wrap break-words text-slate-700">
                    {labelByKey.get(key) ?? key}: {answerText(value)}
                  </p>
                ))}
              </li>
            );
          })}
          {(rows ?? []).length === 0 && <li className="p-4 text-sm text-slate-500">No submissions yet.</li>}
        </ul>
      </Card>
      {(rows ?? []).length === 100 && <p className="text-xs text-slate-500">Showing the newest 100 submissions.</p>}
    </div>
  );
}
