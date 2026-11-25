import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { SAMPLE_CONTACT, contactData, renderTemplate, type MergeData } from "@/lib/merge";
import { CampaignFields } from "../settings-fields";
import { MergeInsert } from "../merge-insert";
import { addStep, addVariant, deleteStep, deleteVariant, enrollContacts, launchCampaign, moveStep, pauseCampaign, saveSenders, updateCampaign, updateStep, updateVariant } from "../actions";
function waitParts(seconds: number | null) {
  const s = seconds ?? 86400;
  if (s % 86400 === 0) return { amount: s / 86400, unit: "days" };
  if (s % 3600 === 0) return { amount: s / 3600, unit: "hours" };
  return { amount: Math.max(1, Math.round(s / 60)), unit: "minutes" };
}
function WaitFields({ seconds }: { seconds: number | null }) {
  const w = waitParts(seconds);
  return (
    <div className="flex items-end gap-2">
      <Field label="Wait">
        <Input name="amount" type="number" min={1} max={365} defaultValue={w.amount} required />
      </Field>
      <Select name="unit" defaultValue={w.unit} aria-label="Unit">
        <option value="minutes">minutes</option>
        <option value="hours">hours</option>
        <option value="days">days</option>
      </Select>
    </div>
  );
}
function EmailFields({ subject, body, name, withName = true }: { subject?: string | null; body?: string | null; name?: string | null; withName?: boolean }) {
  return (
    <>
      {withName && (
        <Field label="Step name (optional)">
          <Input name="name" maxLength={200} defaultValue={name ?? ""} />
        </Field>
      )}
      <Field label="Subject">
        <Input name="subject" required maxLength={500} defaultValue={subject ?? ""} data-merge-target="" />
      </Field>
      <Field label="Body">
        <textarea
          name="body_plain"
          required
          rows={6}
          defaultValue={body ?? ""}
          data-merge-target=""
          className="w-full rounded-md border border-slate-300 bg-white p-3 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
        />
      </Field>
      <MergeInsert />
    </>
  );
}
function Preview({ subject: subjectTemplate, body: bodyTemplate, data, to }: { subject: string; body: string; data: MergeData; to: string }) {
  const subject = renderTemplate(subjectTemplate, data);
  const body = renderTemplate(bodyTemplate, data);
  return (
    <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
      <p className="mb-1 text-xs font-medium uppercase text-slate-500">Preview for {to}</p>
      {subject.ok && body.ok ? (
        <>
          <p className="font-medium">{subject.text}</p>
          <p className="whitespace-pre-wrap">{body.text}</p>
        </>
      ) : (
        <p className="text-red-700">Missing merge field: {[...new Set([...(subject.ok ? [] : subject.missing), ...(body.ok ? [] : body.missing)])].join(", ")}. Add a fallback such as {"{{first_name|there}}"}.</p>
      )}
    </div>
  );
}
type Stat = { sent: number; opened: number; clicked: number; replied: number; bounced: number };
type StatLine = { key: string; label: string; sub?: boolean; stat: Stat };
const zeroStat = (): Stat => ({ sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 });
function addStat(into: Stat, r: Stat) {
  into.sent += Number(r.sent);
  into.opened += Number(r.opened);
  into.clicked += Number(r.clicked);
  into.replied += Number(r.replied);
  into.bounced += Number(r.bounced);
}
function countPct(n: number, sent: number) {
  return `${n} (${sent > 0 ? Math.round((n / sent) * 100) : 0}%)`;
}
function StatsTable({ title, first, lines }: { title: string; first: string; lines: StatLine[] }) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1.5 pr-3 font-normal">{first}</th>
              <th className="py-1.5 pr-3 text-right font-normal">Sent</th>
              <th className="py-1.5 pr-3 text-right font-normal">Opened</th>
              <th className="py-1.5 pr-3 text-right font-normal">Clicked</th>
              <th className="py-1.5 pr-3 text-right font-normal">Replied</th>
              <th className="py-1.5 text-right font-normal">Bounced</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className={`border-b border-slate-100 ${l.sub ? "text-slate-600" : ""}`}>
                <td className={`py-1.5 pr-3 ${l.sub ? "pl-4" : "font-medium"}`}>{l.label}</td>
                <td className="py-1.5 pr-3 text-right">{l.stat.sent}</td>
                <td className="py-1.5 pr-3 text-right">{countPct(l.stat.opened, l.stat.sent)}</td>
                <td className="py-1.5 pr-3 text-right">{countPct(l.stat.clicked, l.stat.sent)}</td>
                <td className="py-1.5 pr-3 text-right">{countPct(l.stat.replied, l.stat.sent)}</td>
                <td className="py-1.5 text-right">{l.stat.bounced}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; msg?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, org } = await getOrgContext();
  const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!campaign) notFound();
  const [{ data: steps }, { data: mailboxes }, { data: selected }, { data: labels }, { data: enrollments }, { data: sample }, { data: engagement }, { data: messageStats }] = await Promise.all([
    supabase.from("campaign_steps").select("*").eq("campaign_id", id).eq("organization_id", org.id).order("position"),
    supabase.from("mailboxes").select("id, email, from_name, status").eq("organization_id", org.id).order("email"),
    supabase.from("campaign_mailboxes").select("mailbox_id").eq("campaign_id", id).eq("organization_id", org.id),
    supabase.from("labels").select("id, name").eq("organization_id", org.id).order("name"),
    supabase.from("campaign_contacts").select("status").eq("campaign_id", id).eq("organization_id", org.id).limit(10000),
    supabase.from("contacts").select("*").eq("organization_id", org.id).order("created_at").limit(1).maybeSingle(),
    supabase.rpc("campaign_engagement", { p_campaign: id }),
    supabase.rpc("campaign_message_stats", { p_campaign: id }),
  ]);
  const stepIds = (steps ?? []).map((s) => s.id);
  const { data: variantRows } = stepIds.length
    ? await supabase.from("campaign_step_variants").select("*").eq("organization_id", org.id).in("step_id", stepIds).order("label")
    : { data: [] };
  const variantsByStep = new Map<string, NonNullable<typeof variantRows>>();
  for (const v of variantRows ?? []) variantsByStep.set(v.step_id, [...(variantsByStep.get(v.step_id) ?? []), v]);
  const stats = engagement?.[0];
  const sentCount = Number(stats?.sent ?? 0);
  const pct = (n: number) => (sentCount > 0 ? `${Math.round((n / sentCount) * 100)}%` : "0%");
  const statRows = messageStats ?? [];
  const stepLines: StatLine[] = [];
  const mailboxLines: StatLine[] = [];
  if (statRows.some((r) => Number(r.sent) > 0)) {
    const stepIndex = new Map((steps ?? []).map((s, i) => [s.id, i]));
    (steps ?? []).forEach((s, i) => {
      if (s.type !== "email") return;
      const rows = statRows.filter((r) => r.step_id === s.id);
      const total = zeroStat();
      for (const r of rows) addStat(total, r);
      const label = s.name?.trim() || (s.subject ?? "").slice(0, 60) || "Email";
      stepLines.push({ key: s.id, label: `${i + 1}. ${label}`, stat: total });
      const known = variantsByStep.get(s.id) ?? [];
      if (known.length === 0 && rows.every((r) => r.variant_id === null)) return;
      const variantStat = (vid: string | null) => {
        const st = zeroStat();
        for (const r of rows) if (r.variant_id === vid) addStat(st, r);
        return st;
      };
      stepLines.push({ key: `${s.id}:A`, label: "Variant A", sub: true, stat: variantStat(null) });
      for (const v of known) stepLines.push({ key: v.id, label: `Variant ${v.label}${v.active ? "" : " (archived)"}`, sub: true, stat: variantStat(v.id) });
      const knownIds = new Set(known.map((v) => v.id));
      const other = zeroStat();
      for (const r of rows) if (r.variant_id !== null && !knownIds.has(r.variant_id)) addStat(other, r);
      if (other.sent > 0) stepLines.push({ key: `${s.id}:removed`, label: "Removed variant", sub: true, stat: other });
    });
    const removedStep = zeroStat();
    for (const r of statRows) if (r.step_id === null || !stepIndex.has(r.step_id)) addStat(removedStep, r);
    if (removedStep.sent > 0) stepLines.push({ key: "removed-step", label: "Removed step", stat: removedStep });
    const byMailbox = new Map<string, Stat>();
    for (const r of statRows) {
      const key = r.mailbox_id !== null && (mailboxes ?? []).some((m) => m.id === r.mailbox_id) ? r.mailbox_id : "removed";
      const st = byMailbox.get(key) ?? zeroStat();
      addStat(st, r);
      byMailbox.set(key, st);
    }
    for (const m of mailboxes ?? []) {
      const st = byMailbox.get(m.id);
      if (st) mailboxLines.push({ key: m.id, label: m.email, stat: st });
    }
    const removedMailbox = byMailbox.get("removed");
    if (removedMailbox) mailboxLines.push({ key: "removed-mailbox", label: "Removed mailbox", stat: removedMailbox });
  }
  const chosen = new Set((selected ?? []).map((s) => s.mailbox_id));
  const counts: Record<string, number> = {};
  for (const e of enrollments ?? []) counts[e.status] = (counts[e.status] ?? 0) + 1;
  const sampleData = sample ? contactData(sample) : SAMPLE_CONTACT;
  const locked = campaign.status === "active";
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        title={campaign.name}
        actions={
          <>
            <span className="text-sm text-slate-500">{campaign.status}</span>
            {locked ? (
              <form action={pauseCampaign.bind(null, id)}>
                <Button type="submit" variant="secondary">
                  Pause
                </Button>
              </form>
            ) : (
              <form action={launchCampaign.bind(null, id)}>
                <Button type="submit">{campaign.status === "paused" ? "Resume" : "Launch"}</Button>
              </form>
            )}
            <Link href="/app/campaigns" className="text-sm text-sky-700">
              Back
            </Link>
          </>
        }
      />
      {sp.error && <Alert>{sp.error}</Alert>}
      {sp.msg && <Alert tone="info">{sp.msg}</Alert>}
      <Card>
        <h2 className="mb-3 font-medium">Results</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <div>
            <dt className="text-slate-500">Sent</dt>
            <dd className="text-lg font-medium">{sentCount}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Opened</dt>
            <dd className="text-lg font-medium">{campaign.track_opens || Number(stats?.opened ?? 0) > 0 ? pct(Number(stats?.opened ?? 0)) : "Off"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Clicked</dt>
            <dd className="text-lg font-medium">{campaign.track_clicks || Number(stats?.clicked ?? 0) > 0 ? pct(Number(stats?.clicked ?? 0)) : "Off"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Replied</dt>
            <dd className="text-lg font-medium">{Number(stats?.replied ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Bounced</dt>
            <dd className="text-lg font-medium">{Number(stats?.bounced ?? 0)}</dd>
          </div>
        </dl>
        {stepLines.length > 0 && <StatsTable title="By step" first="Step" lines={stepLines} />}
        {mailboxLines.length > 0 && <StatsTable title="By mailbox" first="Mailbox" lines={mailboxLines} />}
        <p className="mt-3 text-xs text-slate-500">Opens are an estimate. Privacy proxies and image blocking hide real reads, and automated link scanners are filtered out on a best effort basis.</p>
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">Steps</h2>
        {locked && <p className="mb-3 text-sm text-slate-500">Pause the campaign to change steps.</p>}
        <div className="flex flex-col gap-4">
          {(steps ?? []).map((s, i) => {
            const stepVariants = s.type === "email" ? (variantsByStep.get(s.id) ?? []) : [];
            const previewTo = sample?.email ?? "a sample contact";
            return (
              <div key={s.id} className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase text-slate-500">
                  <span>
                    {i + 1}. {s.type}
                  </span>
                  <span className="flex gap-1">
                    <form action={moveStep.bind(null, id, s.id, "up")}>
                      <Button type="submit" variant="secondary" className="h-7 px-2" disabled={locked || i === 0}>
                        Up
                      </Button>
                    </form>
                    <form action={moveStep.bind(null, id, s.id, "down")}>
                      <Button type="submit" variant="secondary" className="h-7 px-2" disabled={locked || i === (steps ?? []).length - 1}>
                        Down
                      </Button>
                    </form>
                    <form action={deleteStep.bind(null, id, s.id)}>
                      <Button type="submit" variant="danger" className="h-7 px-2" disabled={locked}>
                        Delete
                      </Button>
                    </form>
                  </span>
                </div>
                {stepVariants.length > 0 && <p className="mb-2 text-sm font-medium">Variant A</p>}
                <form action={updateStep.bind(null, id, s.id, s.type)} className="flex flex-col gap-3">
                  {s.type === "email" ? <EmailFields subject={s.subject} body={s.body_plain} name={s.name} /> : <WaitFields seconds={s.wait_seconds} />}
                  <Button type="submit" variant="secondary" disabled={locked}>
                    Save step
                  </Button>
                </form>
                {s.type === "email" && <Preview subject={s.subject ?? ""} body={s.body_plain ?? ""} data={sampleData} to={previewTo} />}
                {stepVariants
                  .filter((v) => v.active)
                  .map((v) => (
                    <div key={v.id} className="mt-4 border-t border-slate-200 pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium">Variant {v.label}</p>
                        <form action={deleteVariant.bind(null, id, v.id)}>
                          <Button type="submit" variant="danger" className="h-7 px-2" disabled={locked}>
                            Delete
                          </Button>
                        </form>
                      </div>
                      <form action={updateVariant.bind(null, id, v.id)} className="flex flex-col gap-3">
                        <EmailFields subject={v.subject} body={v.body_plain} withName={false} />
                        <Button type="submit" variant="secondary" disabled={locked}>
                          Save variant
                        </Button>
                      </form>
                      <Preview subject={v.subject} body={v.body_plain} data={sampleData} to={previewTo} />
                    </div>
                  ))}
                {stepVariants
                  .filter((v) => !v.active)
                  .map((v) => (
                    <p key={v.id} className="mt-2 text-sm text-slate-500">
                      Variant {v.label} (archived)
                    </p>
                  ))}
                {s.type === "email" && (
                  <form action={addVariant.bind(null, id, s.id)} className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3">
                    <h3 className="text-sm font-medium">Add variant</h3>
                    <p className="text-xs text-slate-500">Each enrollment gets one variant of this step, split evenly. Variants are plain text.</p>
                    <EmailFields withName={false} />
                    <Button type="submit" variant="secondary" disabled={locked}>
                      Add variant
                    </Button>
                  </form>
                )}
              </div>
            );
          })}
          {(steps ?? []).length === 0 && <p className="text-sm text-slate-500">No steps yet.</p>}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 md:grid-cols-2">
          <form action={addStep.bind(null, id, "email")} className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Add email step</h3>
            <EmailFields />
            <Button type="submit" disabled={locked}>
              Add email
            </Button>
          </form>
          <form action={addStep.bind(null, id, "wait")} className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Add wait step</h3>
            <WaitFields seconds={null} />
            <Button type="submit" disabled={locked}>
              Add wait
            </Button>
          </form>
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">Senders</h2>
        <form action={saveSenders.bind(null, id)} className="flex flex-col gap-2 text-sm">
          {(mailboxes ?? []).map((m) => (
            <label key={m.id} className="flex items-center gap-2">
              <input type="checkbox" name="mailbox" value={m.id} defaultChecked={chosen.has(m.id)} />
              {m.from_name ? `${m.from_name} ` : ""}
              <span className="text-slate-500">{m.email}</span>
              {m.status !== "active" && <span className="text-xs text-amber-700">({m.status})</span>}
            </label>
          ))}
          {(mailboxes ?? []).length === 0 && (
            <p className="text-slate-500">
              No senders yet. <Link href="/app/mailboxes" className="text-sky-700">Add one</Link>.
            </p>
          )}
          <Button type="submit" variant="secondary" className="self-start">
            Save senders
          </Button>
        </form>
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">Contacts</h2>
        <p className="mb-3 text-sm text-slate-600">
          {Object.keys(counts).length === 0 ? "No contacts enrolled." : Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}
        </p>
        <form action={enrollContacts.bind(null, id)} className="flex items-end gap-2">
          <Field label="Enroll">
            <Select name="label" defaultValue="all">
              <option value="all">All subscribed contacts</option>
              {(labels ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  Label: {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Enroll</Button>
        </form>
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">Settings</h2>
        <form action={updateCampaign.bind(null, id)} className="flex flex-col gap-3">
          <CampaignFields values={campaign} />
          <Button type="submit" variant="secondary" className="self-start">
            Save settings
          </Button>
        </form>
      </Card>
    </div>
  );
}
