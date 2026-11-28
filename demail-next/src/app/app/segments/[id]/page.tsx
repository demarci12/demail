import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { describeRules, readRules } from "@/lib/segments/rules";
import type { Json } from "@/lib/database.types";
import { SegmentForm } from "../segment-form";
import { deleteSegment, enrollSegment } from "../actions";

export default async function SegmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; msg?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, org, canManage } = await getOrgContext();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: seg } = await supabase.from("segments").select("*").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!seg) notFound();
  const rules = readRules(seg.rules);
  const [{ data: labels }, { data: campaigns }, count] = await Promise.all([
    supabase.from("labels").select("id, name").eq("organization_id", org.id).order("name"),
    supabase.from("campaigns").select("id, name, status").eq("organization_id", org.id).order("created_at", { ascending: false }),
    supabase.rpc("contacts_search", { p_org: org.id, p_rules: rules as unknown as Json, p_extra: null, p_q: null }, { count: "exact", head: true }),
  ]);
  const linked = campaigns?.find((c) => c.id === seg.campaign_id);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={seg.name} actions={<Link href="/app/segments" className="text-sm text-sky-700">Back to segments</Link>} />
      {sp.error && <Alert>{sp.error}</Alert>}
      {sp.msg && <Alert tone="info">{sp.msg}</Alert>}
      <Card className="flex flex-col gap-2 text-sm">
        <p>{describeRules(rules, new Map((labels ?? []).map((l) => [l.id, l.name])))}</p>
        <p className="text-slate-600">
          {count.count ?? 0} matching contacts.{" "}
          <Link href={`/app/contacts?segment=${seg.id}`} className="text-sky-700">
            View them
          </Link>
        </p>
        {seg.live && linked && (
          <p className="text-slate-600">
            Live link on: new matches join {linked.name}. {seg.last_synced_at ? `Last run ${new Date(seg.last_synced_at).toISOString().slice(0, 16).replace("T", " ")} UTC, ${seg.last_enrolled} enrolled so far.` : "Not run yet."}
          </p>
        )}
      </Card>
      <SegmentForm
        id={seg.id}
        name={seg.name}
        rules={rules}
        campaignId={seg.campaign_id}
        live={seg.live}
        labels={labels ?? []}
        campaigns={campaigns ?? []}
        canManage={canManage}
      />
      <Card className="flex flex-col gap-3">
        <h2 className="font-medium">Enroll all matching contacts now</h2>
        <form action={enrollSegment.bind(null, seg.id)} className="flex gap-2">
          <Select name="campaign_id" defaultValue={seg.campaign_id ?? ""} required>
            <option value="" disabled>
              Pick a campaign
            </option>
            {(campaigns ?? []).filter((c) => c.status !== "completed").map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.status})
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Enroll
          </Button>
        </form>
        <p className="text-xs text-slate-500">Enrolling adds contacts to the campaign. They are mailed when it is active. Unsubscribed and suppressed contacts are skipped.</p>
      </Card>
      {canManage && (
        <form action={deleteSegment.bind(null, seg.id)}>
          <Button type="submit" variant="danger">
            Delete segment
          </Button>
        </form>
      )}
    </div>
  );
}
