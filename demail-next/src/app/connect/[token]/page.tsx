import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Alert, Card } from "@/components/ui/card";
import { BrandFooter, BrandLogo } from "@/components/public-brand";
import { getPublicBranding } from "@/lib/branding";
import { oauthProviders } from "@/lib/env";
import { displayName } from "@/lib/input";
import { createAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect a mailbox", robots: { index: false, follow: false }, referrer: "no-referrer" };
const TOKEN_RE = /^[0-9a-f]{64}$/;
const INVALID = "This connect link is not valid, has expired or has been used.";
const CONNECTED = "Mailbox connected. You can close this page.";
const ERRORS: Record<string, string> = {
  expired: "The connect session expired. Start again.",
  denied: "The provider did not grant access. Start again and allow access.",
  used: "This link has no connections left or was revoked. Ask the workspace for a new link.",
  refresh: "The provider returned no refresh token. Remove the app from the account's connected apps and start again.",
  failed: "Could not connect the mailbox. Try again or ask the workspace for a new link.",
};
function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card className="flex w-full flex-col gap-4">
        <h1 className="text-xl font-semibold">Connect a mailbox</h1>
        {children}
      </Card>
    </main>
  );
}
export default async function ConnectPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { token } = await params;
  const { done, error } = await searchParams;
  const admin = createAdminClient();
  const { data: rows } = TOKEN_RE.test(token) ? await admin.rpc("connect_link_lookup", { p_token: token }) : { data: null };
  const link = rows?.[0];
  if (!link) {
    return (
      <Shell>
        <p className="text-sm text-slate-600">{done === "1" ? CONNECTED : INVALID}</p>
      </Shell>
    );
  }
  const [{ data: org }, brand] = await Promise.all([admin.from("organizations").select("name").eq("id", link.organization_id).maybeSingle(), getPublicBranding(link.organization_id)]);
  const workspace = displayName(org?.name, "a workspace");
  const label = link.label ? displayName(link.label, "") : "";
  const providers = oauthProviders();
  const buttonStyle = brand ? { backgroundColor: brand.accent_color } : undefined;
  const message = error && Object.hasOwn(ERRORS, error) ? ERRORS[error] : undefined;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card className="flex w-full flex-col gap-4">
        <BrandLogo brand={brand} />
        <h1 className="text-xl font-semibold">Connect a mailbox</h1>
        <p className="text-sm text-slate-600">
          For <span className="font-medium text-slate-900">{workspace}</span>
          {label ? `: ${label}` : ""}
        </p>
        {done === "1" && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{CONNECTED}</p>}
        {message && <Alert>{message}</Alert>}
        <p className="text-sm text-slate-600">
          Connecting gives {workspace} permission to send mail from your mailbox and to read replies to its campaigns. Demail stores only replies to mail sent from Demail, never the rest of your inbox. You can remove access at any time in your Google or Microsoft account settings, or ask the workspace to remove the mailbox.
        </p>
        {providers.google || providers.microsoft ? (
          <div className="flex flex-wrap gap-2">
            {providers.google && (
              <a href={`/connect/${token}/google`} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white" style={buttonStyle}>
                Connect Google
              </a>
            )}
            {providers.microsoft && (
              <a href={`/connect/${token}/microsoft`} className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white" style={buttonStyle}>
                Connect Microsoft
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-600">No mail provider is set up on this instance.</p>
        )}
      </Card>
      <BrandFooter brand={brand} />
    </main>
  );
}
