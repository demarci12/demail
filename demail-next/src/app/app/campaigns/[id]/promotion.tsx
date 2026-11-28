import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PROMOTION_Z, type PromotionState } from "@/lib/send/rules";
import { setPromotion, undoPromotion } from "../actions";
import type { Database } from "@/lib/database.types";

type StepRow = Database["public"]["Tables"]["campaign_steps"]["Row"];

function pct(replied: number, sent: number) {
  return sent > 0 ? `${((replied / sent) * 100).toFixed(1)}%` : "0%";
}
function Numbers({ rows }: { rows: PromotionState["rows"] }) {
  return (
    <table className="mt-2 w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-slate-200 text-left text-slate-500">
          <th className="py-1 pr-3 font-normal">Variant</th>
          <th className="py-1 pr-3 text-right font-normal">Sent</th>
          <th className="py-1 pr-3 text-right font-normal">Replied</th>
          <th className="py-1 text-right font-normal">Reply rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-slate-100">
            <td className="py-1 pr-3">{r.label}</td>
            <td className="py-1 pr-3 text-right">{r.sent}</td>
            <td className="py-1 pr-3 text-right">{r.replied}</td>
            <td className="py-1 text-right">{pct(r.replied, r.sent)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Winner promotion for one email step: the switch, the live state of the test and, once decided, the decision with an undo.
export function PromotionPanel({ campaignId, step, state, decided }: { campaignId: string; step: StepRow; state: PromotionState | null; decided: PromotionState | null }) {
  const verdict =
    step.promoted_label !== null
      ? `Variant ${step.promoted_label} was promoted${step.promoted_at ? ` on ${new Date(step.promoted_at).toISOString().slice(0, 10)}` : ""}. Only it is sent now.`
      : !step.promote_winner
        ? "Off. Every variant keeps an even share."
        : !state
          ? "Waiting for data."
          : state.reason === "sample"
            ? `Waiting until every variant has ${state.min_sample} sends.`
            : state.reason === "no_clear_winner"
              ? `No clear winner yet (lowest z ${state.z ?? 0}, needs ${PROMOTION_Z}).`
              : state.reason === "winner"
                ? `Variant ${state.winner} is ahead and will be promoted on the next scheduler run.`
                : "Needs at least one variant besides A.";
  const shown = step.promoted_label !== null ? (decided ?? state) : state;
  const undone = step.promoted_label === null && decided && step.promotion_decision && typeof step.promotion_decision === "object" && "undone_at" in step.promotion_decision;
  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <h3 className="text-sm font-medium">Winner promotion</h3>
      <p className="mt-1 text-xs text-slate-500">
        Optional. When every variant has the minimum number of sends, the variant with the best reply rate is promoted if it beats each other variant in a two-sided 95% two-proportion z-test (z of at least {PROMOTION_Z}) with at least 10 replies between the two. The others stop sending. Replies are the only measure, and checking repeatedly makes a false winner more likely, so keep the minimum high.
      </p>
      <form action={setPromotion.bind(null, campaignId, step.id)} className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="promote" defaultChecked={step.promote_winner} />
          Promote the winner
        </label>
        <Field label="Minimum sends per variant">
          <Input name="min_sample" type="number" min={30} max={100000} defaultValue={step.promote_min_sample} required />
        </Field>
        <Button type="submit" variant="secondary">
          Save
        </Button>
      </form>
      <p className="mt-2 text-sm">{verdict}</p>
      {undone && <p className="text-xs text-slate-500">The last promotion was undone, so promotion is off until you switch it on again.</p>}
      {shown && shown.rows.length > 0 && <Numbers rows={shown.rows} />}
      {shown && step.promoted_label !== null && shown.z !== undefined && <p className="mt-1 text-xs text-slate-500">Decision: z {shown.z} against the closest variant.</p>}
      {step.promoted_label !== null && (
        <form action={undoPromotion.bind(null, campaignId, step.id)} className="mt-2">
          <Button type="submit" variant="secondary">
            Undo promotion
          </Button>
        </form>
      )}
    </div>
  );
}
