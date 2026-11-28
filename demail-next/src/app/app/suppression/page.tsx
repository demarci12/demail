import { getOrgContext } from "@/lib/org";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { addSuppression, removeSuppression } from "./actions";
export default async function SuppressionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, org, canManage } = await getOrgContext();
  const { data: rows } = await supabase
    .from("suppressed_recipients")
    .select("id, email, reason, source, created_at")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(500);
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Suppression list" />
      <p className="text-sm text-slate-600">Addresses here never receive campaign email and their enrollments stop.</p>
      {error && <Alert>{error}</Alert>}
      <Card>
        <form action={addSuppression} className="flex items-end gap-3">
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Reason (optional)">
            <Input name="reason" maxLength={300} />
          </Field>
          <Button type="submit">Add</Button>
        </form>
      </Card>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className="p-3">Email</th>
              <th className="p-3">Source</th>
              <th className="p-3">Reason</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">{r.email}</td>
                <td className="p-3">{r.source}</td>
                <td className="p-3 text-slate-500">{r.reason}</td>
                <td className="p-3 text-right">
                  {canManage && (
                    <form action={removeSuppression.bind(null, r.id)}>
                      <Button type="submit" variant="secondary">
                        Remove
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && (
              <tr>
                <td colSpan={4}>
                  <EmptyState title="Nothing suppressed">Unsubscribes, hard bounces and complaints are added here automatically. You can add an address yourself.</EmptyState>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
