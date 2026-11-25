import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { composeMessage } from "../actions";
export default async function ComposePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, org } = await getOrgContext();
  const { data } = await supabase.from("mailboxes").select("id, email").eq("organization_id", org.id).eq("status", "active").in("provider", ["google", "microsoft"]).order("email");
  const boxes = data ?? [];
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link href="/app/unibox" className="text-sm text-slate-500 underline">
        Back to unibox
      </Link>
      <PageHeader title="Compose" />
      {error && <Alert>{error}</Alert>}
      {boxes.length === 0 ? (
        <Alert tone="info">Connect an active Google or Microsoft mailbox on the Mailboxes page to send from the unibox.</Alert>
      ) : (
        <Card>
          <form action={composeMessage} className="flex flex-col gap-3">
            <Field label="From">
              <Select name="mailbox" required>
                {boxes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.email}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="To">
              <Input name="to" type="email" required maxLength={320} />
            </Field>
            <Field label="Subject">
              <Input name="subject" required maxLength={300} />
            </Field>
            <Field label="Message">
              <textarea name="body" required maxLength={20000} rows={10} className="w-full rounded-md border border-slate-300 p-3 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100" />
            </Field>
            <div>
              <Button type="submit">Send</Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
