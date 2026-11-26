import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import type { ReactNode } from "react";
import { Alert, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { formsEnv, turnstileEnabled } from "@/lib/env";
import { signFillToken } from "@/lib/forms/token";
import { parseFields, type FormField } from "@/lib/input";
import { createAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
const SLUG_RE = /^[A-Za-z0-9_-]{8,32}$/;
const HEX_RE = /^#[0-9a-f]{6}$/;
const ERRORS: Record<string, string> = {
  invalid: "Check the highlighted fields and try again.",
  name: "Names cannot contain links, web or email addresses.",
  consent: "Please tick the consent box.",
  captcha: "The spam check did not pass. Try again.",
  expired: "This page was open too long or sent too fast. Try again.",
  rate: "Too many submissions. Try again later.",
  closed: "This form is not accepting submissions.",
  failed: "Something went wrong. Try again.",
};
type Params = Promise<{ slug: string }>;
type Search = Promise<{ embed?: string; done?: string; error?: string }>;
async function loadForm(slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  const { data } = await createAdminClient()
    .from("forms")
    .select("id, title, intro, submit_label, success_message, consent_text, fields, accent_color, layout")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  return data;
}
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const form = await loadForm(slug);
  return { title: form?.title || "Form", robots: { index: false, follow: false } };
}
const textareaCls =
  "min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100";
function FieldInput({ field }: { field: FormField }) {
  const name = `f_${field.key}`;
  const placeholder = field.placeholder;
  switch (field.type) {
    case "textarea":
      return <textarea name={name} required={field.required} maxLength={2000} placeholder={placeholder} className={textareaCls} />;
    case "select":
      return (
        <Select name={name} required={field.required} defaultValue="">
          <option value="" disabled={field.required}>
            {placeholder ?? "Choose one"}
          </option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      );
    case "email":
      return <Input type="email" name={name} required={field.required} maxLength={320} autoComplete="email" placeholder={placeholder} />;
    case "tel":
      return <Input type="tel" name={name} required={field.required} maxLength={40} autoComplete="tel" placeholder={placeholder} />;
    default:
      return <Input type="text" name={name} required={field.required} maxLength={200} placeholder={placeholder} />;
  }
}
function FieldRow({ field }: { field: FormField }) {
  if (field.type === "checkbox") {
    return (
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name={`f_${field.key}`} required={field.required} className="mt-0.5 h-4 w-4" />
        <span>
          {field.label}
          {field.required ? " *" : ""}
        </span>
      </label>
    );
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-600">
        {field.label}
        {field.required ? " *" : ""}
      </span>
      <FieldInput field={field} />
    </label>
  );
}
export default async function PublicFormPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const { embed, done, error } = await searchParams;
  const form = await loadForm(slug);
  if (!form) notFound();
  const isEmbed = embed === "1";
  const fields = parseFields(form.fields);
  const accent = HEX_RE.test(form.accent_color) ? form.accent_color : "#0284c7";
  const captcha = turnstileEnabled();
  const siteKey = formsEnv().TURNSTILE_SITE_KEY;
  let body: ReactNode;
  if (done === "1") {
    body = <p className="whitespace-pre-line text-sm text-slate-700">{form.success_message}</p>;
  } else if (!fields) {
    body = <Alert>{ERRORS.closed}</Alert>;
  } else {
    body = (
      <form method="post" action={`/api/forms/${slug}`} className="flex flex-col gap-3">
        {error ? <Alert>{ERRORS[error] ?? ERRORS.failed}</Alert> : null}
        {fields.map((f) => (
          <FieldRow key={f.key} field={f} />
        ))}
        {form.consent_text ? (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4" />
            <span className="whitespace-pre-line">{form.consent_text}</span>
          </label>
        ) : null}
        <input type="hidden" name="t" value={signFillToken(form.id)} />
        {isEmbed ? <input type="hidden" name="embed" value="1" /> : null}
        <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
          <input name="website" tabIndex={-1} autoComplete="off" />
        </div>
        {captcha && siteKey ? <div className="cf-turnstile" data-sitekey={siteKey} /> : null}
        <Button type="submit" style={{ backgroundColor: accent }}>
          {form.submit_label}
        </Button>
      </form>
    );
  }
  const content = (
    <div className="flex w-full flex-col gap-4">
      {form.title ? <h1 className="text-xl font-semibold">{form.title}</h1> : null}
      {form.intro && done !== "1" ? <p className="whitespace-pre-line text-sm text-slate-600">{form.intro}</p> : null}
      {body}
    </div>
  );
  const main = isEmbed ? "relative mx-auto w-full max-w-md" : "relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6";
  return (
    <main className={main}>
      {form.layout === "plain" ? content : <Card className="w-full">{content}</Card>}
      <p className="mt-3 text-center text-xs text-slate-400">Powered by Demail</p>
      {captcha && done !== "1" ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" /> : null}
    </main>
  );
}
