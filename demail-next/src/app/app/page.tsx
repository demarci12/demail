import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, PageHeader } from "@/components/ui/card";

type Step = { key: string; title: string; text: string; href: string; cta: string; done: boolean };

export default async function WorkspaceHome() {
  const { supabase, org, canManage } = await getOrgContext();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const since = weekAgo.toISOString();
  const [mailboxes, contacts, campaigns, launched, sent, replies, beat] = await Promise.all([
    supabase.from("mailboxes").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "active"),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
    supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("organization_id", org.id).in("status", ["active", "paused", "completed"]),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "sent").gte("sent_at", since),
    supabase.from("thread_messages").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("direction", "in").eq("kind", "reply").gte("sent_at", since),
    canManage ? createAdminClient().from("cron_heartbeats").select("last_run_at").eq("job", "send").maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const activeCampaigns = await supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "active");

  const steps: Step[] = [
    { key: "mailbox", title: "Connect a mailbox", text: "Campaigns send from your own Google or Microsoft mailbox.", href: "/app/mailboxes", cta: "Connect a mailbox", done: (mailboxes.count ?? 0) > 0 },
    { key: "contacts", title: "Add contacts", text: "Import a CSV or add people one by one.", href: "/app/contacts/import", cta: "Import contacts", done: (contacts.count ?? 0) > 0 },
    { key: "campaign", title: "Write a campaign", text: "Add email steps, pick senders and enroll contacts.", href: "/app/campaigns/new", cta: "New campaign", done: (campaigns.count ?? 0) > 0 },
    { key: "launch", title: "Launch it", text: "Review the campaign, then start it. Nothing sends before you do.", href: "/app/campaigns", cta: "Open campaigns", done: (launched.count ?? 0) > 0 },
    ...(canManage
      ? [{ key: "scheduler", title: "Start the scheduler", text: "A scheduler calls Demail every minute to send mail and read replies. Run supabase/setup/schedule.sql once.", href: "/app/settings/health", cta: "Check setup health", done: !!beat.data } satisfies Step]
      : []),
  ];
  const remaining = steps.filter((s) => !s.done);
  const next = remaining[0];
  const stats = [
    { label: "Contacts", value: contacts.count ?? 0, href: "/app/contacts" },
    { label: "Active campaigns", value: activeCampaigns.count ?? 0, href: "/app/campaigns" },
    { label: "Sent, last 7 days", value: sent.count ?? 0, href: "/app/campaigns" },
    { label: "Replies, last 7 days", value: replies.count ?? 0, href: "/app/unibox" },
  ];

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={org.name} />
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="rounded-lg border border-slate-200 bg-white p-4 hover:bg-slate-50">
            <dt className="text-xs text-slate-500">{s.label}</dt>
            <dd className="mt-1 text-2xl font-semibold">{s.value}</dd>
          </Link>
        ))}
      </dl>
      {remaining.length > 0 ? (
        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="font-medium">Getting started</h2>
            <p className="text-sm text-slate-600">
              {steps.length - remaining.length} of {steps.length} done. Next: {next.title.toLowerCase()}.
            </p>
          </div>
          <ol className="flex flex-col gap-3">
            {steps.map((s) => (
              <li key={s.key} className="flex items-start gap-3 text-sm">
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${s.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent"}`}
                >
                  ✓
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className={s.done ? "text-slate-500 line-through" : "font-medium"}>{s.title}</span>
                  {!s.done && (
                    <>
                      <span className="text-slate-600">{s.text}</span>
                      <Link href={s.href} className="text-sky-700">
                        {s.cta}
                      </Link>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <p className="text-sm text-slate-600">
          Setup is complete. Open the{" "}
          <Link href="/app/unibox" className="text-sky-700">
            unibox
          </Link>{" "}
          for replies or{" "}
          <Link href="/app/deliverability" className="text-sky-700">
            deliverability
          </Link>{" "}
          to watch your sending.
        </p>
      )}
    </div>
  );
}
