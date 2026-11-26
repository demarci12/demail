import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { removeBranding, saveBranding } from "./actions";
const HEX_RE = /^#[0-9a-f]{6}$/;
export default async function BrandingPage({ searchParams }: { searchParams: Promise<{ error?: string; msg?: string }> }) {
  const { error, msg } = await searchParams;
  const { supabase, org, canManage } = await getOrgContext();
  const notices = (
    <>
      {error && <Alert>{error}</Alert>}
      {msg && <Alert tone="info">{msg}</Alert>}
    </>
  );
  if (!org.is_agency) {
    return (
      <div className="flex max-w-3xl flex-col gap-6">
        <PageHeader title="Branding" />
        {notices}
        <Card className="flex flex-col gap-2 text-sm">
          <p>Branding is set by an agency and applies to the agency and all of its client workspaces.</p>
          <p className="text-slate-600">
            See{" "}
            <Link href="/app/agency" className="text-sky-700 underline">
              Agency
            </Link>{" "}
            to turn this workspace into an agency or to see which agency manages it.
          </p>
        </Card>
      </div>
    );
  }
  const { data: brand } = await supabase.from("org_branding").select("*").eq("organization_id", org.id).maybeSingle();
  const accent = brand && HEX_RE.test(brand.accent_color) ? brand.accent_color : "#0284c7";
  const readOnly = !canManage;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Branding" />
      {notices}
      <Card className="flex flex-col gap-2 text-sm">
        <p>
          Your brand replaces the Demail name in the dashboard of {org.name} and every client workspace: the sidebar name and logo, an accent border,
          the browser tab title and icon, and the support and legal links. Hosted forms of these workspaces show the logo and legal links too.
        </p>
        <p className="text-slate-600">
          The logo is an https address. Every viewer&apos;s browser loads it from its host, so use a host you trust and that stays online.
        </p>
        {readOnly && <p className="text-slate-600">Only owners and admins can change the branding.</p>}
      </Card>
      <Card>
        <form action={saveBranding} className="flex flex-col gap-3">
          <Field label="Brand name">
            <Input name="brand_name" required maxLength={60} defaultValue={brand?.brand_name ?? org.name} disabled={readOnly} />
          </Field>
          <Field label="Logo URL (https, optional)">
            <Input name="logo_url" type="url" maxLength={500} defaultValue={brand?.logo_url ?? ""} placeholder="https://" disabled={readOnly} />
          </Field>
          <Field label="Accent color">
            <Input name="accent_color" type="color" defaultValue={accent} className="w-20 px-1" disabled={readOnly} />
          </Field>
          <Field label="Support link (optional)">
            <Input name="support_url" type="url" maxLength={500} defaultValue={brand?.support_url ?? ""} placeholder="https://" disabled={readOnly} />
          </Field>
          <Field label="Privacy policy link (optional)">
            <Input name="privacy_url" type="url" maxLength={500} defaultValue={brand?.privacy_url ?? ""} placeholder="https://" disabled={readOnly} />
          </Field>
          <Field label="Terms link (optional)">
            <Input name="terms_url" type="url" maxLength={500} defaultValue={brand?.terms_url ?? ""} placeholder="https://" disabled={readOnly} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="hide_powered_by" defaultChecked={brand?.hide_powered_by ?? false} disabled={readOnly} className="h-4 w-4" />
            Hide the Powered by Demail line
          </label>
          {brand && (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <span className="inline-block h-4 w-4 rounded" style={{ backgroundColor: accent }} aria-hidden="true" />
              Now shown as <span className="font-medium text-slate-900">{brand.brand_name}</span>
            </p>
          )}
          {!readOnly && (
            <div>
              <Button type="submit">Save branding</Button>
            </div>
          )}
        </form>
        {!readOnly && brand && (
          <form action={removeBranding} className="mt-3">
            <Button type="submit" variant="secondary">
              Remove branding
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
