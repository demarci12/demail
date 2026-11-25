import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { SAMPLE_CONTACT, contactData, renderTemplate } from "@/lib/merge";
import { CampaignFields } from "../settings-fields";
import { MergeInsert } from "../merge-insert";
import { addStep, deleteStep, enrollContacts, launchCampaign, moveStep, pauseCampaign, saveSenders, updateCampaign, updateStep } from "../actions";
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
function EmailFields({ subject, body, name }: { subject?: string | null; body?: string | null; name?: string | null }) {
  return (
    <>
      <Field label="Step name (optional)">
        <Input name="name" maxLength={200} defaultValue={name ?? ""} />
      </Field>
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
  const [{ data: steps }, { data: mailboxes }, { data: selected }, { data: labels }, { data: enrollments }, { data: sample }] = await Promise.all([
    supabase.from("campaign_steps").select("*").eq("campaign_id", id).eq("organization_id", org.id).order("position"),
    supabase.from("mailboxes").select("id, email, from_name, status").eq("organization_id", org.id).order("email"),
    supabase.from("campaign_mailboxes").select("mailbox_id").eq("campaign_id", id).eq("organization_id", org.id),
    supabase.from("labels").select("id, name").eq("organization_id", org.id).order("name"),
    supabase.from("campaign_contacts").select("status").eq("campaign_id", id).eq("organization_id", org.id).limit(10000),
    supabase.from("contacts").select("*").eq("organization_id", org.id).order("created_at").limit(1).maybeSingle(),
  ]);
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
        <h2 className="mb-3 font-medium">Steps</h2>
        {locked && <p className="mb-3 text-sm text-slate-500">Pause the campaign to change steps.</p>}
        <div className="flex flex-col gap-4">
          {(steps ?? []).map((s, i) => {
            const subject = s.type === "email" ? renderTemplate(s.subject ?? "", sampleData) : null;
            const body = s.type === "email" ? renderTemplate(s.body_plain ?? "", sampleData) : null;
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
                <form action={updateStep.bind(null, id, s.id, s.type)} className="flex flex-col gap-3">
                  {s.type === "email" ? <EmailFields subject={s.subject} body={s.body_plain} name={s.name} /> : <WaitFields seconds={s.wait_seconds} />}
                  <Button type="submit" variant="secondary" disabled={locked}>
                    Save step
                  </Button>
                </form>
                {subject && body && (
                  <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
                    <p className="mb-1 text-xs font-medium uppercase text-slate-500">Preview for {sample?.email ?? "a sample contact"}</p>
                    {subject.ok && body.ok ? (
                      <>
                        <p className="font-medium">{subject.text}</p>
                        <p className="whitespace-pre-wrap">{body.text}</p>
                      </>
                    ) : (
                      <p className="text-red-700">Missing merge field: {[...new Set([...(subject.ok ? [] : subject.missing), ...(body.ok ? [] : body.missing)])].join(", ")}. Add a fallback such as {"{{first_name|there}}"}.</p>
                    )}
                  </div>
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
