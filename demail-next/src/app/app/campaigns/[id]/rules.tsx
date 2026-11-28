import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { cleanText } from "@/lib/input";
import { RULE_INTENTS, RULE_INTENT_LABELS, RULE_OUTCOME_LABELS, RULE_TRIGGERS, RULE_TRIGGER_LABELS, type RuleIntent, type RuleTrigger } from "@/lib/send/rules";
import { addRule, deleteRule, setRuleEnabled } from "../actions";
import type { Database } from "@/lib/database.types";

type RuleRow = Database["public"]["Tables"]["campaign_rules"]["Row"];
export type RuleTarget = { value: string; label: string };

function describe(r: RuleRow, targets: RuleTarget[]) {
  const when =
    r.trigger === "reply_intent"
      ? `A reply is classified as ${r.intents.map((i) => RULE_INTENT_LABELS[i as RuleIntent] ?? i).join(" or ")}`
      : r.trigger === "meeting"
        ? "A reply asks for a meeting"
        : `A link${r.url_contains ? ` containing "${cleanText(r.url_contains, 300)}"` : ""} is clicked`;
  const key = r.target_campaign_id ? `campaign:${r.target_campaign_id}` : `step:${r.target_step_id}`;
  const to = targets.find((t) => t.value === key)?.label ?? "a target that no longer exists";
  return `${when}, then ${r.target_campaign_id ? "move the contact to" : "jump forward to"} ${to}.`;
}

// Subsequences: rules that move a contact on after a reply, a meeting request or a click. Every rule starts off.
export function RulesCard({ campaignId, rules, targets, moveCounts, aiOn }: { campaignId: string; rules: RuleRow[]; targets: RuleTarget[]; moveCounts: Map<string, Record<string, number>>; aiOn: boolean }) {
  return (
    <Card>
      <h2 className="mb-1 font-medium">Subsequences</h2>
      <p className="mb-3 text-xs text-slate-500">
        A rule moves a contact into another campaign, or forward to a later step of this one. Rules are off until you switch them on and only act on events after that. Unsubscribed, suppressed and invalid addresses are never moved, a contact enters a campaign at most once, and no contact moves more than 3 times in 30 days. Moving into another campaign stops the contact here. Rules run every 5 minutes and look at events up to 7 days old.
      </p>
      {!aiOn && <p className="mb-3 text-xs text-amber-700">Reply type rules need AI reply classification, which is off. Turn it on in Settings, AI. Meeting and link rules work without it.</p>}
      <div className="flex flex-col gap-3">
        {rules.map((r) => {
          const counts = moveCounts.get(r.id) ?? {};
          return (
            <div key={r.id} className="rounded-md border border-slate-200 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">
                  {cleanText(r.name, 200)} <span className="text-xs font-normal text-slate-500">{r.enabled ? "on" : "off"}</span>
                </p>
                <span className="flex gap-1">
                  <form action={setRuleEnabled.bind(null, campaignId, r.id, !r.enabled)}>
                    <Button type="submit" variant="secondary" className="h-7 px-2">
                      {r.enabled ? "Switch off" : "Switch on"}
                    </Button>
                  </form>
                  <form action={deleteRule.bind(null, campaignId, r.id)}>
                    <Button type="submit" variant="danger" className="h-7 px-2">
                      Delete
                    </Button>
                  </form>
                </span>
              </div>
              <p className="mt-1 text-slate-600">{describe(r, targets)}</p>
              {Object.keys(counts).length > 0 && (
                <ul className="mt-1 text-xs text-slate-500">
                  {Object.entries(counts).map(([outcome, n]) => (
                    <li key={outcome}>
                      {RULE_OUTCOME_LABELS[outcome] ?? outcome}: {n}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {rules.length === 0 && <p className="text-sm text-slate-500">No rules yet.</p>}
      </div>
      <form action={addRule.bind(null, campaignId)} className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3">
        <h3 className="text-sm font-medium">Add rule</h3>
        <Field label="Name">
          <Input name="name" required maxLength={200} />
        </Field>
        <Field label="When">
          <Select name="trigger" defaultValue="reply_intent">
            {RULE_TRIGGERS.map((t) => (
              <option key={t} value={t}>
                {RULE_TRIGGER_LABELS[t as RuleTrigger]}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="text-sm">
          <legend className="mb-1 text-slate-600">Reply types (for the classified reply trigger)</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {RULE_INTENTS.map((i) => (
              <label key={i} className="flex items-center gap-2">
                <input type="checkbox" name="intent" value={i} />
                {RULE_INTENT_LABELS[i]}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Link contains (for the clicked link trigger, empty for any link)">
          <Input name="url_contains" maxLength={300} />
        </Field>
        <Field label="Then">
          <Select name="target" required defaultValue="">
            <option value="" disabled>
              Pick a target
            </option>
            {targets.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary" className="self-start">
          Add rule
        </Button>
      </form>
    </Card>
  );
}
