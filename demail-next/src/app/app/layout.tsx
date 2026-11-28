import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrgContext, setOrgCookie } from "@/lib/org";
import { getWorkspaceBranding } from "@/lib/branding";
import { signOut } from "../(auth)/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { getT } from "@/lib/i18n/server";
import type { MessageKey } from "@/lib/i18n";
import { LocaleSwitch } from "@/components/locale-switch";

const nav: { href: string; label: MessageKey }[] = [
  { href: "/app/contacts", label: "nav.contacts" },
  { href: "/app/segments", label: "nav.segments" },
  { href: "/app/unibox", label: "nav.unibox" },
  { href: "/app/campaigns", label: "nav.campaigns" },
  { href: "/app/forms", label: "nav.forms" },
  { href: "/app/website", label: "nav.website" },
  { href: "/app/mailboxes", label: "nav.mailboxes" },
  { href: "/app/deliverability", label: "nav.deliverability" },
  { href: "/app/suppression", label: "nav.suppression" },
  { href: "/app/settings/members", label: "nav.members" },
  { href: "/app/settings/ai", label: "nav.ai" },
  { href: "/app/settings/crm", label: "nav.crm" },
  { href: "/app/settings/enrichment", label: "nav.enrichment" },
  { href: "/app/settings/health", label: "nav.health" },
  { href: "/app/agency", label: "nav.agency" },
];

const HEX_RE = /^#[0-9a-f]{6}$/;
export async function generateMetadata(): Promise<Metadata> {
  const { supabase, org } = await getOrgContext();
  const brand = await getWorkspaceBranding(supabase, org.id);
  return { title: brand?.brand_name ?? "Demail", icons: brand?.logo_url ? { icon: brand.logo_url } : undefined };
}
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, org, orgs, user } = await getOrgContext();
  const brand = await getWorkspaceBranding(supabase, org.id);
  const t = await getT();
  const links = brand
    ? [
        { href: brand.support_url, label: t("nav.support") },
        { href: brand.privacy_url, label: t("nav.privacy") },
        { href: brand.terms_url, label: t("nav.terms") },
      ].filter((l): l is { href: string; label: string } => !!l.href)
    : [];

  const { count: unread } = await supabase
    .from("threads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .eq("status", "open")
    .eq("is_unread", true);
  const direct = orgs.filter((o) => !o.via_agency);
  const agencies = orgs
    .filter((o) => o.is_agency && !o.via_agency)
    .map((a) => ({ agency: a, clients: orgs.filter((o) => o.via_agency && o.agency_id === a.id) }))
    .filter((g) => g.clients.length > 0);
  async function switchOrg(formData: FormData) {
    "use server";
    // The cookie is only a hint; getOrgContext re-checks membership on every request.
    await setOrgCookie(String(formData.get("workspace") ?? ""));
    redirect("/app");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col gap-4 border-r border-slate-200 bg-slate-50 p-4">
        {brand ? (
          <Link
            href="/app"
            className="flex items-center gap-2 border-l-[3px] pl-2 text-lg font-semibold"
            style={{ borderLeftColor: HEX_RE.test(brand.accent_color) ? brand.accent_color : undefined }}
          >
            {brand.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element -- the logo is an arbitrary https host, not an optimizable local asset
              <img src={brand.logo_url} alt="" referrerPolicy="no-referrer" className="h-6 w-auto" />
            )}
            <span className="truncate">{brand.brand_name}</span>
          </Link>
        ) : (
          <Link href="/app" className="text-lg font-semibold">
            Demail
          </Link>
        )}
        <form action={switchOrg} className="flex gap-1">
          <Select name="workspace" defaultValue={org.id} aria-label={t("nav.workspace")}>
            {direct.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
            {agencies.map(({ agency, clients }) => (
              <optgroup key={agency.id} label={t("nav.clients", { name: agency.name })}>
                {clients.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <Button type="submit" variant="secondary" className="px-2">
            {t("nav.go")}
          </Button>
        </form>
        <nav className="flex flex-col gap-1 text-sm">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-2 py-1.5 hover:bg-slate-200">
              {t(n.label)}
              {n.href === "/app/unibox" && !!unread && <span className="ml-2 rounded-full bg-sky-600 px-1.5 py-0.5 text-xs text-white">{unread}</span>}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="mt-auto flex flex-col gap-2">
          <span className="truncate text-xs text-slate-500">{user.email}</span>
          <LocaleSwitch />
          <Button type="submit" variant="secondary">
            {t("nav.signout")}
          </Button>
        </form>
        {brand && (links.length > 0 || !brand.hide_powered_by) && (
          <div className="flex flex-col gap-1 text-xs text-slate-500">
            {links.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {links.map((l) => (
                  <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="hover:text-slate-700 hover:underline">
                    {l.label}
                  </a>
                ))}
              </div>
            )}
            {!brand.hide_powered_by && <span>{t("nav.powered")}</span>}
          </div>
        )}
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
