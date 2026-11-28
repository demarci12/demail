import "server-only";
import { oauthProviders, turnstileEnabled } from "@/lib/env";

export type SetupCheck = { key: string; label: string; ok: boolean; required: boolean; hint: string };

const has = (name: string) => !!process.env[name];

// Which keys and integrations are configured on this instance. Only presence is reported, never a value.
export function setupChecks(): SetupCheck[] {
  const oauth = oauthProviders();
  const hops = process.env.TRUSTED_PROXY_HOPS;
  return [
    { key: "supabase", label: "Supabase keys", ok: has("NEXT_PUBLIC_SUPABASE_URL") && has("NEXT_PUBLIC_SUPABASE_ANON_KEY") && has("SUPABASE_SERVICE_ROLE_KEY"), required: true, hint: "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY." },
    { key: "resend", label: "Resend sending", ok: has("RESEND_API_KEY"), required: true, hint: "RESEND_API_KEY sends platform mail and campaigns from unconnected senders." },
    { key: "cron", label: "Scheduler secret", ok: (process.env.CRON_SECRET ?? "").length >= 16, required: true, hint: "CRON_SECRET, at least 16 characters, must equal the secret stored by supabase/setup/schedule.sql." },
    { key: "unsub", label: "Unsubscribe signing", ok: (process.env.UNSUBSCRIBE_SECRET ?? "").length >= 32, required: true, hint: "UNSUBSCRIBE_SECRET, at least 32 characters." },
    { key: "app_url", label: "Public app URL", ok: has("NEXT_PUBLIC_APP_URL") && !/localhost/.test(process.env.NEXT_PUBLIC_APP_URL ?? ""), required: true, hint: "NEXT_PUBLIC_APP_URL must be your public https address, because links in mail use it." },
    { key: "seal", label: "Mailbox encryption key", ok: has("MAILBOX_ENCRYPTION_KEY"), required: false, hint: "MAILBOX_ENCRYPTION_KEY is needed to connect Google and Microsoft mailboxes and to store AI and HubSpot keys." },
    { key: "google", label: "Google mailboxes", ok: oauth.google, required: false, hint: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, plus the encryption key." },
    { key: "microsoft", label: "Microsoft mailboxes", ok: oauth.microsoft, required: false, hint: "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET, plus the encryption key." },
    { key: "webhook", label: "Resend webhook", ok: has("RESEND_WEBHOOK_SECRET"), required: false, hint: "RESEND_WEBHOOK_SECRET lets Resend report bounces and complaints." },
    { key: "ai", label: "Shared AI key", ok: has("AI_API_KEY"), required: false, hint: "Optional. A workspace can bring its own AI key instead." },
    { key: "turnstile", label: "Form bot check", ok: turnstileEnabled(), required: false, hint: "Optional. TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY add Cloudflare Turnstile to hosted forms." },
    { key: "proxy", label: "Visitor address header", ok: hops !== undefined && hops !== "", required: false, hint: "Optional. TRUSTED_PROXY_HOPS tells forms and tracking which proxy header to trust." },
  ];
}
