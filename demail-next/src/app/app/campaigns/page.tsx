import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Card, PageHeader } from "@/components/ui/card";
export default async function CampaignsPage() {
  const { supabase, org } = await getOrgContext();
  const { data: campaigns } = await supabase.from("campaigns").select("id, name, status, created_at").eq("organization_id", org.id).order("created_at", { ascending: false });
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Campaigns"
        actions={
          <Link href="/app/campaigns/new" className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700">
            New campaign
          </Link>
        }
      />
      <Card className="p-0">
        <ul>
          {(campaigns ?? []).map((c) => (
            <li key={c.id} className="border-b border-slate-100 last:border-0">
              <Link href={`/app/campaigns/${c.id}`} className="flex items-center justify-between p-3 text-sm hover:bg-slate-50">
                <span>{c.name}</span>
                <span className="text-slate-500">{c.status}</span>
              </Link>
            </li>
          ))}
          {(campaigns ?? []).length === 0 && <li className="p-4 text-sm text-slate-500">No campaigns yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
