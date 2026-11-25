import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requiredFields } from "@/lib/merge";
import { launchCampaign } from "../../actions";
type Missing = { contact_id: string; email: string; missing: string[]; total: number };
function Issue({ children }: { children: ReactNode }) {
  return <li className="text-amber-800">{children}</li>;
}
export default async function CampaignReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, org } = await getOrgContext();
  const { data: campaign } = await supabase.from("campaigns").select("id, name, status").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!campaign) notFound();
  const [{ data: steps }, { count: activeCount }, { data: selected }, { data: blocked }] = await Promise.all([
    supabase.from("campaign_steps").select("id, type, name, subject, body_plain, body_html, position").eq("campaign_id", id).eq("organization_id", org.id).order("position"),
    supabase.from("campaign_contacts").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("organization_id", org.id).eq("status", "active"),
    supabase.from("campaign_mailboxes").select("mailbox_id").eq("campaign_id", id).eq("organization_id", org.id),
    supabase.rpc("campaign_blocked_enrollments", { p_campaign: id }),
  ]);
  const senderIds = (selected ?? []).map((s) => s.mailbox_id);
  const emailSteps = (steps ?? []).map((s, i) => ({ ...s, index: i + 1 })).filter((s) => s.type === "email");
  const emailStepIds = emailSteps.map((s) => s.id);
  const [{ data: senders }, { data: health }, { data: variants }] = await Promise.all([
    senderIds.length ? supabase.from("mailboxes").select("id, email, status").eq("organization_id", org.id).in("id", senderIds).order("email") : Promise.resolve({ data: [] as { id: string; email: string; status: string }[] }),
    senderIds.length ? supabase.from("mailbox_health").select("mailbox_id, band").eq("organization_id", org.id).in("mailbox_id", senderIds) : Promise.resolve({ data: [] as { mailbox_id: string; band: string }[] }),
    emailStepIds.length
      ? supabase.from("campaign_step_variants").select("id, step_id, label, subject, body_plain").eq("organization_id", org.id).eq("active", true).in("step_id", emailStepIds).order("label")
      : Promise.resolve({ data: [] as { id: string; step_id: string; label: string; subject: string; body_plain: string }[] }),
  ]);
  const bands = new Map((health ?? []).map((h) => [h.mailbox_id, h.band]));
  // Field names come only from the saved templates, never from the request.
  const checks = emailSteps.flatMap((s) => {
    const stepVariants = (variants ?? []).filter((v) => v.step_id === s.id);
    const label = s.name?.trim() || (s.subject ?? "").slice(0, 60) || "Email";
    const a = { key: s.id, title: `${s.index}. ${label}${stepVariants.length ? ", variant A" : ""}`, fields: [...new Set([...requiredFields(s.subject ?? ""), ...requiredFields(s.body_plain ?? ""), ...requiredFields(s.body_html ?? "")])] };
    return [a, ...stepVariants.map((v) => ({ key: v.id, title: `${s.index}. ${label}, variant ${v.label}`, fields: [...new Set([...requiredFields(v.subject), ...requiredFields(v.body_plain)])] }))];
  });
  const results = await Promise.all(
    checks.map(async (c) => {
      if (c.fields.length === 0) return { ...c, rows: [] as Missing[] };
      const { data } = await supabase.rpc("campaign_missing_merge_fields", { p_campaign: id, p_fields: c.fields });
      return { ...c, rows: (data ?? []) as Missing[] };
    }),
  );
  const withBlanks = results.filter((r) => r.rows.length > 0);
  const blockedRows = blocked ?? [];
  const blockedTotal = Number(blockedRows[0]?.total ?? 0);
  const setupIssues: string[] = [];
  if (emailSteps.length === 0) setupIssues.push("Add at least one email step before launching.");
  if (senderIds.length === 0) setupIssues.push("Select at least one sender before launching.");
  if (!activeCount) setupIssues.push("No contacts are enrolled.");
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        title={`Review: ${campaign.name}`}
        actions={
          <Link href={`/app/campaigns/${id}`} className="text-sm text-sky-700">
            Back
          </Link>
        }
      />
      <p className="text-sm text-slate-600">This review is for information. It does not block launch: blank merge fields fail that enrollment when its turn comes, and unsubscribed or suppressed contacts are skipped.</p>
      <Card>
        <h2 className="mb-3 font-medium">Setup</h2>
        <dl className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Email steps</dt>
            <dd className="text-lg font-medium">{emailSteps.length}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Active enrollments</dt>
            <dd className="text-lg font-medium">{activeCount ?? 0}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Senders</dt>
            <dd className="text-lg font-medium">{senderIds.length}</dd>
          </div>
        </dl>
        <ul className="flex flex-col gap-1 text-sm">
          {setupIssues.map((t) => (
            <Issue key={t}>{t}</Issue>
          ))}
          {(senders ?? []).map((m) => {
            const band = bands.get(m.id) ?? "healthy";
            const problem = m.status !== "active" ? `is ${m.status} and will not send` : band === "paused" ? "has its health band at paused and will not send" : band === "throttled" ? "is throttled to half its daily limit" : null;
            return problem ? (
              <Issue key={m.id}>
                {m.email} {problem}.
              </Issue>
            ) : (
              <li key={m.id} className="text-slate-600">
                {m.email}: {m.status}, health {band}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">Merge fields</h2>
        {withBlanks.length === 0 ? (
          <p className="text-sm text-slate-600">No blank merge fields.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {withBlanks.map((r) => (
              <div key={r.key}>
                <h3 className="mb-1 text-sm font-medium">{r.title}</h3>
                <p className="mb-1 text-sm text-slate-600">
                  {Number(r.rows[0].total)} enrolled contacts have no value for a field this email needs. Add a fallback such as {"{{first_name|there}}"} or fill in the contact.
                </p>
                <ul className="flex flex-col gap-0.5 text-sm">
                  {r.rows.map((c) => (
                    <li key={c.contact_id}>
                      <Link href={`/app/contacts/${c.contact_id}`} className="text-sky-700">
                        {c.email}
                      </Link>{" "}
                      <span className="text-slate-500">missing {c.missing.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">Unsubscribed or suppressed</h2>
        {blockedTotal === 0 ? (
          <p className="text-sm text-slate-600">No unsubscribed or suppressed contacts are enrolled.</p>
        ) : (
          <>
            <p className="mb-1 text-sm text-slate-600">{blockedTotal} enrolled contacts are unsubscribed or suppressed. These enrollments are skipped when their turn comes.</p>
            <ul className="flex flex-col gap-0.5 text-sm">
              {blockedRows.map((c) => (
                <li key={c.contact_id}>
                  <Link href={`/app/contacts/${c.contact_id}`} className="text-sky-700">
                    {c.email}
                  </Link>{" "}
                  <span className="text-slate-500">{c.reason}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <div className="flex items-center gap-3">
        {campaign.status !== "active" && (
          <form action={launchCampaign.bind(null, id)}>
            <Button type="submit">{campaign.status === "paused" ? "Resume" : "Launch"}</Button>
          </form>
        )}
        <Link href={`/app/campaigns/${id}`} className="text-sm text-sky-700">
          Back to the campaign
        </Link>
      </div>
    </div>
  );
}
