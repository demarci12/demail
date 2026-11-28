import { Fragment } from "react";
import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { oauthProviders } from "@/lib/env";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { localDayStart } from "@/lib/send/schedule";
import { dailyTarget, type Band } from "@/lib/warmup/plan";
import { addMailbox, deleteMailbox, revokeConnectLink, setMailboxStatus, setWarmup, setWarmupFilterTag, setWarmupWindow } from "./actions";
import { ConnectLinkForm } from "./connect-link-form";
const BAND_STYLE: Record<string, string> = {
  healthy: "bg-emerald-100 text-emerald-800",
  watch: "bg-amber-100 text-amber-800",
  throttled: "bg-orange-100 text-orange-800",
  paused: "bg-red-100 text-red-800",
};
export default async function MailboxesPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const { error, message } = await searchParams;
  const providers = oauthProviders();
  const { supabase, org, canManage } = await getOrgContext();
  const { data: mailboxes } = await supabase.from("mailboxes").select("*").eq("organization_id", org.id).order("email");
  const warmable = (mailboxes ?? []).filter((m) => m.provider !== "resend");
  const now = new Date();
  const [{ data: health }, { data: recent }] = await Promise.all([
    supabase.from("mailbox_health").select("mailbox_id, band, band_changed_at").eq("organization_id", org.id),
    warmable.length === 0
      ? Promise.resolve({ data: [] as { sender_mailbox_id: string; sent_at: string }[] })
      : supabase
          .from("warmup_messages")
          .select("sender_mailbox_id, sent_at")
          .eq("organization_id", org.id)
          .gte("sent_at", new Date(now.getTime() - 36 * 3_600_000).toISOString())
          .limit(2000),
  ]);
  const healthById = new Map((health ?? []).map((h) => [h.mailbox_id, h]));
  const showLinks = canManage && (providers.google || providers.microsoft);
  const { data: links } = showLinks
    ? await supabase
        .from("mailbox_connect_links")
        .select("id, label, uses, max_uses, expires_at")
        .eq("organization_id", org.id)
        .gt("expires_at", now.toISOString())
        .order("created_at", { ascending: false })
    : { data: null };
  const openLinks = (links ?? []).filter((l) => l.uses < l.max_uses);
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader title="Mailboxes" />
      <p className="text-sm text-slate-600">
        A mailbox is a sender identity. Connect a Google or Microsoft mailbox to send from it and read replies, or add a Resend sender (the default free path), which sends through the Resend account configured for this instance and needs an address on a verified domain. SMTP and IMAP mailboxes are not supported.
      </p>
      {error && <Alert>{error}</Alert>}
      {message && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {canManage && (providers.google || providers.microsoft) && (
        <div className="flex gap-2">
          {providers.google && (
            <Link href="/app/mailboxes/connect/google" prefetch={false} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white">
              Connect Google
            </Link>
          )}
          {providers.microsoft && (
            <Link href="/app/mailboxes/connect/microsoft" prefetch={false} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white">
              Connect Microsoft
            </Link>
          )}
        </div>
      )}
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className="p-3">Sender</th>
              <th className="p-3">Provider</th>
              <th className="p-3">Status</th>
              <th className="p-3">Last sync</th>
              <th className="p-3">Daily limit</th>
              <th className="p-3">Min gap (s)</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {(mailboxes ?? []).map((m) => {
              const h = healthById.get(m.id);
              const band = (h?.band ?? "healthy") as Band;
              const dayStart = localDayStart(now, m.timezone).getTime();
              const sentToday = (recent ?? []).filter((x) => x.sender_mailbox_id === m.id && new Date(x.sent_at).getTime() >= dayStart).length;
              return (
              <Fragment key={m.id}>
              <tr className={m.provider === "resend" ? "border-b border-slate-100 last:border-0" : "border-slate-100"}>
                <td className="p-3">
                  {m.from_name ? `${m.from_name} ` : ""}
                  <span className="text-slate-500">{m.email}</span>
                </td>
                <td className="p-3">{m.provider}</td>
                <td className="p-3">
                  {m.status}
                  {m.last_error && <div className="text-xs text-red-600">{m.last_error}</div>}
                </td>
                <td className="p-3 text-slate-500">{m.provider === "resend" ? "n/a" : m.last_synced_at ? new Date(m.last_synced_at).toLocaleString() : "never"}</td>
                <td className="p-3">{m.daily_limit}</td>
                <td className="p-3">{m.min_gap_seconds}</td>
                <td className="flex justify-end gap-2 p-3">
                  {canManage && (
                    <>
                      {m.provider !== "resend" && m.status === "disconnected" ? (
                        <Link href={`/app/mailboxes/connect/${m.provider}`} prefetch={false} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
                          Reconnect
                        </Link>
                      ) : (
                        <form action={setMailboxStatus.bind(null, m.id, m.status === "active" ? "paused" : "active")}>
                          <Button type="submit" variant="secondary">
                            {m.status === "active" ? "Pause" : "Activate"}
                          </Button>
                        </form>
                      )}
                      <form action={deleteMailbox.bind(null, m.id)}>
                        <Button type="submit" variant="danger">
                          Remove
                        </Button>
                      </form>
                    </>
                  )}
                </td>
              </tr>
              {m.provider !== "resend" && (
                <tr className="border-b border-slate-100 last:border-0">
                  <td colSpan={7} className="flex flex-col gap-2 px-3 pb-3 text-xs text-slate-600">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`rounded-full px-2 py-0.5 font-medium ${BAND_STYLE[band]}`}>{band}</span>
                      <span>Warmup {m.warmup_enabled ? "on" : "off"}</span>
                      {m.warmup_enabled && (
                        <span>Today {sentToday} / {dailyTarget(m.warmup_started_at, now, m.timezone, band, h?.band_changed_at)} sent</span>
                      )}
                      {canManage && (
                        <>
                          <form action={setWarmup.bind(null, m.id, !m.warmup_enabled)}>
                            <Button type="submit" variant="secondary">
                              {m.warmup_enabled ? "Turn warmup off" : "Turn warmup on"}
                            </Button>
                          </form>
                          <form action={setWarmupFilterTag.bind(null, m.id, !m.warmup_filter_tag_enabled)}>
                            <Button type="submit" variant="secondary">
                              {m.warmup_filter_tag_enabled ? "Filter tag: on" : "Filter tag: off"}
                            </Button>
                          </form>
                        </>
                      )}
                    </div>
                    {canManage && (
                      <form action={setWarmupWindow.bind(null, m.id)} className="flex flex-wrap items-end gap-2">
                        <Field label="Workday start">
                          <Input name="warmup_start" type="time" defaultValue={m.warmup_start.slice(0, 5)} required />
                        </Field>
                        <Field label="Workday end">
                          <Input name="warmup_end" type="time" defaultValue={m.warmup_end.slice(0, 5)} required />
                        </Field>
                        <Field label="Timezone">
                          <Input name="timezone" defaultValue={m.timezone} maxLength={64} required />
                        </Field>
                        <Button type="submit" variant="secondary">
                          Save workday
                        </Button>
                      </form>
                    )}
                    {m.warmup_filter_tag_enabled && m.warmup_filter_tag && (
                      <div className="flex flex-col gap-1">
                        <div>
                          Warmup mail sent to this mailbox ends with <code className="rounded bg-slate-100 px-1">{m.warmup_filter_tag}</code>. In Gmail, create a filter with Has the words set to that tag, then choose Skip the Inbox and Never send to spam. In Outlook, add a rule on messages that include the tag in the body and move them to a folder.
                        </div>
                      </div>
                    )}
                    <div className="text-slate-500">Warmup runs on weekdays inside the workday, outside 12:00 to 13:00, between the active Google and Microsoft mailboxes of this workspace. It counts toward your provider sending limits on top of the cold daily limit.</div>
                  </td>
                </tr>
              )}
              </Fragment>
              );
            })}
            {(mailboxes ?? []).length === 0 && (
              <tr>
                <td colSpan={7}>
                  <EmptyState title="No senders yet">Connect a Google or Microsoft mailbox, or add an address on a domain you own, then campaigns and warmup can send from it.</EmptyState>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      {showLinks && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-medium">Connect links</h2>
          <p className="text-sm text-slate-600">
            A connect link lets someone without an account, such as a client, connect their own Google or Microsoft mailbox into this workspace. Whoever holds the link can connect up to the number of mailboxes you set until it expires, so share it only with that person.
          </p>
          <ConnectLinkForm />
          {openLinks.length > 0 && (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2">Label</th>
                  <th className="py-2">Used</th>
                  <th className="py-2">Expires</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {openLinks.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2">{l.label || <span className="text-slate-500">No label</span>}</td>
                    <td className="py-2">
                      {l.uses} of {l.max_uses}
                    </td>
                    <td className="py-2 text-slate-500">{new Date(l.expires_at).toLocaleDateString()}</td>
                    <td className="py-2 text-right">
                      <form action={revokeConnectLink.bind(null, l.id)}>
                        <Button type="submit" variant="danger">
                          Revoke
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
      {canManage && (
        <Card>
          <h2 className="mb-3 font-medium">Add Resend sender (default free path)</h2>
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
