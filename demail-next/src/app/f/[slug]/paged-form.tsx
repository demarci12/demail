"use client";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const CONTROLS = "input, select, textarea";
// Multi-page and focus-mode form: every page stays in the DOM so every answer is posted in one submission.
export function PagedForm({
  action,
  pages,
  hiddenInputs,
  finalPage,
  captcha,
  submitLabel,
  accent,
  focus,
  mutedClass,
}: {
  action: string;
  pages: ReactNode[];
  hiddenInputs: ReactNode;
  finalPage: ReactNode;
  captcha: ReactNode;
  submitLabel: string;
  accent: string;
  focus: boolean;
  mutedClass: string;
}) {
  const [current, setCurrent] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const last = pages.length - 1;
  const pageOf = (el: Element) => {
    const holder = el.closest("[data-page]");
    return holder ? Number(holder.getAttribute("data-page")) : last;
  };
  const show = (page: number) => {
    flushSync(() => setCurrent(page));
    formRef.current?.querySelector(`[data-page="${page}"]`)?.querySelector<Control>(CONTROLS)?.focus();
  };
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const form = formRef.current;
    if (!form) return;
    const controls = Array.from(form.querySelectorAll<Control>(CONTROLS));
    if (current < last) {
      e.preventDefault();
      const invalid = controls.find((c) => pageOf(c) === current && !c.checkValidity());
      if (invalid) invalid.reportValidity();
      else show(current + 1);
      return;
    }
    const invalid = controls.find((c) => !c.checkValidity());
    if (!invalid) return;
    e.preventDefault();
    const page = pageOf(invalid);
    if (page !== current) flushSync(() => setCurrent(page));
    invalid.reportValidity();
  };
  return (
    <form ref={formRef} method="post" encType="multipart/form-data" action={action} noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
      {pages.length > 1 ? (
        <p className={`text-xs ${mutedClass}`} aria-live="polite">
          Step {current + 1} of {pages.length}
        </p>
      ) : null}
      {pages.map((page, i) => (
        <div key={i} data-page={i} hidden={i !== current}>
          <div className={focus ? "flex min-h-32 flex-col justify-center gap-3" : "flex flex-col gap-3"}>{page}</div>
        </div>
      ))}
      <div hidden={current !== last}>
        <div className="flex flex-col gap-3">{finalPage}</div>
      </div>
      {hiddenInputs}
      {captcha}
      <div className="flex gap-2">
        {current > 0 ? (
          <Button type="button" variant="secondary" onClick={() => show(current - 1)}>
            Back
          </Button>
        ) : null}
        <Button type="submit" className="flex-1" style={{ backgroundColor: accent }}>
          {current < last ? "Next" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
