import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { addMailbox, deleteMailbox, setMailboxStatus } from "./actions";
export default async function MailboxesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, org, canManage } = await getOrgContext();
  const { data: mailboxes } = await supabase.from("mailboxes").select("*").eq("organization_id", org.id).order("email");
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader title="Mailboxes" />
      <p className="text-sm text-slate-600">A mailbox is a sender identity. Mail goes out through the Resend account configured for this instance, so the address must belong to a domain verified in Resend.</p>
      {error && <Alert>{error}</Alert>}
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className="p-3">Sender</th>
              <th className="p-3">Status</th>
              <th className="p-3">Daily limit</th>
              <th className="p-3">Min gap (s)</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {(mailboxes ?? []).map((m) => (
              <tr key={m.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">
                  {m.from_name ? `${m.from_name} ` : ""}
                  <span className="text-slate-500">{m.email}</span>
                </td>
                <td className="p-3">{m.status}</td>
                <td className="p-3">{m.daily_limit}</td>
                <td className="p-3">{m.min_gap_seconds}</td>
                <td className="flex justify-end gap-2 p-3">
                  {canManage && (
                    <>
                      <form action={setMailboxStatus.bind(null, m.id, m.status === "active" ? "paused" : "active")}>
                        <Button type="submit" variant="secondary">
                          {m.status === "active" ? "Pause" : "Activate"}
                        </Button>
                      </form>
                      <form action={deleteMailbox.bind(null, m.id)}>
                        <Button type="submit" variant="danger">
                          Remove
                        </Button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {(mailboxes ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-slate-500">
                  No senders yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      {canManage && (
        <Card>
          <h2 className="mb-3 font-medium">Add sender identity</h2>
          <form action={addMailbox} className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <Input name="email" type="email" required />
            </Field>
            <Field label="Name">
              <Input name="from_name" maxLength={200} />
            </Field>
            <Field label="Daily limit">
              <Input name="daily_limit" type="number" min={1} max={5000} defaultValue={50} required />
            </Field>
            <Field label="Minimum gap between sends (seconds)">
              <Input name="min_gap_seconds" type="number" min={0} defaultValue={600} required />
            </Field>
            <Field label="Status">
              <Select name="status" defaultValue="active">
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="disconnected">disconnected</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button type="submit">Add sender</Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
