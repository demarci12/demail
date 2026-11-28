import { getOrgContext } from "@/lib/org";
import { Alert, PageHeader } from "@/components/ui/card";
import { EMPTY_RULES } from "@/lib/segments/rules";
import { SegmentForm } from "../segment-form";

export default async function NewSegmentPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, canManage } = await getOrgContext();
  const [{ data: labels }, { data: campaigns }] = await Promise.all([
    supabase.from("labels").select("id, name").eq("organization_id", org.id).order("name"),
    supabase.from("campaigns").select("id, name, status").eq("organization_id", org.id).order("created_at", { ascending: false }),
  ]);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title="New segment" />
      {sp.error && <Alert>{sp.error}</Alert>}
      <SegmentForm id={null} name="" rules={EMPTY_RULES} campaignId={null} live={false} labels={labels ?? []} campaigns={campaigns ?? []} canManage={canManage} />
    </div>
  );
}
