import { Input, Select } from "@/components/ui/input";
import { FIELD_LABELS, OPS_FOR, OP_LABELS, type Condition } from "@/lib/segments/rules";

const ROWS = 10;

// Condition rows as plain form fields. Blank rows are ignored on save; a field and operator pair that does not fit is refused.
export function RuleFields({ conditions, labels }: { conditions: Condition[]; labels: { id: string; name: string }[] }) {
  const rows = [...conditions, ...Array.from({ length: Math.max(0, Math.min(ROWS - conditions.length, 2)) }, () => null)];
  return (
    <div className="flex flex-col gap-2">
      {rows.map((c, i) => (
        <div key={i} className="grid grid-cols-[9rem_10rem_1fr] gap-2">
          <Select name="field" defaultValue={c?.field ?? ""} aria-label="Field">
            <option value="">Field</option>
            {Object.entries(FIELD_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <Select name="op" defaultValue={c?.op ?? "contains"} aria-label="Operator">
            {[...new Set(Object.values(OPS_FOR).flat())].map((o) => (
              <option key={o} value={o}>
                {OP_LABELS[o]}
              </option>
            ))}
          </Select>
          <ValueInput value={c?.value ?? ""} field={c?.field ?? ""} labels={labels} />
        </div>
      ))}
      <p className="text-xs text-slate-500">
        Text fields take contains, does not contain, is, starts with, is empty or is not empty. Subscription takes is. Label takes has or does not have. Added takes before or after. Verification takes valid, risky, invalid, unknown or unverified. Blank rows are ignored.
      </p>
    </div>
  );
}

// The value box shows what a person types: a label name or subscription word instead of the stored id or boolean.
function ValueInput({ value, field, labels }: { value: string; field: string; labels: { id: string; name: string }[] }) {
  const shown = field === "label" ? (labels.find((l) => l.id === value)?.name ?? value) : field === "subscribed" ? (value === "true" ? "subscribed" : "unsubscribed") : value;
  return <Input name="value" defaultValue={shown} placeholder="Value, label name, subscribed, or YYYY-MM-DD" maxLength={200} list="segment-labels" />;
}

export function LabelList({ labels }: { labels: { id: string; name: string }[] }) {
  return (
    <datalist id="segment-labels">
      {labels.map((l) => (
        <option key={l.id} value={l.name} />
      ))}
    </datalist>
  );
}
