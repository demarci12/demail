import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { publicEnv } from "@/lib/env";
import { cleanText } from "@/lib/input";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { createTracker, deleteTracker, saveTracker } from "./actions";
const textarea = "w-full rounded-md border border-slate-300 bg-white p-3 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100";
const STUB = "<script>window.demail=window.demail||function(){(window.demail.q=window.demail.q||[]).push(arguments)};</script>";
function utc(at: string) {
  return `${new Date(at).toISOString().replace("T", " ").slice(0, 16)} UTC`;
}
export default async function WebsitePage({ searchParams }: { searchParams: Promise<{ error?: string; msg?: string }> }) {
  const { error, msg } = await searchParams;
  const { supabase, org, canManage } = await getOrgContext();
  const { data: trackers, error: loadError } = await supabase
    .from("site_trackers")
    .select("id, name, public_key, domains, consent_mode, identify_from_email, enabled, retention_days, daily_limit")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: true });
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const counts = await Promise.all(
    (trackers ?? []).map(async (t) => {
      const { count } = await supabase
        .from("site_page_views")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.id)
        .eq("tracker_id", t.id)
        .gte("created_at", since);
      return count ?? 0;
    }),
  );
  const { data: views } = await supabase
    .from("site_page_views")
    .select("id, tracker_id, visitor_id, host, path, created_at")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const visitorIds = [...new Set((views ?? []).map((v) => v.visitor_id))];
  const { data: visitors } = visitorIds.length
    ? await supabase.from("site_visitors").select("id, contact_id").eq("organization_id", org.id).in("id", visitorIds)
    : { data: [] as { id: string; contact_id: string | null }[] };
  const contactIds = [...new Set((visitors ?? []).map((v) => v.contact_id).filter((c): c is string => !!c))];
  const { data: contacts } = contactIds.length
    ? await supabase.from("contacts").select("id, email").eq("organization_id", org.id).in("id", contactIds)
    : { data: [] as { id: string; email: string }[] };
  const trackerName = new Map((trackers ?? []).map((t) => [t.id, cleanText(t.name, 100)]));
  const contactOf = new Map((visitors ?? []).map((v) => [v.id, v.contact_id]));
  const emailOf = new Map((contacts ?? []).map((c) => [c.id, cleanText(c.email, 320)]));
  const base = publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  const list = trackers ?? [];
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Website" />
      {error && <Alert>{error}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}
      {loadError && <Alert>Could not load website tracking. Try again in a moment.</Alert>}
      <Card className="flex flex-col gap-3 text-sm">
        <p className="text-slate-600">
          A tracker records which pages of your site people visit. Visits stay anonymous until someone arrives from a tracked link in your email, and then they show on
          that contact. No IP address, user agent or cookie is stored, and browsers that send Global Privacy Control are never recorded.
        </p>
        {canManage && list.length < 5 && (
          <form action={createTracker} className="flex flex-col gap-3">
            <Field label="Name">
              <Input name="name" placeholder="Company site" maxLength={100} required />
            </Field>
            <Field label="Domains, one per line (subdomains count too)">
              <textarea name="domains" rows={2} required placeholder="example.com" className={textarea} />
            </Field>
            <div>
              <Button type="submit">Create tracker</Button>
            </div>
          </form>
        )}
        {canManage && list.length >= 5 && <p className="text-slate-500">This workspace has the maximum of 5 trackers.</p>}
        {!canManage && <p className="text-slate-500">Only owners and admins can change trackers.</p>}
      </Card>
      {list.map((t, i) => {
        const snippet = `${STUB}\n<script async src="${base}/w.js" data-key="${t.public_key}" data-consent="${t.consent_mode}"></script>`;
        return (
          <Card key={t.id} className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="truncate font-medium">{trackerName.get(t.id)}</h2>
              <span className="shrink-0 text-slate-500">
                {counts[i]} {counts[i] === 1 ? "view" : "views"} in the last 7 days{t.enabled ? "" : ", paused"}
              </span>
            </div>
            <Field label="Add to every page of your site">
              <textarea readOnly rows={3} value={snippet} className={`${textarea} font-mono text-xs`} />
            </Field>
            {t.consent_mode === "ask" ? (
              <p className="text-slate-600">
                Ask mode records nothing until the visitor agrees. Call <code>demail(&apos;consent&apos;, true)</code> from your cookie banner after they accept and{" "}
                <code>demail(&apos;consent&apos;, false)</code> if they refuse. Single-page apps call <code>demail(&apos;page&apos;)</code> after each navigation.
              </p>
            ) : (
              <p className="text-slate-600">
                Record mode counts visits on load, for sites that already have a legal basis. <code>demail(&apos;consent&apos;, false)</code> opts a visitor out. Single-page
                apps call <code>demail(&apos;page&apos;)</code> after each navigation.
              </p>
            )}
            {canManage ? (
              <form action={saveTracker.bind(null, t.id)} className="flex flex-col gap-3 border-t border-slate-200 pt-3">
                <Field label="Name">
                  <Input name="name" required maxLength={100} defaultValue={t.name} />
                </Field>
                <Field label="Domains, one per line">
                  <textarea name="domains" rows={2} required defaultValue={t.domains.join("\n")} className={textarea} />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Consent">
                    <Select name="consent_mode" defaultValue={t.consent_mode}>
                      <option value="ask">Ask first</option>
                      <option value="record">Record on load</option>
                    </Select>
                  </Field>
                  <Field label="Keep visits (days)">
                    <Input name="retention_days" inputMode="numeric" pattern="[0-9]*" required defaultValue={String(t.retention_days)} />
                  </Field>
                  <Field label="Page views per day">
                    <Input name="daily_limit" inputMode="numeric" pattern="[0-9]*" required defaultValue={String(t.daily_limit)} />
                  </Field>
                </div>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="identify_from_email" defaultChecked={t.identify_from_email} /> Link email clicks to visitors
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="enabled" defaultChecked={t.enabled} /> Enabled
                </label>
                <div className="flex gap-2">
                  <Button type="submit">Save tracker</Button>
                  <Button type="submit" variant="danger" formAction={deleteTracker.bind(null, t.id)} formNoValidate>
                    Delete tracker and visits
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-slate-500">
                {t.domains.join(", ")}. {t.consent_mode === "ask" ? "Ask first" : "Record on load"}, visits kept {t.retention_days} days, up to {t.daily_limit} page views a
                day.
              </p>
            )}
          </Card>
        );
      })}
      <Card className="p-0">
        <h2 className="p-3 font-medium">Recent visits</h2>
        <ul className="text-sm">
          {(views ?? []).map((v) => {
            const contactId = contactOf.get(v.visitor_id) ?? null;
            const email = contactId ? emailOf.get(contactId) : undefined;
            return (
              <li key={v.id} className="flex items-center justify-between gap-3 border-t border-slate-100 p-3">
                <span className="min-w-0 truncate">
                  <span className="text-slate-500">{trackerName.get(v.tracker_id) ?? "Tracker"}</span> {cleanText(v.host, 253)}
                  {cleanText(v.path, 300)}
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                  {contactId && email ? (
                    <Link href={`/app/contacts/${contactId}`} className="text-sky-700 hover:underline">
                      {email}
                    </Link>
                  ) : (
                    <span>Anonymous visitor</span>
                  )}
                  <time dateTime={v.created_at}>{utc(v.created_at)}</time>
                </span>
              </li>
            );
          })}
          {(views ?? []).length === 0 && <li className="border-t border-slate-100 p-3 text-slate-500">No visits yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
