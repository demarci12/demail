import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Card, PageHeader } from "@/components/ui/card";
import { describeRules, readRules } from "@/lib/segments/rules";

export default async function SegmentsPage() {
  const { supabase, org, canManage } = await getOrgContext();
  const [{ data: segments }, { data: labels }, { data: campaigns }] = await Promise.all([
    supabase.from("segments").select("id, name, rules, campaign_id, live").eq("organization_id", org.id).order("name"),
    supabase.from("labels").select("id, name").eq("organization_id", org.id),
    supabase.from("campaigns").select("id, name").eq("organization_id", org.id),
  ]);
  const labelNames = new Map((labels ?? []).map((l) => [l.id, l.name]));
  const campaignNames = new Map((campaigns ?? []).map((c) => [c.id, c.name]));
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader
        title="Segments"
        actions={
          canManage ? (
            <Link href="/app/segments/new" className="inline-flex h-9 items-center rounded-md bg-sky-600 px-3 text-sm font-medium text-white">
              New segment
            </Link>
          ) : undefined
        }
      />
      <Card className="p-0">
        <ul>
          {(segments ?? []).map((s) => (
            <li key={s.id} className="border-b border-slate-100 last:border-0">
              <Link href={`/app/segments/${s.id}`} className="flex flex-col gap-0.5 p-3 text-sm hover:bg-slate-50">
                <span className="font-medium">{s.name}</span>
                <span className="text-slate-600">{describeRules(readRules(s.rules), labelNames)}</span>
                {s.campaign_id && (
                  <span className="text-xs text-slate-500">
                    {s.live ? "Live link to " : "Linked to "}
                    {campaignNames.get(s.campaign_id) ?? "a campaign"}
                  </span>
                )}
              </Link>
            </li>
          ))}
          {(segments ?? []).length === 0 && <li className="p-4 text-sm text-slate-500">No segments yet. A segment saves a set of conditions, such as a label plus a company name, so you can find those contacts again or enroll them into a campaign.</li>}
        </ul>
      </Card>
    </div>
  );
}
