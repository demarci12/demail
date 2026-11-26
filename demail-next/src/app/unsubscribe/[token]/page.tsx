import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandFooter, BrandLogo } from "@/components/public-brand";
import { getPublicBranding } from "@/lib/branding";
import { applyUnsubscribe } from "@/lib/unsubscribe-apply";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
export const dynamic = "force-dynamic";
type Params = Promise<{ token: string }>;
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  const parsed = verifyUnsubscribe(token);
  const brand = parsed ? await getPublicBranding(parsed.orgId) : null;
  return brand ? { title: brand.brand_name, icons: brand.logo_url ? { icon: brand.logo_url } : undefined } : {};
}
export default async function UnsubscribePage({ params, searchParams }: { params: Params; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const parsed = verifyUnsubscribe(token);
  const valid = parsed !== null;
  const brand = parsed ? await getPublicBranding(parsed.orgId) : null;
  async function confirm() {
    "use server";
    // A GET never unsubscribes, so mail scanners that open the link change nothing.
    const ok = await applyUnsubscribe(token);
    redirect(`/unsubscribe/${token}?done=${ok ? "1" : "0"}`);
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card className="flex w-full flex-col gap-4">
        <BrandLogo brand={brand} />
        <h1 className="text-xl font-semibold">Unsubscribe</h1>
        {!valid || done === "0" ? (
          <p className="text-sm text-slate-600">This unsubscribe link is not valid.</p>
        ) : done === "1" ? (
          <p className="text-sm text-slate-600">You are unsubscribed and will not receive further email from this sender.</p>
        ) : (
          <form action={confirm} className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">Confirm that you want to stop receiving email from this sender.</p>
            <Button type="submit" style={brand ? { backgroundColor: brand.accent_color } : undefined}>
              Unsubscribe
            </Button>
          </form>
        )}
      </Card>
      <BrandFooter brand={brand} poweredBy={false} />
    </main>
  );
}
