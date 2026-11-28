import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandFooter, BrandLogo } from "@/components/public-brand";
import { getPublicBranding } from "@/lib/branding";
import { verifyConfirmToken } from "@/lib/forms/token";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type Params = Promise<{ token: string }>;
const MESSAGES: Record<string, string> = {
  ok: "Thanks, your email address is confirmed.",
  used: "This link was already used. Your email address is confirmed.",
  expired: "This link has expired. Fill in the form again to get a new one.",
  invalid: "This confirmation link is not valid.",
};

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false, follow: false } };

export default async function ConfirmPage({ params, searchParams }: { params: Params; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const id = verifyConfirmToken(token);
  let orgId: string | null = null;
  if (id) {
    const { data } = await createAdminClient().from("form_confirmations").select("organization_id").eq("id", id).maybeSingle();
    orgId = data?.organization_id ?? null;
  }
  const brand = orgId ? await getPublicBranding(orgId) : null;
  async function confirm() {
    "use server";
    // A GET never confirms, so mail scanners that open the link change nothing.
    const confirmationId = verifyConfirmToken(token);
    let status = "invalid";
    if (confirmationId) {
      const { data } = await createAdminClient().rpc("confirm_form_optin", { p_confirmation: confirmationId });
      status = data ?? "invalid";
    }
    redirect(`/f/confirm/${token}?done=${Object.hasOwn(MESSAGES, status) ? status : "invalid"}`);
  }
  const message = done && Object.hasOwn(MESSAGES, done) ? MESSAGES[done] : null;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card className="flex w-full flex-col gap-4">
        <BrandLogo brand={brand} />
        <h1 className="text-xl font-semibold">Confirm your email</h1>
        {!id || !orgId ? (
          <p className="text-sm text-slate-600">{MESSAGES.invalid}</p>
        ) : message ? (
          <p className="text-sm text-slate-600">{message}</p>
        ) : (
          <form action={confirm} className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">Confirm that this is your email address and that you want to hear from this sender.</p>
            <Button type="submit" style={brand ? { backgroundColor: brand.accent_color } : undefined}>
              Confirm
            </Button>
          </form>
        )}
      </Card>
      <BrandFooter brand={brand} poweredBy={false} />
    </main>
  );
}
