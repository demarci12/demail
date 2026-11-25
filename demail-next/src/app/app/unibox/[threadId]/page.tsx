import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { replyToThread, setThreadStatus } from "../actions";
import { UniboxLive } from "../live";
import { MarkRead } from "../mark-read";
export default async function ThreadPage({ params, searchParams }: { params: Promise<{ threadId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { threadId } = await params;
  const { error } = await searchParams;
  const { supabase, org } = await getOrgContext();
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) notFound();
  const { data: thread } = await supabase.from("threads").select("*").eq("id", threadId).eq("organization_id", org.id).maybeSingle();
  if (!thread) notFound();
  const [{ data: messages }, { data: contact }, { data: campaign }, { data: mailbox }] = await Promise.all([
    supabase.from("thread_messages").select("*").eq("thread_id", thread.id).eq("organization_id", org.id).order("sent_at", { ascending: true }),
    thread.contact_id ? supabase.from("contacts").select("id, email, first_name, last_name").eq("id", thread.contact_id).eq("organization_id", org.id).maybeSingle() : Promise.resolve({ data: null }),
    thread.campaign_id ? supabase.from("campaigns").select("id, name").eq("id", thread.campaign_id).eq("organization_id", org.id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("mailboxes").select("email").eq("id", thread.mailbox_id).eq("organization_id", org.id).maybeSingle(),
  ]);
  const archived = thread.status === "archived";
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <UniboxLive organizationId={org.id} />
      {thread.is_unread && <MarkRead threadId={thread.id} />}
      <Link href="/app/unibox" className="text-sm text-slate-500 underline">
        Back to unibox
      </Link>
      <PageHeader
        title={thread.subject || "(no subject)"}
        actions={
          <form action={setThreadStatus.bind(null, thread.id, archived ? "open" : "archived")}>
            <Button type="submit" variant="secondary">
              {archived ? "Reopen" : "Archive"}
            </Button>
          </form>
        }
      />
      <p className="text-sm text-slate-600">
        Mailbox {mailbox?.email ?? "removed"}
        {contact && <> · Contact {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email} ({contact.email})</>}
        {campaign && (
          <>
            {" "}· Campaign <Link href={`/app/campaigns/${campaign.id}`} className="underline">{campaign.name}</Link>
          </>
        )}
      </p>
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-col gap-3">
        {(messages ?? []).map((m) => (
          <Card key={m.id} className={m.direction === "out" ? "bg-slate-50" : ""}>
            <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
              <span>
                {m.direction === "out" ? "You" : m.from_name || m.from_email}
                {m.kind !== "sent" && m.kind !== "reply" && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5">{m.kind === "auto_reply" ? "auto reply" : m.kind}</span>}
              </span>
              <time dateTime={m.sent_at}>{new Date(m.sent_at).toLocaleString()}</time>
            </div>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm">{m.body_text}</pre>
          </Card>
        ))}
      </div>
      <Card>
        <form action={replyToThread.bind(null, thread.id)} className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-600" htmlFor="body">
            Reply
          </label>
          <textarea id="body" name="body" required maxLength={20000} rows={6} className="w-full rounded-md border border-slate-300 p-3 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100" />
          <div>
            <Button type="submit">Send reply</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
