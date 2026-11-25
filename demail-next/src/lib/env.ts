import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(16),
  UNSUBSCRIBE_SECRET: z.string().min(32),
  SEND_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(20),
  INSTANCE_DAILY_SEND_CAP: z.coerce.number().int().min(1).default(100),
});

// NEXT_PUBLIC_* must be read as literal property accesses so Next inlines them.
export function publicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || undefined,
  });
}

// Server only: throws at first use when a required variable is missing.
export function serverEnv() {
  return serverSchema.parse(process.env);
}
const mailSchema = z.object({
  MAILBOX_ENCRYPTION_KEY: z.string().min(1).optional(),
  MAILBOX_ENCRYPTION_KEY_PREVIOUS: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
  MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
  MICROSOFT_TENANT: z.string().min(1).default("common"),
  SYNC_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(5),
  WARMUP_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  SYNC_MESSAGES_PER_MAILBOX: z.coerce.number().int().min(1).max(200).default(50),
});
// Google and Microsoft mailbox settings, all optional so Resend-only installs need nothing new.
export function mailEnv() {
  const blank = (v: string | undefined) => (v === "" ? undefined : v);
  const raw = Object.fromEntries(Object.keys(mailSchema.shape).map((k) => [k, blank(process.env[k])]));
  return mailSchema.parse(raw);
}
// Providers with client id, secret and the encryption key all present.
export function oauthProviders(): { google: boolean; microsoft: boolean } {
  const e = mailEnv();
  const key = !!e.MAILBOX_ENCRYPTION_KEY;
  return {
    google: key && !!e.GOOGLE_CLIENT_ID && !!e.GOOGLE_CLIENT_SECRET,
    microsoft: key && !!e.MICROSOFT_CLIENT_ID && !!e.MICROSOFT_CLIENT_SECRET,
  };
}

const webhookSchema = z.object({
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
});

// The Resend webhook signing secret; the route answers 503 while it is unset.
export function webhookEnv() {
  return webhookSchema.parse({ RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET || undefined });
}
