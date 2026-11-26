import type { Branding } from "@/lib/branding";
export function BrandLogo({ brand }: { brand: Branding | null }) {
  if (!brand?.logo_url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the logo is an arbitrary https host, not an optimizable local asset
    <img src={brand.logo_url} alt="" referrerPolicy="no-referrer" className="h-8 w-auto self-start" />
  );
}
export function BrandFooter({ brand, poweredBy = true }: { brand: Branding | null; poweredBy?: boolean }) {
  const legal = brand
    ? [
        { href: brand.privacy_url, label: "Privacy" },
        { href: brand.terms_url, label: "Terms" },
      ].filter((l): l is { href: string; label: string } => !!l.href)
    : [];
  const showPowered = poweredBy && !brand?.hide_powered_by;
  if (legal.length === 0 && !showPowered) return null;
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs text-slate-400">
      {legal.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 hover:underline">
          {l.label}
        </a>
      ))}
      {showPowered ? <span>Powered by Demail</span> : null}
    </div>
  );
}
