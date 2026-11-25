import { getOrgContext } from "@/lib/org";
import { recordsToPublish, type ProviderHint } from "@/lib/deliverability/dns";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { localDayStart } from "@/lib/send/schedule";
import { dailyTarget, type Band } from "@/lib/warmup/plan";
import { addDomain, checkDomainNow, removeDomain } from "./actions";

const BAND_STYLE: Record<string, string> = {
  healthy: "bg-emerald-100 text-emerald-800",
  watch: "bg-amber-100 text-amber-800",
  throttled: "bg-orange-100 text-orange-800",
  paused: "bg-red-100 text-red-800",
};
const STATUS_STYLE: Record<string, string> = {
  pass: "bg-emerald-100 text-emerald-800",
  fail: "bg-red-100 text-red-800",
  missing: "bg-amber-100 text-amber-800",
  unknown: "bg-slate-100 text-slate-700",
};

function Badge({ label, style }: { label: string; style: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{label}</span>;
}

function RecordBlock({ title, host, value, note }: { title: string; host: string; value: string | null; note: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs font-medium text-slate-600">{title}</div>
      <div className="text-xs text-slate-500">Host: {host}</div>
      {value && <code className="block select-all break-all rounded-md bg-slate-100 p-2 text-xs">{value}</code>}
      <div className="text-xs text-slate-500">{note}</div>
    </div>
  );
}

const pct = (v: number, digits = 1) => `${(Number(v) * 100).toFixed(digits)}%`;

export default async function DeliverabilityPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const { error, message } = await searchParams;
  const { supabase, org, user, canManage } = await getOrgContext();
  const now = new Date();
  const [{ data: mailboxes }, { data: health }, { data: events }, { data: domains }, { data: warm }] = await Promise.all([
    supabase.from("mailboxes").select("id, email, provider, timezone, warmup_enabled, warmup_started_at").eq("organization_id", org.id).order("email"),
    supabase.from("mailbox_health").select("*").eq("organization_id", org.id),
    supabase.from("mailbox_health_events").select("mailbox_id, to_band, created_at").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(200),
    supabase.from("sending_domains").select("*").eq("organization_id", org.id).order("domain"),
    supabase
      .from("warmup_messages")
      .select("sender_mailbox_id, turn, placement, sent_at")
      .eq("organization_id", org.id)
      .gte("sent_at", new Date(now.getTime() - 7 * 86_400_000).toISOString())
      .limit(5000),
  ]);
  const healthById = new Map((health ?? []).map((h) => [h.mailbox_id, h]));
  const warmRows = (mailboxes ?? [])
    .filter((m) => m.warmup_enabled)
    .map((m) => {
      const h = healthById.get(m.id);
      const dayStart = localDayStart(now, m.timezone).getTime();
      const mine = (warm ?? []).filter((w) => w.sender_mailbox_id === m.id);
      const checked = mine.filter((w) => w.placement === "inbox" || w.placement === "spam" || w.placement === "other");
      return {
        id: m.id,
        email: m.email,
        target: dailyTarget(m.warmup_started_at, now, m.timezone, (h?.band ?? "healthy") as Band, h?.band_changed_at),
        sent: mine.filter((w) => new Date(w.sent_at).getTime() >= dayStart).length,
        replies: mine.filter((w) => w.turn > 1).length,
        checked: checked.length,
        spam: checked.filter((w) => w.placement === "spam").length,
      };
    });
  const lastChange = new Map<string, string>();
  for (const e of events ?? []) if (!lastChange.has(e.mailbox_id)) lastChange.set(e.mailbox_id, e.created_at);
  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <PageHeader title="Deliverability" />
      <p className="text-sm text-slate-600">
        Bands and DNS checks are guidance based on the last 7 days of your own sending. Nothing here guarantees inbox placement or improves your sender reputation. Bands refresh every few minutes when the database schedule from the setup guide is installed.
      </p>
      {error && <Alert>{error}</Alert>}
      {message && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className="p-3">Mailbox</th>
              <th className="p-3">Band</th>
              <th className="p-3">Sent (7d)</th>
              <th className="p-3">Bounce</th>
              <th className="p-3">Complaint</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Last change</th>
            </tr>
          </thead>
          <tbody>
            {(mailboxes ?? []).map((m) => {
              const h = healthById.get(m.id);
              const band = h?.band ?? "healthy";
              const changed = lastChange.get(m.id);
              return (
                <tr key={m.id} className="border-b border-slate-100 last:border-0">
                  <td className="p-3">{m.email}</td>
                  <td className="p-3">
                    <Badge label={band} style={BAND_STYLE[band]} />
                  </td>
                  <td className="p-3">{h?.sent_7d ?? 0}</td>
                  <td className="p-3">{pct(h?.bounce_rate ?? 0)}</td>
                  <td className="p-3">{pct(h?.complaint_rate ?? 0, 2)}</td>
                  <td className="p-3 text-slate-600">{h?.reason ?? "None"}</td>
                  <td className="p-3 text-slate-500">{changed ? new Date(changed).toLocaleString() : "None"}</td>
                </tr>
              );
            })}
            {(mailboxes ?? []).length === 0 && (
              <tr>
                <td className="p-3 text-slate-500" colSpan={7}>
                  Add a mailbox to see its health.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2 className="mb-1 font-medium">Bands</h2>
        <p className="text-sm text-slate-600">
          Rates use the last 7 days and divide by the larger of messages sent and 20. Watch starts at 2% bounces or 0.1% complaints, or when SPF or DMARC is missing. Throttled starts at 5% or 0.3% and halves the daily limit and doubles the minimum gap. Paused starts at 8% or 0.5% and stops cold sending from that mailbox. A mailbox moves down one band at a time, at least 24 hours apart. Gmail and Microsoft mailboxes do not report spam complaints, so complaints only come from the Resend webhook.
        </p>
      </Card>
      <Card className="p-0">
        <div className="p-3">
          <h2 className="font-medium">Warmup</h2>
          <p className="text-sm text-slate-600">
            Warmup sends ordinary conversations between your own Google and Microsoft mailboxes. The figures below describe what happened to that mail. They promise nothing about inbox placement or sender reputation. Spam share needs at least 10 checked messages.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="border-y border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className="p-3">Mailbox</th>
              <th className="p-3">Target today</th>
              <th className="p-3">Sent today</th>
              <th className="p-3">Replies (7d)</th>
              <th className="p-3">Landed in spam (7d)</th>
            </tr>
          </thead>
          <tbody>
            {warmRows.map((w) => (
              <tr key={w.id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">{w.email}</td>
                <td className="p-3">{w.target}</td>
                <td className="p-3">{w.sent}</td>
                <td className="p-3">{w.replies}</td>
                <td className="p-3">{w.checked >= 10 ? `${Math.round((w.spam / w.checked) * 100)}% of ${w.checked}` : `${w.spam} of ${w.checked} checked`}</td>
              </tr>
            ))}
            {warmRows.length === 0 && (
              <tr>
                <td className="p-3 text-slate-500" colSpan={5}>
                  Turn warmup on for at least two Google or Microsoft mailboxes on the Mailboxes page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <h2 className="mt-2 text-lg font-semibold">Sending domains</h2>
      {(domains ?? []).length === 0 && <p className="text-sm text-slate-500">No domains yet. Domains of your mailboxes are added automatically, or add one below.</p>}
      {(domains ?? []).map((d) => {
        const hint = d.provider_hint as ProviderHint;
        const rec = recordsToPublish(d.domain, hint, user.email ?? "postmaster@" + d.domain, d.spf_record, d.dkim_selector);
        return (
          <Card key={d.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">{d.domain}</span>
              <span className="text-xs text-slate-500">{d.provider_hint}</span>
              <span className="flex items-center gap-1 text-xs">
                SPF <Badge label={d.spf_status} style={STATUS_STYLE[d.spf_status]} />
              </span>
              <span className="flex items-center gap-1 text-xs">
                DKIM <Badge label={d.dkim_status} style={STATUS_STYLE[d.dkim_status]} />
              </span>
              <span className="flex items-center gap-1 text-xs">
                DMARC <Badge label={d.dmarc_status} style={STATUS_STYLE[d.dmarc_status]} />
              </span>
              <span className="text-xs text-slate-500">{d.last_checked_at ? `Checked ${new Date(d.last_checked_at).toLocaleString()}` : "Not checked yet"}</span>
              {canManage && (
                <div className="ml-auto flex gap-2">
                  <form action={checkDomainNow.bind(null, d.id)}>
                    <Button type="submit" variant="secondary">
                      Check now
                    </Button>
                  </form>
                  <form action={removeDomain.bind(null, d.id)}>
                    <Button type="submit" variant="danger">
                      Remove
                    </Button>
                  </form>
                </div>
              )}
            </div>
            {d.dkim_status === "unknown" && (
              <p className="text-xs text-slate-500">DKIM shows unknown when none of the common selectors answer. The selector is chosen by your provider, so set it when adding the domain if yours differs.</p>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              <RecordBlock title="SPF (TXT)" host={rec.spf.host} value={rec.spf.value} note={rec.spf.note} />
              <RecordBlock title="DKIM" host={rec.dkim.host} value={null} note={rec.dkim.note} />
              <RecordBlock title="DMARC (TXT)" host={rec.dmarc.host} value={rec.dmarc.value} note="Starts in monitor mode (p=none). Tighten the policy once reports look clean." />
            </div>
          </Card>
        );
      })}
      {canManage && (
        <Card>
          <h2 className="mb-3 font-medium">Add domain</h2>
          <form action={addDomain} className="grid grid-cols-2 gap-3">
            <Field label="Domain">
              <Input name="domain" placeholder="example.com" required maxLength={253} pattern="([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}" />
            </Field>
            <Field label="Provider">
              <Select name="provider_hint" defaultValue="google">
                <option value="google">Google Workspace</option>
                <option value="microsoft">Microsoft 365</option>
                <option value="resend">Resend</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="DKIM selector (optional)">
              <Input name="dkim_selector" maxLength={63} placeholder="google" />
            </Field>
            <div className="flex items-end">
              <Button type="submit">Add domain</Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
