import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import type { ReactNode } from "react";
import { Alert, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { BrandFooter, BrandLogo } from "@/components/public-brand";
import { getPublicBranding } from "@/lib/branding";
import { formsEnv, turnstileEnabled } from "@/lib/env";
import { signFillToken } from "@/lib/forms/token";
import { formPages, normalizeRedirectUrl, parseFields, type FormField } from "@/lib/input";
import { createAdminClient } from "@/lib/supabase/admin";
import { PagedForm } from "./paged-form";
export const dynamic = "force-dynamic";
const SLUG_RE = /^[A-Za-z0-9_-]{8,32}$/;
const HEX_RE = /^#[0-9a-f]{6}$/;
const ERRORS: Record<string, string> = {
  invalid: "Check the highlighted fields and try again.",
  name: "Names cannot contain links, web or email addresses.",
  link: "Answers cannot contain links, web or email addresses.",
  consent: "Please tick the consent box.",
  captcha: "The spam check did not pass. Try again.",
  expired: "This page was open too long or sent too fast. Try again.",
  rate: "Too many submissions. Try again later.",
  closed: "This form is not accepting submissions.",
  failed: "Something went wrong. Try again.",
};
type Theme = { main: string; surface: string | null; text: string; muted: string; input: string };
// Light is today's look; select("*") keeps the page working before the display columns exist.
const THEMES: Record<string, Theme> = {
  light: { main: "", surface: null, text: "text-slate-700", muted: "text-slate-600", input: "" },
  dark: { main: "bg-slate-950 text-slate-100", surface: "rounded-lg border border-slate-700 bg-slate-900 p-5", text: "text-slate-200", muted: "text-slate-400", input: "text-slate-900" },
  soft: { main: "bg-slate-100", surface: "rounded-2xl bg-white p-6 shadow-sm", text: "text-slate-700", muted: "text-slate-600", input: "" },
};
type Params = Promise<{ slug: string }>;
type Search = Promise<{ embed?: string; done?: string; error?: string }>;
async function loadForm(slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  const { data } = await createAdminClient()
    .from("forms")
    .select("*")
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
function FieldInput({ field, cls }: { field: FormField; cls: string }) {
  const name = `f_${field.key}`;
  const placeholder = field.placeholder;
  switch (field.type) {
    case "textarea":
      return <textarea name={name} required={field.required} maxLength={2000} placeholder={placeholder} className={cls ? `${textareaCls} ${cls}` : textareaCls} />;
    case "select":
      return (
        <Select name={name} required={field.required} defaultValue="" className={cls}>
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
      return <Input type="email" name={name} required={field.required} maxLength={320} autoComplete="email" placeholder={placeholder} className={cls} />;
    case "tel":
      return <Input type="tel" name={name} required={field.required} maxLength={40} autoComplete="tel" placeholder={placeholder} className={cls} />;
    default:
      return <Input type="text" name={name} required={field.required} maxLength={200} placeholder={placeholder} className={cls} />;
  }
}
function FieldRow({ field, theme, large = false }: { field: FormField; theme: Theme; large?: boolean }) {
  if (field.type === "checkbox") {
    return (
      <label className={`flex items-start gap-2 ${large ? "text-base" : "text-sm"} ${theme.text}`}>
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
      <span className={`${large ? "text-sm" : "text-xs"} font-medium ${theme.muted}`}>
        {field.label}
        {field.required ? " *" : ""}
      </span>
      <FieldInput field={field} cls={theme.input} />
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
  const brand = await getPublicBranding(form.organization_id);
  const siteKey = formsEnv().TURNSTILE_SITE_KEY;
  const theme = Object.hasOwn(THEMES, form.theme) ? THEMES[form.theme] : THEMES.light;
  const focus = form.focus_mode === true;
  const redirectUrl = normalizeRedirectUrl(form.redirect_url);
  let body: ReactNode;
  if (done === "1") {
    body = (
      <>
        <p className={`whitespace-pre-line text-sm ${theme.text}`}>{form.success_message}</p>
        {isEmbed && redirectUrl ? (
          <a href={redirectUrl} target="_top" rel="noopener noreferrer" className="text-sm font-medium hover:underline" style={{ color: accent }}>
            Continue
          </a>
        ) : null}
      </>
    );
  } else if (!fields) {
    body = <Alert>{ERRORS.closed}</Alert>;
  } else {
    const errorAlert = error ? <Alert>{Object.hasOwn(ERRORS, error) ? ERRORS[error] : ERRORS.failed}</Alert> : null;
    const consent = form.consent_text ? (
      <label className={`flex items-start gap-2 text-sm ${theme.text}`}>
        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4" />
        <span className="whitespace-pre-line">{form.consent_text}</span>
      </label>
    ) : null;
    const hidden = (
      <>
        <input type="hidden" name="t" value={signFillToken(form.id)} />
        {isEmbed ? <input type="hidden" name="embed" value="1" /> : null}
        <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
          <input name="website" tabIndex={-1} autoComplete="off" />
        </div>
      </>
    );
    const turnstile = captcha && siteKey ? <div className="cf-turnstile" data-sitekey={siteKey} /> : null;
    const pages = focus ? fields.map((f) => [f]) : formPages(fields);
    if (pages.length === 1 && !focus) {
      body = (
        <form method="post" action={`/api/forms/${slug}`} className="flex flex-col gap-3">
          {errorAlert}
          {fields.map((f) => (
            <FieldRow key={f.key} field={f} theme={theme} />
          ))}
          {consent}
          {hidden}
          {turnstile}
          <Button type="submit" style={{ backgroundColor: accent }}>
            {form.submit_label}
          </Button>
        </form>
      );
    } else {
      body = (
        <>
          {errorAlert}
          <PagedForm
            action={`/api/forms/${slug}`}
            pages={pages.map((page) => page.map((f) => <FieldRow key={f.key} field={f} theme={theme} large={focus} />))}
            hiddenInputs={hidden}
            finalPage={consent}
            captcha={turnstile}
            submitLabel={form.submit_label}
            accent={accent}
            focus={focus}
            mutedClass={theme.muted}
          />
        </>
      );
    }
  }
  const content = (
    <div className="flex w-full flex-col gap-4">
      <BrandLogo brand={brand} />
      {form.title ? <h1 className="text-xl font-semibold">{form.title}</h1> : null}
      {form.intro && done !== "1" ? <p className={`whitespace-pre-line text-sm ${theme.muted}`}>{form.intro}</p> : null}
      {body}
    </div>
  );
  const base = isEmbed ? "relative mx-auto w-full max-w-md" : "relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6";
  const main = isEmbed && theme.main ? `${base} p-4` : base;
  let surface: ReactNode;
  if (form.layout === "plain") surface = content;
  else if (theme.surface) surface = <div className={`w-full ${theme.surface}`}>{content}</div>;
  else surface = <Card className="w-full">{content}</Card>;
  const page = (
    <main className={main}>
      {surface}
      <BrandFooter brand={brand} />
      {captcha && done !== "1" ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" /> : null}
    </main>
  );
  return theme.main ? <div className={`min-h-screen ${theme.main}`}>{page}</div> : page;
}
