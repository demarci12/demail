"use client";
import { MERGE_FIELDS } from "@/lib/merge";
// Inserts {{field}} at the cursor of the focused subject or body input in the same form.
export function MergeInsert() {
  function insert(e: React.MouseEvent<HTMLButtonElement>, field: string) {
    const form = e.currentTarget.closest("form");
    const active = document.activeElement;
    const target = (active instanceof HTMLElement && form?.contains(active) && active.dataset.mergeTarget !== undefined ? active : form?.querySelector("textarea[data-merge-target]")) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!target) return;
    target.setRangeText(`{{${field}}}`, target.selectionStart ?? target.value.length, target.selectionEnd ?? target.value.length, "end");
    target.focus();
  }
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="text-slate-500">Insert field:</span>
      {MERGE_FIELDS.map((f) => (
        <button
          key={f}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => insert(e, f)}
          className="rounded-full border border-slate-300 px-2 py-0.5 text-slate-700 hover:bg-slate-50"
        >
          {f}
        </button>
      ))}
    </div>
  );
}
