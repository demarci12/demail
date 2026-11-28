"use client";

// Ticks every row checkbox named "id" inside the same form.
export function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Select all on this page"
      onChange={(e) => {
        const form = e.currentTarget.form;
        form?.querySelectorAll<HTMLInputElement>('input[name="id"]').forEach((box) => (box.checked = e.currentTarget.checked));
      }}
    />
  );
}
