import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createForm } from "./actions";
export default async function FormsPage({ searchParams }: { searchParams: Promise<{ error?: string; msg?: string }> }) {
  const { error, msg } = await searchParams;
  const { supabase, org } = await getOrgContext();
  const { data: forms } = await supabase.from("forms").select("id, name, published, created_at").eq("organization_id", org.id).order("created_at", { ascending: false });
  const counts = await Promise.all(
    (forms ?? []).map(async (f) => {
      const { count } = await supabase.from("form_submissions").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("form_id", f.id);
      return count ?? 0;
    }),
  );
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Forms" />
      {error && <Alert>{error}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">
          A hosted form adds whoever fills it in to your contacts, with a link you can share or embed on your site. New forms start as drafts.
        </p>
        <form action={createForm} className="flex gap-2">
          <Input name="name" placeholder="Form name, for example Newsletter signup" maxLength={100} required />
          <Button type="submit">Create form</Button>
        </form>
      </Card>
      <Card className="p-0">
        <ul>
          {(forms ?? []).map((f, i) => (
            <li key={f.id} className="border-b border-slate-100 last:border-0">
              <Link href={`/app/forms/${f.id}`} className="flex items-center justify-between gap-3 p-3 text-sm hover:bg-slate-50">
                <span className="truncate">{f.name}</span>
                <span className="flex shrink-0 items-center gap-3 text-slate-500">
                  <span>
                    {counts[i]} {counts[i] === 1 ? "submission" : "submissions"}
                  </span>
                  <span className={f.published ? "text-emerald-700" : ""}>{f.published ? "Published" : "Draft"}</span>
                </span>
              </Link>
            </li>
          ))}
          {(forms ?? []).length === 0 && <li className="p-4 text-sm text-slate-500">No forms yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
