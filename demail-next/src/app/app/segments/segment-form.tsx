import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import type { Rules } from "@/lib/segments/rules";
import { LabelList, RuleFields } from "./rule-fields";
import { saveSegment } from "./actions";

export function SegmentForm({
  id,
  name,
  rules,
  campaignId,
  live,
  labels,
  campaigns,
  canManage,
}: {
  id: string | null;
  name: string;
  rules: Rules;
  campaignId: string | null;
  live: boolean;
  labels: { id: string; name: string }[];
  campaigns: { id: string; name: string; status: string }[];
  canManage: boolean;
}) {
  return (
    <Card>
      <form action={saveSegment.bind(null, id)} className="flex flex-col gap-4">
        <fieldset disabled={!canManage} className="flex flex-col gap-4">
          <Field label="Name">
            <Input name="name" defaultValue={name} maxLength={80} required />
          </Field>
          <Field label="Contacts match">
            <Select name="match" defaultValue={rules.match}>
              <option value="all">All of the conditions</option>
              <option value="any">Any of the conditions</option>
            </Select>
          </Field>
          <RuleFields conditions={rules.conditions} labels={labels} />
          <LabelList labels={labels} />
          <Field label="Linked campaign (optional)">
            <Select name="campaign_id" defaultValue={campaignId ?? ""}>
              <option value="">None</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id} disabled={c.status === "completed"}>
                  {c.name} ({c.status})
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="live" defaultChecked={live} className="mt-1" />
            <span>
              Live link: every few minutes, enroll new matching contacts into the linked campaign. Off by default. While on, matching contacts receive that campaign&apos;s email without another click.
            </span>
          </label>
          {canManage ? <Button type="submit">Save segment</Button> : <p className="text-sm text-slate-500">Only owners and admins can change segments.</p>}
        </fieldset>
      </form>
    </Card>
  );
}
