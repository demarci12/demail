import Link from "next/link";
import { getOrgContext } from "@/lib/org";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { appHost } from "@/lib/portal";
import { addPortalDomain, checkPortalDomain, removeBranding, removePortalDomain, saveBranding } from "./actions";
const HEX_RE = /^#[0-9a-f]{6}$/;
const utc = (at: string) => `${new Date(at).toISOString().replace("T", " ").slice(0, 16)} UTC`;
function Code({ children }: { children: string }) {
  return <code className="block select-all break-all rounded-md bg-slate-100 p-2 text-xs">{children}</code>;
}
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
  const { data: portal, error: portalError } = await supabase.from("portal_domains").select("*").eq("organization_id", org.id).maybeSingle();
  const mainHost = appHost();
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
      <Card className="flex flex-col gap-3 text-sm">
        <h2 className="text-base font-semibold">Custom domain</h2>
        <p>
          Give your clients a sign-in page on a hostname of your own, such as portal.youragency.com. On a verified hostname the sign-in and sign-up
          pages show your logo, name, accent color and legal links, and the dashboard works there too. Links in email, invitations, connect links and
          forms keep the main address {mainHost}, and Google and Microsoft mailboxes are connected from there.
        </p>
        {portalError ? (
          <Alert>Could not load the custom domain.</Alert>
        ) : !portal ? (
          readOnly ? (
            <p className="text-slate-600">No custom domain. Only owners and admins can add one.</p>
          ) : (
            <form action={addPortalDomain} className="flex flex-col gap-3">
              <Field label="Hostname">
                <Input name="hostname" required maxLength={253} placeholder="portal.youragency.com" />
              </Field>
              <div>
                <Button type="submit">Add custom domain</Button>
              </div>
            </form>
          )
        ) : (
          <div className="flex flex-col gap-3">
            <p>
              <span className="font-medium text-slate-900">{portal.hostname}</span>{" "}
              {portal.verified_at ? (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">Verified</span>
              ) : (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">Waiting for DNS</span>
              )}
              <span className="ml-2 text-xs text-slate-500">{portal.last_checked_at ? `Last checked ${utc(portal.last_checked_at)}` : "Not checked yet"}</span>
            </p>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-slate-700">
              <li className="flex flex-col gap-1">
                <span>At your DNS provider, publish a TXT record with this name and value.</span>
                <Code>{`_demail.${portal.hostname}`}</Code>
                <Code>{`demail-verify=${portal.verify_token}`}</Code>
              </li>
              <li>
                Ask the operator of this instance to add {portal.hostname} to the hosting project. On Vercel that is Project Settings, Domains: the
                operator adds the hostname, you publish the DNS record Vercel shows for it, and Vercel issues the certificate.
              </li>
              <li className="flex flex-col gap-1">
                <span>
                  The operator adds this address to Supabase Auth, URL Configuration, Redirect URLs, so sign-up confirmations return to it. Supabase
                  Auth then sends sign-in and recovery links for any user of this instance to it on request, so the operator adds it only for an
                  agency trusted with that, and removes it together with the hosting domain when this domain is removed or stops verifying.
                </span>
                <Code>{`https://${portal.hostname}/auth/callback`}</Code>
              </li>
              <li>
                Press Check now. Keep the TXT record published: a daily recheck turns the domain off when the record is gone. A DNS lookup that
                fails or times out keeps the current state.
              </li>
            </ol>
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <form action={checkPortalDomain}>
                  <Button type="submit">Check now</Button>
                </form>
                <form action={removePortalDomain}>
                  <Button type="submit" variant="secondary">
                    Remove custom domain
                  </Button>
                </form>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
