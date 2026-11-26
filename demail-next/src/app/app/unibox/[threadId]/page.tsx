import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INTENT_LABELS } from "@/lib/ai/shared";
import { discardReplyDraft, draftReplyWithAi, replyToThread, setThreadStatus } from "../actions";
import { UniboxLive } from "../live";
import { MarkRead } from "../mark-read";
export default async function ThreadPage({ params, searchParams }: { params: Promise<{ threadId: string }>; searchParams: Promise<{ error?: string; drafted?: string }> }) {
  const { threadId } = await params;
  const { error, drafted } = await searchParams;
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
  const [{ data: aiSettings }, { data: draft }, { data: intentRows }] = await Promise.all([
    supabase.from("ai_settings").select("enabled").eq("organization_id", org.id).maybeSingle(),
    supabase.from("ai_drafts").select("id, body").eq("organization_id", org.id).eq("thread_id", thread.id).eq("kind", "reply").eq("status", "draft").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("reply_intents").select("thread_message_id, intent, summary").eq("thread_id", thread.id).eq("organization_id", org.id).eq("status", "done"),
  ]);
  const intents = new Map((intentRows ?? []).map((r) => [r.thread_message_id, r]));
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
        {(messages ?? []).map((m) => {
          const verdict = m.direction === "in" && m.kind === "reply" ? intents.get(m.id) : undefined;
          return (
            <Card key={m.id} className={m.direction === "out" ? "bg-slate-50" : ""}>
              <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                <span>
                  {m.direction === "out" ? "You" : m.from_name || m.from_email}
                  {m.kind !== "sent" && m.kind !== "reply" && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5">{m.kind === "auto_reply" ? "auto reply" : m.kind}</span>}
                </span>
                <time dateTime={m.sent_at}>{new Date(m.sent_at).toLocaleString()}</time>
              </div>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm">{m.body_text}</pre>
              {verdict?.intent && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded bg-slate-100 px-1.5 text-slate-600">{INTENT_LABELS[verdict.intent]}</span>
                  {verdict.summary && <span>AI: {verdict.summary}</span>}
                </p>
              )}
            </Card>
          );
        })}
      </div>
      <Card>
        {draft && (
          <div className="mb-3">
            <Alert tone="info">AI draft. Read and edit it before sending. Nothing is sent until you click Send reply.</Alert>
          </div>
        )}
        <form action={replyToThread.bind(null, thread.id)} className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-600" htmlFor="body">
            Reply
          </label>
          <textarea
            key={draft?.id ?? "empty"}
            id="body"
            name="body"
            required
            maxLength={20000}
            rows={6}
            defaultValue={draft?.body ?? ""}
            autoFocus={!!drafted && !!draft}
            className="w-full rounded-md border border-slate-300 p-3 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
          {draft && <input type="hidden" name="draft_id" value={draft.id} />}
          <div>
            <Button type="submit">Send reply</Button>
          </div>
        </form>
        {draft && (
          <form action={discardReplyDraft.bind(null, thread.id, draft.id)} className="mt-2">
            <Button type="submit" variant="secondary">
              Discard draft
            </Button>
          </form>
        )}
        {aiSettings?.enabled && (
          <form action={draftReplyWithAi.bind(null, thread.id)} className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
            <Input name="instruction" maxLength={1000} placeholder="Optional: what the reply should say" className="min-w-0 flex-1" aria-label="Instruction for the AI draft" />
            <Button type="submit" variant="secondary">
              Draft reply with AI
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
