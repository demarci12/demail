import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { SAMPLE_CONTACT, contactData, renderTemplate, type MergeData } from "@/lib/merge";
import { cleanText } from "@/lib/input";
import type { Database } from "@/lib/database.types";
import { BRANCH_CONDITION_LABELS, type BranchCondition } from "@/lib/send/branch";
import { CampaignFields } from "../settings-fields";
import { MergeInsert } from "../merge-insert";
import { addBranch, addStep, addVariant, applyAiDraftAsStep, deleteStep, deleteVariant, discardAiDraft, draftStepWithAi, enrollContacts, launchCampaign, moveStep, pauseCampaign, saveSenders, sendTestStep, updateBranch, updateCampaign, updateStep, updateVariant } from "../actions";
type StepRow = Database["public"]["Tables"]["campaign_steps"]["Row"];
type Tracker = { id: string; name: string };
const CONDITION_OPTIONS = ["opened", "clicked", "replied", "visited_site"] as const;
function stepLabel(s: StepRow, n: number) {
  return `Step ${n}: ${cleanText(s.name, 60) || cleanText(s.subject, 60) || (s.type === "branch" ? (s.branch_condition === "always" ? "end of path" : "condition") : s.type)}`;
}
function targetText(steps: StepRow[], action: string | null, stepId: string | null) {
  if (action === "next") return "next step";
  if (action === "step") {
    const i = steps.findIndex((x) => x.id === stepId);
    return i >= 0 ? `go to step ${i + 1}` : "end the sequence (the target step is gone)";
  }
  return "end the sequence";
}
function conditionText(s: StepRow, trackers: Tracker[]) {
  switch (s.branch_condition) {
    case "opened":
      return "If the contact opened an email of this campaign since enrollment";
    case "clicked":
      return "If the contact clicked a link in an email of this campaign since enrollment";
    case "replied":
      return "If the contact replied to this campaign since enrollment";
    case "visited_site": {
      const tracker = trackers.find((t) => t.id === s.branch_tracker_id);
      const where = tracker ? cleanText(tracker.name, 100) || "your site" : "your site";
      const path = s.branch_path ? ` at a path starting with ${cleanText(s.branch_path, 300)}` : "";
      return `If the contact visited ${where}${path} since enrollment`;
    }
    default:
      return "If the condition holds";
  }
}
function ConditionFields({ condition, trackerId, path, trackers }: { condition?: string | null; trackerId?: string | null; path?: string | null; trackers: Tracker[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Field label="Condition">
        <Select name="condition" defaultValue={condition ?? "opened"}>
          {CONDITION_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {BRANCH_CONDITION_LABELS[c as BranchCondition]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Tracker (visited site only)">
        <Select name="tracker" defaultValue={trackerId ?? ""}>
          <option value="">Any tracker</option>
          {trackers.map((t) => (
            <option key={t.id} value={t.id}>
              {cleanText(t.name, 100)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Path prefix (visited site only)">
        <Input name="path" maxLength={300} placeholder="/pricing" defaultValue={path ?? ""} />
      </Field>
    </div>
  );
}
function TargetFields({ prefix, label, action, stepId, later }: { prefix: "yes" | "no"; label: string; action?: string | null; stepId?: string | null; later: { id: string; label: string }[] | null }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Field label={label}>
        <Select name={`${prefix}_action`} defaultValue={action ?? "next"}>
          <option value="next">Continue with the next step</option>
          <option value="end">End the sequence</option>
          {later && <option value="step">Go to a later step</option>}
        </Select>
      </Field>
      {later && (
        <Field label="Later step (when going to one)">
          <Select name={`${prefix}_step`} defaultValue={stepId ?? ""}>
            <option value="">{later.length ? "Pick a step" : "No later step"}</option>
            {later.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </div>
  );
}
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
  const { supabase, org, user } = await getOrgContext();
  const { data: campaign } = await supabase.from("campaigns").select("*").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!campaign) notFound();
  const [{ data: steps }, { data: mailboxes }, { data: selected }, { data: labels }, { data: enrollments }, { data: sample }, { data: engagement }, { data: messageStats }, { data: aiSettings }, { data: aiDrafts }, { data: trackerRows }, { data: branchRows }] = await Promise.all([
    supabase.from("campaign_steps").select("*").eq("campaign_id", id).eq("organization_id", org.id).order("position"),
    supabase.from("mailboxes").select("id, email, from_name, status").eq("organization_id", org.id).order("email"),
    supabase.from("campaign_mailboxes").select("mailbox_id").eq("campaign_id", id).eq("organization_id", org.id),
    supabase.from("labels").select("id, name").eq("organization_id", org.id).order("name"),
    supabase.from("campaign_contacts").select("status").eq("campaign_id", id).eq("organization_id", org.id).limit(10000),
    supabase.from("contacts").select("*").eq("organization_id", org.id).order("created_at").limit(1).maybeSingle(),
    supabase.rpc("campaign_engagement", { p_campaign: id }),
    supabase.rpc("campaign_message_stats", { p_campaign: id }),
    supabase.from("ai_settings").select("enabled").eq("organization_id", org.id).maybeSingle(),
    supabase.from("ai_drafts").select("id, subject, body").eq("organization_id", org.id).eq("campaign_id", id).eq("kind", "step").eq("status", "draft").order("created_at", { ascending: false }).limit(3),
    supabase.from("site_trackers").select("id, name").eq("organization_id", org.id).order("name"),
    supabase.from("campaign_branch_results").select("step_id, outcome").eq("campaign_id", id).eq("organization_id", org.id).limit(10000),
  ]);
  const trackers: Tracker[] = trackerRows ?? [];
  const branchCounts = new Map<string, { yes: number; no: number }>();
  for (const r of branchRows ?? []) {
    const c = branchCounts.get(r.step_id) ?? { yes: 0, no: 0 };
    if (r.outcome) c.yes++;
    else c.no++;
    branchCounts.set(r.step_id, c);
  }
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
  const testMailboxes = (mailboxes ?? []).filter((m) => m.status === "active").sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id)));
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
            <Link href={`/app/campaigns/${id}/review`} className="text-sm text-sky-700">
              Review
            </Link>
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
            const followUp = (steps ?? []).slice(0, i).some((p) => p.type === "email");
            const threadHint = "Gmail and Microsoft senders reply in the first email's thread with the subject Re: <first subject>, so a variant subject here applies only to Resend senders. Vary the body to test follow-ups.";
            return (
              <div key={s.id} className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase text-slate-500">
                  <span>
                    {i + 1}. {s.type === "branch" ? (s.branch_condition === "always" ? "End of path" : "Condition") : s.type}
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
                {s.type === "branch" ? (
                  (() => {
                    const all = steps ?? [];
                    const later = all.slice(i + 1).map((x, k) => ({ id: x.id, label: stepLabel(x, i + k + 2) }));
                    const always = s.branch_condition === "always";
                    const c = branchCounts.get(s.id) ?? { yes: 0, no: 0 };
                    return (
                      <>
                        <p className="text-sm">
                          {always
                            ? `Every contact who reaches this step: ${targetText(all, s.yes_action, s.yes_step_id)}.`
                            : `${conditionText(s, trackers)}: yes, ${targetText(all, s.yes_action, s.yes_step_id)}; no, ${targetText(all, s.no_action, s.no_step_id)}.`}
                        </p>
                        <p className="mb-2 text-xs text-slate-500">{always ? `Passed ${c.yes + c.no}` : `Yes ${c.yes}, No ${c.no}`}</p>
                        <form action={updateBranch.bind(null, id, s.id)} className="flex flex-col gap-3">
                          {always ? (
                            <input type="hidden" name="condition" value="always" />
                          ) : (
                            <ConditionFields condition={s.branch_condition} trackerId={s.branch_tracker_id} path={s.branch_path} trackers={trackers} />
                          )}
                          <TargetFields prefix="yes" label={always ? "Then" : "If yes"} action={s.yes_action} stepId={s.yes_step_id} later={later} />
                          {!always && <TargetFields prefix="no" label="If no" action={s.no_action} stepId={s.no_step_id} later={later} />}
                          <Button type="submit" variant="secondary" disabled={locked}>
                            Save step
                          </Button>
                        </form>
                      </>
                    );
                  })()
                ) : (
                  <form action={updateStep.bind(null, id, s.id, s.type)} className="flex flex-col gap-3">
                    {s.type === "email" ? <EmailFields subject={s.subject} body={s.body_plain} name={s.name} /> : <WaitFields seconds={s.wait_seconds} />}
                    <Button type="submit" variant="secondary" disabled={locked}>
                      Save step
                    </Button>
                  </form>
                )}
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
                      {followUp && <p className="mb-2 text-xs text-slate-500">{threadHint}</p>}
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
                  <form action={sendTestStep.bind(null, id, s.id)} className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
                    {stepVariants.some((v) => v.active) && (
                      <Field label="Variant">
                        <Select name="variant" defaultValue="a">
                          <option value="a">A</option>
                          {stepVariants
                            .filter((v) => v.active)
                            .map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.label}
                              </option>
                            ))}
                        </Select>
                      </Field>
                    )}
                    <Field label="Send from">
                      <Select name="mailbox" required defaultValue={testMailboxes[0]?.id ?? ""}>
                        {testMailboxes.length === 0 && <option value="">No active mailbox</option>}
                        {testMailboxes.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.email}
                            {chosen.has(m.id) ? " (sender)" : ""}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Button type="submit" variant="secondary">
                      Send test to {user.email ?? "you"}
                    </Button>
                  </form>
                )}
                {s.type === "email" && (
                  <form action={addVariant.bind(null, id, s.id)} className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3">
                    <h3 className="text-sm font-medium">Add variant</h3>
                    <p className="text-xs text-slate-500">Each enrollment gets one variant of this step, split evenly. Variants are plain text.</p>
                    {followUp && <p className="text-xs text-slate-500">{threadHint}</p>}
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
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4">
          <form action={addBranch.bind(null, id, "condition")} className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">Add condition</h3>
            <p className="text-xs text-slate-500">
              A condition is checked once, when a contact reaches it, against what happened since they were enrolled. Put a wait step before it so there is time to open, click, reply or visit.
            </p>
            <ConditionFields trackers={trackers} />
            <TargetFields prefix="yes" label="If yes" later={null} />
            <TargetFields prefix="no" label="If no" later={null} />
            <Button type="submit" disabled={locked}>
              Add condition
            </Button>
          </form>
          <form action={addBranch.bind(null, id, "end")} className="flex flex-col gap-2">
            <p className="text-xs text-slate-500">To build two paths: add every step of both, add the condition and an end of path, move them into place, then pick the targets.</p>
            <Button type="submit" variant="secondary" className="self-start" disabled={locked}>
              Add end of path
            </Button>
          </form>
          <ul className="list-disc pl-5 text-xs text-slate-500">
            <li>Opened an email needs Track opens.</li>
            <li>Clicked a link needs Track clicks.</li>
            <li>Replied needs a Google or Microsoft sender and Stop on reply off.</li>
            <li>Visited your site needs a website tracker.</li>
          </ul>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-medium">Write with AI</h3>
          {!aiSettings?.enabled ? (
            <p className="text-sm text-slate-500">
              AI is off. An owner or admin can turn it on in{" "}
              <Link href="/app/settings/ai" className="text-sky-700">
                Settings, AI
              </Link>
              .
            </p>
          ) : (
            !locked && (
              <form action={draftStepWithAi.bind(null, id)} className="flex flex-col gap-3">
                <Field label="Brief">
                  <textarea
                    name="brief"
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={3}
                    placeholder="What you offer, who it is for, and the one thing you want them to do"
                    className="w-full rounded-md border border-slate-300 bg-white p-3 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  />
                </Field>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Tone">
                    <Select name="tone" defaultValue="friendly">
                      <option value="friendly">Friendly</option>
                      <option value="direct">Direct</option>
                      <option value="formal">Formal</option>
                    </Select>
                  </Field>
                  <Field label="Position">
                    <Select name="position" defaultValue={(steps ?? []).some((s) => s.type === "email") ? "follow_up" : "first"}>
                      <option value="first">First email</option>
                      <option value="follow_up">Follow-up</option>
                    </Select>
                  </Field>
                  <Button type="submit" variant="secondary">
                    Draft with AI
                  </Button>
                </div>
                <p className="text-xs text-slate-500">Each draft is one AI call. Drafts are never sent; you edit and add them as a step.</p>
              </form>
            )
          )}
          {(aiDrafts ?? []).map((d) => (
            <div key={d.id} className="rounded-md border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase text-slate-500">AI draft</p>
                <form action={discardAiDraft.bind(null, id, d.id)}>
                  <Button type="submit" variant="secondary" className="h-7 px-2">
                    Discard
                  </Button>
                </form>
              </div>
              <form action={applyAiDraftAsStep.bind(null, id, d.id)} className="flex flex-col gap-3">
                <EmailFields subject={d.subject} body={d.body} />
                <Button type="submit" disabled={locked}>
                  Add as email step
                </Button>
              </form>
              <Preview subject={d.subject ?? ""} body={d.body} data={sampleData} to={sample?.email ?? "a sample contact"} />
            </div>
          ))}
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
