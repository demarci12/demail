import Link from "next/link";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CampaignFields } from "../settings-fields";
import { createCampaign } from "../actions";
export default async function NewCampaign({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="max-w-xl">
      <PageHeader title="New campaign" actions={<Link href="/app/campaigns" className="text-sm text-sky-700">Back</Link>} />
      <Card>
        <form action={createCampaign} className="flex flex-col gap-3">
          {error && <Alert>{error}</Alert>}
          <CampaignFields />
          <Button type="submit">Create campaign</Button>
        </form>
      </Card>
    </div>
  );
}
