# Demail (Next.js + Supabase)

Demail is an open-source cold outreach tool that runs on free tiers: Next.js on Vercel, Postgres and Auth on Supabase, and Resend for delivery. This directory is a standalone rewrite of Demail for that stack. It shares nothing with the Go services in the repository root.

## What it includes

- Supabase Auth (email and password), workspaces, roles (owner, admin, member) and invitations.
- Contacts with labels and CSV import with column mapping.
- Sender identities (mailboxes) with a daily cap and a minimum gap between sends.
- Campaigns with email and wait steps, merge fields with fallbacks, a preview against a sample contact, a send window by timezone and weekday, enrollment by label or all contacts, launch and pause.
- Sending through Resend from a scheduler endpoint, with an instance-wide daily cap.
- A suppression list, an unsubscribe page, RFC 8058 one-click unsubscribe and `List-Unsubscribe` headers on every mail.

- Google and Microsoft mailboxes through OAuth, with tokens sealed by the app before they reach the database. Resend stays the default free path.
- Reply sync by polling, stop on reply, and bounce suppression.
- A unibox: a threaded inbox of replies to your campaign mail across connected mailboxes, with live updates through Supabase Realtime, reply, compose, archive and read state.
- Open and click tracking per campaign, with bot and privacy-proxy filtering, a stats card on the campaign page and an activity timeline on each contact.
Not included yet: warmup, open and click tracking, SMTP/IMAP mailboxes, AI, enrichment, CRM sync. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Free-tier stack and limits

| Service | Role | Free tier limit to know |
|---|---|---|
| Supabase | Postgres, Auth, scheduler (`pg_cron`, `pg_net`, Vault) | 500 MB database, projects pause after a week without activity |
| Vercel (Hobby) | Hosts the Next.js app and API routes | Cron runs once a day at most, function time limit applies |
| Resend | Sends the mail | 100 mails a day, 3000 a month, one verified domain |

`INSTANCE_DAILY_SEND_CAP` defaults to 100 so a new instance stays inside the Resend free tier.

## Setup

1. **Get the code.** Fork or clone the repository. The app lives in `demail-next/`.
2. **Create a Supabase project** at supabase.com. Note the project URL, the anon key and the service role key (Project settings, API).
3. **Apply the schema.** Either install the Supabase CLI, run `supabase link --project-ref <ref>` and `supabase db push` from `demail-next/`, or paste each file in `supabase/migrations/` into the SQL editor in filename order.
4. **Configure Auth.** In Authentication, URL configuration, set the site URL to your Vercel URL and add `<your URL>/auth/callback` to the redirect allow list. Keep email confirmation on for a public instance. Switch it off only for a private trial.
5. **Set up Resend.** Create an account, add and verify your sending domain (DNS records SPF and DKIM), then create an API key. Mailbox addresses in Demail must belong to that verified domain.
6. **Deploy to Vercel.** Import the repository, set the root directory to `demail-next`, and add the environment variables from the table below. Generate the two secrets with `openssl rand -hex 32`. Deploy.
7. **Start the scheduler.** Open `supabase/setup/schedule.sql`, replace the app URL and the cron secret placeholders (the secret must equal `CRON_SECRET` on Vercel), and run it once in the Supabase SQL editor. It stores both in Vault and schedules two jobs every minute: `POST /api/cron/send` and `POST /api/cron/sync`.
8. **Create your account.** Open the app, sign up, confirm your email, and create your first workspace. Add a mailbox, import contacts, build a campaign, select the sender, enroll contacts and launch.

If you skip step 7, `vercel.json` still calls the same route once a day. That is enough to try the app, not to send on a schedule.

## Environment variables

Also listed with comments in `.env.example`.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key, safe in the browser because RLS guards every table |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role key, server only, used by the sender and the unsubscribe route |
| `RESEND_API_KEY` | yes | Resend API key |
| `CRON_SECRET` | yes | Bearer secret for `/api/cron/send`, at least 16 characters |
| `UNSUBSCRIBE_SECRET` | yes | HMAC secret for unsubscribe links, at least 32 characters. Changing it invalidates links already sent |
| `NEXT_PUBLIC_APP_URL` | yes | Public base URL without a trailing slash, used in links inside mail |
| `SEND_BATCH_SIZE` | no | Enrollments processed per tick, default 20 |
| `INSTANCE_DAILY_SEND_CAP` | no | Mails per UTC day for the whole instance, default 100 (Resend senders only) |
| `MAILBOX_ENCRYPTION_KEY` | no | 32 bytes, base64 (`openssl rand -base64 32`). Seals Google and Microsoft tokens before they reach the database. Required to connect those mailboxes. Losing it means reconnecting them |
| `MAILBOX_ENCRYPTION_KEY_PREVIOUS` | no | The old key while rotating. Tokens sealed with it still open, and are re-sealed with the current key at the next refresh |
| `GOOGLE_CLIENT_ID` | no | Google OAuth client id. With the secret and the encryption key it enables Connect Google |
| `GOOGLE_CLIENT_SECRET` | no | Google OAuth client secret |
| `MICROSOFT_CLIENT_ID` | no | Microsoft Entra application (client) id. With the secret and the encryption key it enables Connect Microsoft |
| `MICROSOFT_CLIENT_SECRET` | no | Microsoft Entra client secret value |
| `MICROSOFT_TENANT` | no | Entra tenant id, or `common` (default), `organizations` or `consumers` |
| `SYNC_BATCH_SIZE` | no | Mailboxes read per sync tick, default 5, max 50 |
| `SYNC_MESSAGES_PER_MAILBOX` | no | Messages read per mailbox per tick, default 50, max 200 |

No secret is committed. Real values live only in Vercel and in your local `.env.local`.

## Local development

```
cd demail-next
pnpm install
cp .env.example .env.local   # fill in the values
pnpm dev
```

Use a hosted Supabase project for development, or run `supabase start` if you have Docker. Run `pnpm typecheck` and `pnpm lint` before pushing. To trigger a send tick locally:

```
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/send
```

## Connecting Google and Microsoft mailboxes
Optional. Resend senders keep working without any of this. Set `MAILBOX_ENCRYPTION_KEY` first, then one or both providers. The redirect URI is `<NEXT_PUBLIC_APP_URL>/app/mailboxes/connect/<google|microsoft>/callback`. SMTP and IMAP mailboxes are not supported, because long-lived connections cannot run on Vercel or Supabase Edge Functions.

**Google**
1. In Google Cloud, create a project and enable the Gmail API.
2. Configure the OAuth consent screen. Add the scopes `gmail.send` and `gmail.readonly` and your own address as a test user.
3. Create an OAuth client of type Web application and add the redirect URI `<NEXT_PUBLIC_APP_URL>/app/mailboxes/connect/google/callback`.
4. Copy the client id and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. Publish the app to Production. In Testing mode refresh tokens expire after 7 days, so mailboxes would disconnect weekly.
6. Both Gmail scopes are restricted. An unverified app is capped at 100 users and shows a warning screen. A Google Workspace admin can mark the app as trusted to avoid that for their domain.

**Microsoft**
1. In Microsoft Entra, register an application. For supported account types choose the option that matches your mailboxes, and set `MICROSOFT_TENANT` to match (`common` for work and personal accounts).
2. Add a Web redirect URI `<NEXT_PUBLIC_APP_URL>/app/mailboxes/connect/microsoft/callback`.
3. Under Certificates and secrets, create a client secret and copy its value (not the id) into `MICROSOFT_CLIENT_SECRET`. Copy the application id into `MICROSOFT_CLIENT_ID`.
4. API permissions: delegated `offline_access`, `User.Read`, `Mail.ReadWrite` and `Mail.Send`.

## How sending works

Each tick claims due enrollments with `FOR UPDATE SKIP LOCKED` and a ten minute lease, then handles each one: it stops the enrollment if the contact is unsubscribed or suppressed, waits for the campaign send window, respects the mailbox daily limit, the minimum gap, the campaign daily limit and the instance cap, renders merge fields, and sends through the mailbox's provider. Resend mailboxes send with `Idempotency-Key` set to `<enrollment id>:<step position>`; Gmail mailboxes send through the Gmail API and Microsoft mailboxes through Microsoft Graph, and each sent message stores its provider message id, thread id and RFC Message-ID. Every message carries a visible unsubscribe link; Resend and Gmail also send `List-Unsubscribe` and one-click headers, while Microsoft Graph accepts only `x-` custom headers, so there the footer link and suppression are the mechanism. Gmail and Graph sends carry no idempotency key, so a network timeout after the provider accepted a message can send that message twice on retry; the daily cap and minimum gap limit this to one duplicate per failure.

Follow-ups from a Gmail or Microsoft mailbox stay on the mailbox and thread of the first message, with the subject `Re: <first subject>`. If that mailbox is at its daily limit or inside its minimum gap, the follow-up waits for the next opening and never switches mailboxes; if the mailbox is disconnected it waits until you reconnect it. The instance cap applies to Resend mailboxes only. Gmail and Microsoft sending limits are the account's own, so set the mailbox daily limit at or below 500 for personal Gmail and 2000 for Google Workspace. Just before sending, the enrollment is read again and skipped if it is no longer active. A merge field that is empty and has no fallback fails that enrollment instead of sending a blank. Resend 429 and 5xx errors are retried after five minutes up to five attempts, other 4xx errors fail the enrollment. Steps can only be edited while a campaign is not active.

## Reply sync and stop on reply
A second job, `demail-sync`, calls `/api/cron/sync` every minute through `pg_cron` and `pg_net`, which is the shortest interval Supabase free allows. Each tick leases up to `SYNC_BATCH_SIZE` Gmail and Microsoft mailboxes with `FOR UPDATE SKIP LOCKED` and a five minute lease, reads at most `SYNC_MESSAGES_PER_MAILBOX` messages from each and stops after about 45 seconds, under the 60 second Vercel Hobby limit. Mailboxes in an active campaign with active enrollments are read every minute, idle ones every 10 minutes, and a failing mailbox backs off exponentially up to 60 minutes. Gmail is read with `history.list` from a stored `historyId` and Microsoft with the inbox delta from a stored `deltaLink`. The first run only records the starting point, so old mail is never imported. The Vercel cron in `vercel.json` is a daily fallback for hosts that cannot use `pg_cron`.
Gmail push (Pub/Sub watch) and Microsoft Graph change notifications are intentionally not used. They need extra cloud setup, renewals every 7 days and every 3 days, and a public validated webhook, which works against a free, easy install. They could be added later as an accelerator.
Only replies to Demail mail are stored: a message must match a sent campaign message by provider thread, or by `In-Reply-To` or `References`, or belong to a thread already stored. The rest of the inbox is never written to the database. Bodies are plain text, truncated at 100 KB.
A real reply stops the contact's active enrollments in campaigns with stop on reply and records the reason `replied`. Auto-replies (out of office, `Auto-Submitted`, bulk or auto-reply headers) are stored but do not stop a sequence. A bounce notice suppresses the address, stops its enrollments with the reason `bounced`, and is stored with the kind `bounce`. If the provider rejects the stored cursor, Gmail looks back two days once and Microsoft restarts from the last seven days.
To run a tick locally:
```
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync
```
## Open and click tracking

- **Toggles.** Each campaign has Track opens and Track clicks, on by default for new campaigns. Existing campaigns keep their previous behavior (off).
- **Tokens.** A pixel URL is `/api/t/o/<message id>.<mac>` and a link is `/api/t/c/<message id>.<base64url url>.<mac>`. The MAC is HMAC-SHA256 under a key derived from `UNSUBSCRIBE_SECRET` and the label `demail:tracking:v1`, so no new variable is needed. The click route only redirects to the http(s) URL inside a verified token. The unsubscribe link is never rewritten.
- **Filtering.** A hit is stored either way but counted only when it passes these rules, in order: own read, prefetch (HEAD or a `Purpose` header), known crawler or scanner user agent (or none), an Apple 17.0.0.0/8 address, a click within 10 seconds of sending or an open within 3 seconds. Gmail's image proxy fetches when the mail is read, so it counts as an open.
- **Own reads.** Signed-in members get an httpOnly `demail_reader` cookie, so opening sent mail in webmail in the same browser is not counted. Browsers that block third-party cookies send nothing, so those reads can still count.
- **Caveats.** Apple Mail Privacy Protection and image blocking hide real opens, so open rates are an estimate. Click tracking rewrites links, which can affect deliverability, and nothing here guarantees inbox placement.
- **Data.** Events keep the message, contact, campaign, a user agent cut to 200 characters and the URL. No IP address is stored. Each message stores at most 200 events, and `purge_old_events()` deletes events older than 180 days.

## Design decisions

- **Directory name.** The rewrite lives in `demail-next/` next to the Go code, as its own pnpm project with its own lockfile.
- **Scheduling split.** Vercel Hobby cron runs at most once a day, so it cannot drive sending. Supabase `pg_cron` runs every minute and calls the app through `pg_net`. The URL and secret sit in Supabase Vault and are set by `schedule.sql`, never by a migration. `vercel.json` keeps a daily call as a fallback. Edge Functions and a queue extension are not used, because sending shares code with the app and a claimed queue table is enough.
- **Long-lived connections.** IMAP idle and pooled SMTP connections cannot run on Vercel or Supabase Edge Functions, so SMTP and IMAP mailboxes are not supported. Gmail and Microsoft Graph are plain HTTPS APIs and work from a serverless function.
- **Mailbox encryption.** OAuth tokens are sealed in the app with AES-256-GCM using `MAILBOX_ENCRYPTION_KEY` and stored in `mailbox_credentials`, a table with row level security, no policies and no grants for signed-in users, so only the service role reads it. Supabase Vault was not used: it needs one RPC per read and is awkward to dump and restore for self-hosts, while here a database dump alone is useless without the key. Resend-only installs need no key.
- **Polling over push.** Gmail watch needs a Pub/Sub topic and a renewal every 7 days, and Graph subscriptions need a public validated webhook renewed every 3 days. Both work against a free, easy install, so replies are polled. Push could be added later as an accelerator.
- **Cron split.** Supabase `pg_cron` runs `demail-send` and `demail-sync` every minute, each bounded to stay under the 60 second Vercel Hobby limit. Vercel keeps a daily fallback call for each.
- **Realtime.** `threads` and `thread_messages` are in the `supabase_realtime` publication. The unibox subscribes and refreshes the page at most once a second. Row level security decides what each user receives.
- **Sender model.** One Resend key per instance. A mailbox row is a sender identity, not a credential store.
- **Tenant isolation.** Every organization-owned table has `organization_id`, row level security and composite foreign keys, so a row cannot reference another workspace. Server Actions never take the workspace from form data. The service role key is used only in `src/lib/supabase/admin.ts`.

## Rotating the mailbox encryption key
1. Set `MAILBOX_ENCRYPTION_KEY_PREVIOUS` to the current key.
2. Set `MAILBOX_ENCRYPTION_KEY` to a new value from `openssl rand -base64 32` and redeploy. Mailboxes do not need reconnecting, because opening a value tries both keys.
3. Each mailbox is rewritten under the new key the next time its token refreshes (about hourly while it is used).
4. Remove `MAILBOX_ENCRYPTION_KEY_PREVIOUS` once every connected mailbox has synced or sent since step 2.
If the key is lost and there is no previous key, stored tokens cannot be opened and each mailbox must be reconnected.
## Known limitations
- SMTP and IMAP mailboxes are not supported. Use Gmail, Microsoft or Resend.
- Only replies to Demail campaign mail (and mail sent from the unibox) are stored. The rest of a connected inbox is never read into the database.
- Supabase Realtime on the free tier allows 200 concurrent connections, and each open unibox tab uses one.
- Microsoft Graph accepts no `List-Unsubscribe` header, so Microsoft mail carries only the footer unsubscribe link.
- Google treats Gmail scopes as restricted: an unverified app is limited to 100 users and refresh tokens expire after 7 days while the app is in Testing.
- Losing `MAILBOX_ENCRYPTION_KEY` means every OAuth mailbox must be reconnected.

- Reply detection polls, so a reply can take up to a minute (active campaigns) or ten minutes (idle mailboxes) to be seen.
- Resend free allows 100 mails a day and 3000 a month, and the instance cap follows that.
- Vercel limits function time, so each tick sends a small batch. Raise `SEND_BATCH_SIZE` only on a plan with longer limits.
- Supabase free projects pause after inactivity, which also pauses the scheduler.
- Migrations were checked against an in-memory Postgres, not a live Supabase project. The `schedule.sql` extensions run for the first time in your project.

## License

Apache-2.0, see the root `LICENSE`. Attribution is in the root [NOTICE](../NOTICE).
