import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { INTENTS, INTENT_LABELS, isIntent } from "@/lib/ai/shared";
import { syncNow } from "./actions";
import { UniboxLive } from "./live";
const PAGE = 30;
type Search = { error?: string; mailbox?: string; status?: string; unread?: string; intent?: string; before?: string };
export default async function UniboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { supabase, org } = await getOrgContext();
  const status = sp.status === "archived" ? "archived" : "open";
  const { data: boxes } = await supabase.from("mailboxes").select("id, email, provider, status").eq("organization_id", org.id).order("email");
  const mailboxes = boxes ?? [];
  const oauth = mailboxes.filter((m) => m.provider !== "resend");
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? sp.before : null;
  let q = supabase.from("threads").select("*").eq("organization_id", org.id).eq("status", status).order("last_message_at", { ascending: false }).limit(PAGE + 1);
  if (sp.mailbox && mailboxes.some((m) => m.id === sp.mailbox)) q = q.eq("mailbox_id", sp.mailbox);
  if (sp.unread === "1") q = q.eq("is_unread", true);
  if (isIntent(sp.intent)) q = q.eq("intent", sp.intent);
  if (before) q = q.lt("last_message_at", before);
  const { data } = await q;
  const rows = data ?? [];
  const threads = rows.slice(0, PAGE);
  const contactIds = [...new Set(threads.map((t) => t.contact_id).filter((v): v is string => !!v))];
  const { data: contactRows } = contactIds.length ? await supabase.from("contacts").select("id, email, first_name, last_name").eq("organization_id", org.id).in("id", contactIds) : { data: [] };
  const contacts = new Map((contactRows ?? []).map((c) => [c.id, c]));
  const boxEmail = new Map(mailboxes.map((m) => [m.id, m.email]));
  const params = new URLSearchParams();
  if (status === "archived") params.set("status", "archived");
  if (sp.mailbox) params.set("mailbox", sp.mailbox);
  if (sp.unread === "1") params.set("unread", "1");
  if (isIntent(sp.intent)) params.set("intent", sp.intent);
  const nextParams = new URLSearchParams(params);
  if (rows.length > PAGE) nextParams.set("before", threads[threads.length - 1].last_message_at);
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <UniboxLive organizationId={org.id} />
      <PageHeader
        title="Unibox"
        actions={
          <>
            <form action={syncNow}>
              <Button type="submit" variant="secondary">
                Sync now
              </Button>
            </form>
            <Link href="/app/unibox/compose" className="inline-flex h-9 items-center rounded-md bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700">
              Compose
            </Link>
          </>
        }
      />
      {sp.error && <Alert>{sp.error}</Alert>}
      <form className="flex flex-wrap items-center gap-2 text-sm" method="get">
        <Select name="status" defaultValue={status} className="w-32" aria-label="Status">
          <option value="open">Open</option>
          <option value="archived">Archived</option>
        </Select>
        <Select name="mailbox" defaultValue={sp.mailbox ?? ""} className="w-56" aria-label="Mailbox">
          <option value="">All mailboxes</option>
          {oauth.map((m) => (
            <option key={m.id} value={m.id}>
              {m.email}
            </option>
          ))}
        </Select>
        <Select name="intent" defaultValue={isIntent(sp.intent) ? sp.intent : ""} className="w-44" aria-label="Intent">
          <option value="">Any intent</option>
          {INTENTS.map((i) => (
            <option key={i} value={i}>
              {INTENT_LABELS[i]}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="unread" value="1" defaultChecked={sp.unread === "1"} /> Unread only
        </label>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      <Card className="p-0">
        <ul>
          {threads.map((t) => {
            const c = t.contact_id ? contacts.get(t.contact_id) : undefined;
            const who = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email : "Unknown sender";
            return (
              <li key={t.id} className="border-b border-slate-100 last:border-0">
                <Link href={`/app/unibox/${t.id}`} className="flex items-start gap-3 p-3 hover:bg-slate-50">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.is_unread ? "bg-sky-600" : "bg-transparent"}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`flex gap-2 text-sm ${t.is_unread ? "font-semibold" : ""}`}>
                      <span className="shrink-0">{who}</span>
                      <span className="truncate">{t.subject || "(no subject)"}</span>
                      {t.intent && <span className="shrink-0 rounded bg-slate-100 px-1.5 text-xs font-normal text-slate-600">{INTENT_LABELS[t.intent]}</span>}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{t.snippet}</span>
                    <span className="block text-xs text-slate-400">{boxEmail.get(t.mailbox_id)}</span>
                  </span>
                  <time className="shrink-0 text-xs text-slate-500" dateTime={t.last_message_at}>
                    {new Date(t.last_message_at).toLocaleString()}
                  </time>
                </Link>
              </li>
            );
          })}
          {threads.length === 0 && (
            <li className="p-4 text-sm text-slate-500">
              {oauth.length === 0 ? (
                <>
                  No Google or Microsoft mailbox is connected. <Link href="/app/mailboxes" className="underline">Connect one on the Mailboxes page</Link> to read replies here.
                </>
              ) : (
                "Nothing here yet. Only replies to Demail campaign mail and mail you send from the unibox appear."
              )}
            </li>
          )}
        </ul>
      </Card>
      {rows.length > PAGE && (
        <Link href={`/app/unibox?${nextParams.toString()}`} className="self-start text-sm text-sky-700 underline">
          Older threads
        </Link>
      )}
    </div>
  );
}
