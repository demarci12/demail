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
- Deliverability: health bands, bounce and complaint events, SPF, DKIM and DMARC checks.
- Warmup between your own Google and Microsoft mailboxes: a daily ramp, workday scheduling, human-delay replies, placement checks and an optional filter tag.
- A/B/Z variants for email steps, split evenly per enrollment, with results per variant.
- Condition steps in campaigns: branch on opened, clicked, replied or visited site, end a path, with each decision kept per contact.
- Campaign analytics by step, by variant and by mailbox: sent, opened, clicked, replied and bounced.
- A pre-launch review of senders, blank merge fields and unsubscribed or suppressed enrollments.
- Test sends of a saved step or variant to your own address.
- Bring-your-own-key AI settings per workspace (off by default): an OpenAI-compatible provider, a sealed workspace key or an optional instance key, and a daily call limit.
- AI step drafts from a short brief and AI reply drafts in the unibox, sent only when a member clicks send.
- Opt-in AI reply classification: an intent and a one-line summary on each new reply, shown and filterable in the unibox.
- HubSpot sync with a private app token: contacts are pulled in (blanks filled, opt-outs honored) and each new reply is added as a note on the HubSpot contact.
- Hosted forms: a form builder, a public page and an iframe embed that add contacts to your workspace, with spam protection and rate limits.
- Hosted form extras: multi-page forms, focus mode with one question per screen, light, dark and soft themes, and an optional redirect after submit.
- Website tracking: a snippet with ask-first and record-on-load consent modes that records page visits without storing IP addresses, links visitors to contacts through tracked email clicks and shows visits on the contact.
- Agencies with client workspaces: agency staff open every client workspace with their agency role, from the workspace switcher or an agency overview.
- White-label for agencies: a brand name, logo, accent color, support and legal links and a Powered by toggle in the dashboard of the agency and its clients and on their hosted forms.
- Attaching an existing workspace to an agency through an invitation link that the workspace owner accepts.
- Shared limits for agencies: a monthly send pool and AI pool with per-client caps, and an opt-in shared agency AI key.
- A branded unsubscribe page for contacts of agency and client workspaces.
- Client connect links: a client connects their own Google or Microsoft mailbox into a workspace without an account.
- A custom portal domain for agencies: one hostname proven by a DNS TXT record, with branded sign-in and sign-up pages, where the dashboard works too.
Not included yet: subsequences, attachments, SMTP/IMAP mailboxes, enrichment, CRMs other than HubSpot, auto-send of AI replies, file fields on forms, form submission notifications and double opt-in. This release builds roadmap Phase 5 part 5 (condition steps in campaigns including visited site, hosted form extras) on top of parts 1 to 4 (AI with your own key, AI drafts with approval, reply classification, HubSpot sync, hosted forms, agencies with client workspaces, white-label, attach with consent, shared send and AI limits, branded unsubscribe page, client connect links, website tracking with consent modes and visitor matching, a custom portal domain with a branded sign-in page); Phase 5 part 6 is next. See [docs/ROADMAP.md](docs/ROADMAP.md).

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
6. **Deploy to Vercel.** Import the repository, set the root directory to `demail-next`, and add the environment variables from the table below. Generate the two secrets with `openssl rand -hex 32`. Optionally add `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` from a free Cloudflare Turnstile widget to add a captcha to hosted forms. Deploy.
7. **Start the scheduler.** Open `supabase/setup/schedule.sql`, replace the app URL and the cron secret placeholders (the secret must equal `CRON_SECRET` on Vercel), and run it once in the Supabase SQL editor. It stores both in Vault and schedules two jobs every minute: `POST /api/cron/send` and `POST /api/cron/sync`. It also schedules `demail-warmup` (`POST /api/cron/warmup`, every minute), `demail-ai` (`POST /api/cron/ai`, every minute: reply classification, idle unless a workspace turns it on), `demail-crm` (`POST /api/cron/crm`, every 5 minutes: HubSpot sync, idle unless a workspace connects HubSpot), `demail-health` (SQL, every 5 minutes: health bands and warmup planning), `demail-domains` (`POST /api/cron/domains`, hourly) and `demail-purge` (SQL, daily).
8. **Create your account.** Open the app, sign up, confirm your email, and create your first workspace. Add a mailbox, import contacts, build a campaign, select the sender, enroll contacts and launch.

If you skip step 7, `vercel.json` still calls the same route once a day. That is enough to try the app, not to send on a schedule.
## Upgrading
1. **Apply new migrations first.** Run `supabase db push` from `demail-next/`, or paste each new file in `supabase/migrations/` into the SQL editor in filename order. Never edit a migration that is already applied; changes always come as a new file.
2. **Then deploy the new app code** to Vercel.
3. **Re-run `supabase/setup/schedule.sql`** when the release notes add a scheduled job.
The previous app release keeps working on the new schema, so applying migrations first is safe. Deploying the app first is not: until the migrations run, the new code calls database functions and tables that do not exist yet. For the agency release that means every workspace's campaign enrollments are held for an hour at a time with an error in the logs, and client workspaces without their own AI key get an AI provider error. Both clear on their own once the migrations are applied.

For Phase 5 part 4, apply `20260101003100_website_tracking.sql` and then `20260101003200_portal_domains.sql`, then deploy. `schedule.sql` needs no re-run: the existing `demail-purge` job calls the redefined `purge_old_events()`, and the existing hourly `demail-domains` job rechecks portal domains. If the app is deployed before the migrations, nothing is lost but the new features stay off: the website collect endpoint answers 204 and stores nothing, email clicks are not linked to visitors, portal hostnames show the default sign-in page, and the Website page and the Custom domain card on the Branding page show a load error until the migrations run. After a rollback to the previous release, the snippet's requests get a 404 and store nothing, clicks stop linking visitors, portal hostnames show the default sign-in page, and collected visits and domains stay.
For Phase 5 part 5, apply `20260101003300_campaign_branches.sql` and then `20260101003400_form_display.sql`, then deploy. `schedule.sql` needs no re-run. If the app is deployed before the migrations, nothing is lost but the new features stay off: sending continues through the old claim function, condition steps cannot be added, saving form settings fails with "Could not save the form.", and forms render as one light page. After a rollback to the previous release, campaigns with conditions wait without sending until the upgrade returns, linear campaigns send as before, forms show one light page with the success message, and the old form editor drops page breaks when it saves fields; condition results and form settings stay.

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
| `RESEND_WEBHOOK_SECRET` | no | Resend webhook signing secret (`whsec_...`). Without it `/api/webhooks/resend` answers 503 |
| `WARMUP_BATCH_SIZE` | no | Warmup jobs run per tick, default 10, max 50 |
| `SYNC_BATCH_SIZE` | no | Mailboxes read per sync tick, default 5, max 50 |
| `SYNC_MESSAGES_PER_MAILBOX` | no | Messages read per mailbox per tick, default 50, max 200 |
| `AI_API_KEY` | no | Instance AI key, used by every workspace that has AI on and no key of its own. Leave it unset on a shared or public instance |
| `AI_BASE_URL` | no | OpenAI-compatible base URL for the instance key, default `https://api.openai.com/v1`. Trusted and not checked, so a local Ollama (`http://localhost:11434/v1`) works |
| `AI_MODEL` | no | Default model, `gpt-4o-mini` when unset. A workspace with its own key can pick another |
| `AI_INSTANCE_DAILY_CALL_CAP` | no | AI calls per UTC day made with the instance key, across all workspaces, default 100 |
| `TURNSTILE_SITE_KEY` | no | Cloudflare Turnstile site key for hosted forms. Public, shown in the form page. Turnstile is on only when both keys are set |
| `TURNSTILE_SECRET_KEY` | no | Cloudflare Turnstile secret key, server only |
| `TRUSTED_PROXY_HOPS` | no | Where hosted forms and website tracking read the visitor address for their per-IP limits. Unset: `X-Real-IP`, which Vercel sets. `0`: no header is trusted and all visitors share one bucket. `1` to `10`: the Nth `X-Forwarded-For` entry from the right, for that many proxies that append to it. See Hosted forms |

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
Reconnecting an address that is already in the workspace replaces its credentials and clears its error. A disconnected mailbox becomes active again, while a paused one stays paused until a member presses Resume.

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

## Client connect links
- **Who creates them.** Owners and admins of a workspace, agency staff included, create a link in the Connect links card on the Mailboxes page. The card shows when at least one of Google or Microsoft is set up.
- **Lifetime and uses.** A link is valid for 1 to 30 days (7 by default) and connects 1 to 50 mailboxes (1 by default). A workspace can have at most 20 unexpired links at a time.
- **Shown once.** The link is shown once when it is created and only a hash of it is stored, so a lost link cannot be shown again; create a new one. The card lists open links with their label, uses and expiry, and Revoke deletes a link at once.
- **What the client sees.** Opening the link needs no account. The page shows the workspace name, the label, the agency branding when there is one, what connecting allows and a Connect Google or Connect Microsoft button for each configured provider. The page sends no referrer and is not indexed.
- **No provider change.** The link uses the same redirect URIs as above, so nothing changes in Google Cloud or Microsoft Entra.
- **Uses.** A use is taken when the provider grants access, just before the mailbox is stored. Reconnecting an address that is already in the workspace counts as a use. It replaces the credentials but never resumes a mailbox the workspace paused; only a member can do that.
- **Afterwards.** The mailbox appears on the Mailboxes page like any other connected mailbox, recorded as connected by the member who created the link, with the provider's display name as its sender name when that name passes the name check.

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

## A/B variants and campaign reports
- **Variants.** An email step's own subject and body are variant A. Add variants B to Z on the campaign page. Each enrollment gets one variant per step, split evenly and decided from the enrollment and the step, so a retry sends the same variant. Variants are plain text.
- **Follow-up subjects.** A follow-up from a Gmail or Microsoft mailbox replies in the first email's thread with the subject `Re: <first subject>`, so on any email step after the first, a variant's subject is used only by Resend senders. For Gmail and Microsoft senders, vary the body to test a follow-up; the campaign page says this next to those variants.
- **Editing.** Variants, like steps, can only be changed while the campaign is paused or not yet launched. Deleting a variant that already sent archives it, so its results keep their label.
- **Reports.** The Results card shows totals, then tables by step (with a row per variant) and by mailbox.
- **Reply attribution.** A thread's first reply is credited to the last campaign message sent to that contact at or before the reply. Only Google and Microsoft mailboxes report replies, so Resend senders show none.
- **Bounce attribution.** Bounces come from `delivery_events` matched to a sent message.
- **Opens.** Open counts remain an estimate, for the reasons in Open and click tracking.
## Conditions
- **What a condition checks.** Opened: a counted open or click on mail of this campaign to the contact. Clicked: a counted click on mail of this campaign. Replied: a human reply in a thread of this campaign and contact (auto replies and bounces do not count). Visited site: a stored page view of a visitor linked to the contact, optionally on one tracker and under a path prefix such as `/pricing`. Every condition only looks at what happened since the contact was enrolled.
- **Checked once.** A condition is checked when the contact reaches it and the answer is recorded for that contact and step, so a retry or a second tick always takes the same path. Nothing is sent at a condition step. Put a wait step before a condition so there is time to open, click, reply or visit.
- **Targets.** Yes and No each continue with the next step, end the sequence or go to a later step. Targets only move forward, so every contact sees each step at most once and every sequence ends. Saves, moves, deletes and launches that would send a condition backwards are refused. An End of path step ends the sequence (or jumps to a later step) for everyone who reaches it, which is how two paths are kept apart.
- **Timing.** The contact moves to its target on the next scheduler tick, up to a minute after the condition. A target that is missing or was deleted ends the sequence instead of sending.
- **Stop on reply.** Campaign settings have Stop on reply, on by default and on for every existing campaign. While it is on, a reply stops the sequence before a Replied condition is reached, so turn it off to branch on replies. Only Google and Microsoft senders see replies.
- **Website data.** Visited site only sees views the tracker's consent mode allowed and its retention still keeps, so it never sees more than the Website page does.
- **Results.** The campaign page shows Yes and No counts on each condition.
- **Existing campaigns.** A campaign without conditions runs exactly as before.
- **Rollback.** After a rollback to the previous release, campaigns with conditions wait and send nothing until the upgrade returns; campaigns without conditions keep sending. Do not edit condition steps on the previous release.
## Pre-launch review and test sends
- **Review.** Open Review on a campaign (`/app/campaigns/<id>/review`). It lists the email step count, active enrollments, and each sender with its status and health band, flagging no sender, a disconnected or paused mailbox, and a throttled or paused band. For each email step and variant it lists enrolled contacts with no value for a merge field that has no fallback (up to 20, with the total), and it lists enrolled contacts who are unsubscribed or suppressed.
- **It does not block launch.** Launch checks only for an email step, a sender and conditions that move forward. When its turn comes, an enrollment with a blank merge field fails and an unsubscribed or suppressed one is skipped, as before.
- **Test sends.** Each email step has Send test. It renders the step or chosen variant against the same sample contact as the preview and sends it from the mailbox you pick, only to your own sign-in address, with the subject starting `[Test]`.
- **What a test is not.** A test has no open or click tracking, is not stored as a campaign message and does not count in the results. Its unsubscribe links point at a placeholder that changes nothing. Tests are not counted in `INSTANCE_DAILY_SEND_CAP`, but tests from a Resend sender do count toward Resend's own daily quota. Two identical clicks within the same minute send once through Resend; changing the mailbox, subject or body sends again.
## AI (bring your own key)
- **Off by default.** A workspace has AI off until an owner or admin turns it on in Settings, AI (`/app/settings/ai`). Members see the status, the key source and today's call count, but cannot change them.
- **One adapter.** Demail calls `POST <base URL>/chat/completions` in the OpenAI format, so OpenAI, OpenRouter, Groq, Ollama or any other OpenAI-compatible provider works. There is no extra npm dependency.
- **Which key is used.** A workspace key, when one is stored, with the workspace base URL (default `https://api.openai.com/v1`) and model (default `AI_MODEL`, then `gpt-4o-mini`). Otherwise, in a client workspace whose agency shares its key, the agency key with the agency base URL and model (see Shared limits for agencies). Otherwise the instance key `AI_API_KEY` with `AI_BASE_URL` and `AI_MODEL`; the workspace base URL and model are then ignored, so the operator decides where the instance key goes. With neither, AI is unavailable.
- **Workspace keys.** A pasted key is sealed with AES-256-GCM under a key derived from `MAILBOX_ENCRYPTION_KEY` (HKDF, separate from mailbox tokens) and stored in a table only the service role can read. Storing one needs `MAILBOX_ENCRYPTION_KEY`. Rotation follows Rotating the mailbox encryption key below; if that key is lost, paste the AI key again. Only the last four characters are ever shown, and keys never appear in logs, errors or pages.
- **The instance key.** `AI_API_KEY` is shared by every workspace on the instance that turns AI on, bounded by `AI_INSTANCE_DAILY_CALL_CAP` calls per UTC day. Leave it unset on a public instance and let each workspace bring its own key.
- **Daily limits.** Each workspace has a daily call limit (default 100, 1 to 5000) per UTC day across every key. In an agency or a client workspace the agency's monthly limits apply as well. A call is reserved before the request is sent, so failed calls count too. Your provider may charge for every call.
- **Base URL rules.** A workspace base URL must be public `https://`, with no user name or password, not `localhost` or a `.local`, `.internal`, `.localhost` or `.lan` host, and must not be or resolve to a loopback, private, link-local, CGNAT, unique-local or multicast address, including an IPv6 form that embeds one (IPv4-mapped, NAT64 or 6to4). Redirects are refused and each call times out after 25 seconds. A local model is only reachable through the operator's `AI_BASE_URL`.
- **Limit of the address check.** The host is looked up just before each call, and the request then resolves the name again. A host whose DNS answer changes between the two lookups is not caught, so only owners and admins can set a workspace base URL; on an instance with sensitive internal services, block outbound traffic to them at the network level.
- **What the provider sees.** Whatever a feature sends: your brief when drafting a step, and reply text when drafting a reply or classifying one. Check your provider's data terms before turning AI on.
- **Nothing is sent by AI.** Anything AI writes is a draft a member reviews. It only goes out when a member clicks send. There is no auto-send.
- **AI drafts.** On a campaign page, Write with AI turns a short brief, a tone and a position (first email or follow-up) into a step draft. Each draft is one AI call. You edit it and click Add as email step; like any step change this needs the campaign paused, and launching stays manual. On a unibox thread, Draft reply with AI fills the reply box with a draft built from the last eight messages and an optional note. A thread has one open draft at a time, and a new one replaces it. The draft is sent only when you click Send reply, which sends exactly what is in the box and records who approved it and when. Drafts are kept with their status (draft, used, sent or discarded). AI output can be wrong or invent details, so read every draft before you use it.
### Reply classification
- **Opt-in per workspace.** An owner or admin turns on Classify incoming replies with AI in Settings, AI, on top of AI itself. It is off by default because it calls the provider without a click.
- **What is classified.** Only replies (direction in, kind reply) that arrive after it is turned on and within the last 3 days. Turning it on never sends older mail to the provider. Auto replies and bounces keep the existing rule-based handling and are never sent to the provider.
- **Cost.** One AI call per reply, counted in the workspace daily limit. When the limit is reached, the remaining replies wait until the next UTC day without losing a retry; a failed call is retried up to 3 times.
- **Intents.** Interested (wants to hear more), Wants a meeting (asks for or accepts a call or meeting), Question (asks something before deciding), Not interested (declines), Asked to stop (asks not to be contacted), Out of office (an absence notice the rules missed), Referral (points to another person) and Other. Each verdict comes with a one-line summary.
- **Where it shows.** The unibox list shows the latest intent of each thread as a chip and can be filtered by intent; a thread shows the intent and the summary under each classified reply.
- **No action is taken.** A verdict never stops an enrollment, suppresses a contact or answers anyone. Stop on reply and unsubscribes work exactly as before. A verdict can be wrong, so read the reply before you act on it.
- **Scheduling.** The `demail-ai` job (`POST /api/cron/ai`, every minute) classifies up to 10 replies per run within a 45 second budget.
## HubSpot sync
- **Connect.** In HubSpot, open Settings, Integrations, Private apps and create a private app with the scopes `crm.objects.contacts.read` and `crm.objects.contacts.write`; this works on free HubSpot. An owner or admin pastes its access token in Settings, CRM (`/app/settings/crm`). The token is checked against HubSpot, sealed under a key derived from `MAILBOX_ENCRYPTION_KEY` (so storing one needs that variable) and kept in a table only the service role can read. Only its last four characters are shown, and it never appears in logs, errors or pages.
- **Pull.** Contacts changed in HubSpot since the last sync are read, oldest change first, up to 500 per run. A new email address creates a Demail contact, optionally with a label you choose. An existing contact only gets its empty fields filled (first name, last name, company, phone); a value already in Demail is never overwritten. Contacts without a valid email address are skipped.
- **Opt-outs.** A HubSpot contact unsubscribed from email unsubscribes the Demail contact. Nothing ever subscribes a contact again; resubscribing stays a manual choice here.
- **Push.** Every reply that arrives after you connect becomes a note on the HubSpot contact with the subject, sender, campaign and up to 2000 characters of the reply. If the contact is not in HubSpot yet it is created there first. If a linked HubSpot contact was deleted, the link is dropped and the contact is found or created again by email. A reply HubSpot still refuses (for example an address it rejects) is skipped, the sync moves on, and Settings, CRM lists it until a retry adds it to HubSpot or an owner or admin dismisses it. Retry runs with the push, so it is offered only while the connection is enabled and Push replies is on; with push off nothing is written to HubSpot and the skipped replies wait. Rate limits, network errors and token problems retry the whole sync instead. Earlier replies are not pushed. Reply text therefore leaves Demail and is stored in HubSpot.
- **Scheduling.** The `demail-crm` job (`POST /api/cron/crm`, every 5 minutes) syncs up to 5 workspaces per run within a 45 second budget. A workspace with more to read is due again after 1 minute, otherwise after 15 minutes; errors back off from 2 minutes up to an hour. Sync now on the settings page runs a sync at once, at most once a minute counted from the last attempt, whether it succeeded or failed. A pull position is saved as soon as the contacts are read, so a failed push does not lose it.
- **Duplicates.** The push position is saved after each note, so a crash between creating a note and saving can add that one note twice.
- **Same-millisecond limit.** The pull position is HubSpot's last modified time in milliseconds. If more than 500 contacts share one exact millisecond, the sync steps past it and some of them are not read until they change again.
- **Disconnect.** Disconnect removes the token and every link between Demail and HubSpot contacts. Your Demail contacts and the notes in HubSpot stay. Connecting a token for a different HubSpot account clears the old links and pulls again from the start.
## Hosted forms
- **Building.** Members create forms under Forms (`/app/forms`). Each field maps to a contact field (email, first name, last name, company, phone), to a custom field, or only keeps the answer. A form can add a label to every contact it brings in, carries a title, intro, consent text, accent color, a card or plain layout, a theme, focus mode and an optional redirect after submit, and goes live when you publish it. Unpublishing closes it at once.
- **Sharing and embedding.** A published form has a link, `<NEXT_PUBLIC_APP_URL>/f/<slug>`, with a random slug, and an iframe snippet that loads the same page with `?embed=1` (no page padding). Search engines are asked not to index form pages.
- **What a submission does.** It finds the contact by email in the form's own workspace, or creates it there. Blank fields are filled and existing values are never overwritten, custom fields are merged the same way, an unsubscribed contact is never subscribed again, the form's label is added and the answers are stored as a submission.
- **Enrollment.** Off by default. When a member picks a campaign, each new submission is enrolled in it if the campaign is not completed and the contact is subscribed and not suppressed. Addresses are not verified, so anyone can enroll an address they do not own and that address receives campaign mail. It counts toward mailbox limits and your Resend quota.
- **Pages and focus mode.** Tick "Starts a new page" on a field to begin a new page there (ignored on the first field); visitors move with Next and Back and see "Step x of n". Focus mode shows one question per screen. Both need JavaScript in the visitor's browser, as Turnstile does, and every answer is still sent in one submission and checked on the server. A form with one page and focus mode off renders exactly as before.
- **Themes.** Light (the default and the earlier look), dark and soft. The accent color stays per form and inputs keep the white field style in every theme.
- **Redirect after submit.** Optional, set by members: a full `https://` address on a public domain, without a user name or password, up to 500 characters. It is checked when saved, by the database, and again before use, and it is read only from the form, never from the request. After a successful submission the visitor goes there instead of seeing the success message. A tripped honeypot looks the same. Embedded forms show the success message with a Continue link that opens the address in the top window, because many sites refuse to be framed.
- **Spam protection.** Every form has a hidden honeypot field (a filled one shows success and writes nothing) and a signed fill-time token that is valid from 3 seconds to 24 hours after the page was shown. Cloudflare Turnstile (free plan) is added when `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are both set; when Cloudflare cannot be reached the submission is refused.
- **Limits.** Each form accepts 5 submissions per hour per IP address (an IPv6 /64 counts as one address), and refused attempts count too. Each form also has a daily limit, 200 by default. The per-IP limit is only as good as the address it reads, and a visitor can send any header they like, so the address must come from a header your proxy writes. `TRUSTED_PROXY_HOPS` picks it:
  - Unset (the default): `X-Real-IP`. Vercel sets it for every request. On a self-host, use a proxy that overwrites it (nginx `proxy_set_header X-Real-IP $remote_addr;`). Running `next start` with no proxy, or behind a proxy that passes the header through, lets a sender pick their own address and rotate past the limit; only the daily limit then holds.
  - `1` (or more): the last (or Nth from last) `X-Forwarded-For` entry, which is what the one (or N) proxies in front of the app wrote: nginx with `$proxy_add_x_forwarded_for` appends to it and Caddy replaces it, and `1` fits both. Entries a visitor sent come before it and are ignored.
  - `0`: no header is trusted and all visitors of a form share one bucket.
  - When the chosen header is missing, all visitors share one bucket as well.
- **Untrusted input.** Names refuse links, web and email addresses and hostnames, company names refuse markup and links, control, bidi and zero-width characters are removed, and lengths are capped. Text answers mapped to a custom field become merge fields in campaign mail, so they refuse links, web and email addresses, hostnames, tags and merge braces; dropdown answers are the form's own options and are kept as they are; an email answer mapped to a custom field is kept in the submission only, not in the contact's custom fields. Everything a visitor types is shown as plain text, in the dashboard and in the submissions list.
- **Data.** No IP address is stored. A rate bucket holds a keyed hash of the form, the address prefix and the day, and buckets older than a day are deleted by the form's next submission. Deleting a contact deletes its submissions.
## Website tracking
- **Adding the snippet.** Owners and admins create up to 5 trackers per workspace under Website (`/app/website`); members see them read-only. A tracker lists 1 to 10 domains, and a page on a listed domain or any subdomain of it counts. Paste the two-line snippet the page shows into every page of your site. It loads `<NEXT_PUBLIC_APP_URL>/w.js` with the tracker's public key and consent mode. Single-page apps call `demail('page')` after each navigation; otherwise each page load sends one view.
- **Consent.** Ask first (the default) records nothing and stores nothing in the browser until your site calls `demail('consent', true)`, typically from its cookie banner after the visitor agrees, and the endpoint refuses views of an ask-first tracker that do not carry that consent. Record on load counts visits straight away, for sites that already have a legal basis. In both modes `demail('consent', false)` opts the visitor out and removes the stored visitor id. A browser that sends Global Privacy Control (`navigator.globalPrivacyControl`, `Sec-GPC: 1`) is never recorded in either mode. Nothing here is a legal opinion; decide with your own adviser which mode your site needs.
- **What is stored.** A random visitor id kept in the site's own `localStorage` (no cookie), the page host (taken from the request `Origin`, never from the body), the path without query string or fragment (at most 300 characters) and the referrer host. No IP address, no user agent, no page title. Bots, empty user agents and signed-in members of this Demail instance (the `demail_reader` cookie) are not recorded.
- **Limits.** 120 requests per hour per IP address per tracker (an IPv6 /64 counts as one), through a keyed hash of tracker, address prefix and day, so no IP address is stored; refused requests for a known tracker (no consent, another host, invalid fields, disabled) count too. Then the tracker's daily limit applies (1000 page views by default, up to 50000). The address comes from the same header as hosted forms (`TRUSTED_PROXY_HOPS`). The collect endpoint `POST /api/w/v` answers 204 to everything it accepts or drops, so it reveals nothing about keys or domains.
- **Linking visits to contacts.** When a counted email click (not a bot, prefetch, privacy proxy, your own read or a click within seconds of sending) leads to a domain of an enabled tracker of the same workspace with "Link email clicks to visitors" on, the link gets a signed `dm` parameter valid for 1 hour. The snippet removes it from the address bar and sends it with the first view after consent, and the visitor is linked to that email's contact; earlier anonymous visits of the same browser then show on the contact too. The latest link wins. A forwarded email links whoever opens it to the original contact.
- **Where visits show.** The Website page lists views in the last 7 days per tracker and the last 50 visits of the workspace; a contact's activity lists their visits as `Visited <host><path>`. Paths and hosts come from strangers, so they are checked when written and shown as plain text.
- **Your site's Content Security Policy** must allow the script from your Demail address (`script-src`) and the endpoint (`connect-src`).
- **Retention and erasure.** Each tracker keeps visits for 1 to 365 days (90 by default). The daily purge deletes older views, visitors not seen within that window and rate buckets older than a day. Deleting a contact deletes its linked visitors and their views; deleting a tracker deletes all of its visitors and views.
## Agencies
- **Turning a workspace into an agency.** An owner opens Agency (`/app/agency`) and turns the workspace into an agency. A client workspace cannot become an agency, so there is one level only. Agency mode can be turned off again once no client workspaces are left.
- **Client workspaces.** Owners and admins of an agency create a workspace for each client from the agency page. A client workspace has the same features and data isolation as any other workspace. A workspace joins an agency when the agency creates it or when an owner of an existing workspace accepts an invitation from the agency.
- **Inviting an existing workspace.** Owners and admins of an agency create an invitation link on the agency page and can revoke it there. Each link works once and expires after 7 days, an agency can have at most 20 open at a time, and only a hash of the link is stored. A signed-in direct owner of a workspace that is neither an agency nor a client opens the link, picks that workspace and accepts. Every member of the agency then opens it with their agency role, including owners and admins, the agency's branding applies there and its own members keep their access. Leaving works as for any client workspace.
- **Staff access.** Every member of the agency can open every client workspace with the role they have in the agency: owners stay owners, admins stay admins, members stay members. The database decides this, so it applies to every page, Server Action and live update the same way.
- **Viewing a client's workspace.** The workspace switcher lists your own workspaces first, then the clients of each agency you belong to. Picking a client, or pressing Open on the agency page, shows that workspace as its team sees it. The agency page also lists contacts, active campaigns, mail sent in the last 7 days and unread threads per client.
- **Client owners and leaving.** A client can have its own members, invited from its Members page, which notes that agency staff can open it too. An owner of the client workspace can leave the agency from its Agency page, and an agency owner can release a client. Both need the client to have at least one owner of its own, so no workspace is left without an owner. Afterwards agency staff no longer reach it and its own members keep everything.
- **Names across workspaces.** Agency names are shown to client members, client names to agency staff and brand names to every client member. The database refuses workspace and brand names with control, invisible or bidi characters, tags, `@`, `://` or `www.` whenever a name is set or changed, whichever path writes it, and the dashboard also refuses hostnames. Names from another workspace are cleaned again when shown, and one that fails the name check shows a neutral label instead ("Client workspace", "your agency", or Demail for a brand).
- **Rollback.** Going back to the previous release keeps agency staff's database access to client rows, but its switcher lists only direct memberships until you upgrade again. No data is lost.
## White-label
- **Who sets it.** Owners and admins of an agency workspace open Branding (`/app/settings/branding`, linked from the agency page). Other members see the settings read-only. Client workspaces use their agency's branding and cannot set their own.
- **What it changes.** In the dashboard of the agency and of every client workspace: the sidebar name and logo instead of Demail, a 3 pixel accent border on the sidebar header, the browser tab title and icon, the support, privacy and terms links at the bottom of the sidebar, and the Powered by Demail line, which you can hide. Hosted forms of these workspaces show the logo above the form, the privacy and terms links below it and the Powered by line unless hidden; each form keeps its own accent color. The unsubscribe page of contacts in these workspaces shows the logo, the privacy and terms links and the accent color on its button, and the tab title and icon follow the brand.
- **Logo.** The logo is an https address, not an upload. Every viewer's browser loads it from that host (with no referrer), so pick a host you trust that stays online. Links must be full https addresses, and the brand name passes the same check as other names.
- **Not changed yet.** Sender names stay as they are; branded sender names are still open. The sign-in page shows the brand on a custom portal domain (see below).
## Custom portal domain
- **What it changes.** An agency can serve sign-in on a hostname of its own, such as `portal.youragency.com`, one hostname per agency. On that hostname the sign-in and sign-up pages show the agency logo, "Sign in to <brand>" and "Create your <brand> account", the accent color on the button, the privacy and terms links and the Powered by line unless hidden, and the tab title and icon follow the brand. `/` goes straight to the sign-in page, and the dashboard works there too with each workspace's usual branding. Anyone may sign in there; which workspaces a user can open does not change. Without a branding row the pages look as on the main address.
- **Agency steps.** An owner or admin of the agency opens Branding (`/app/settings/branding`), adds the hostname under Custom domain and publishes the TXT record it shows: name `_demail.<hostname>`, value `demail-verify=<token>`. Check now looks the record up (at most once a minute per domain) and marks the domain verified. Other members see the card read-only. To change the hostname, remove it and add the new one, which issues a new token. A hostname is unique only among verified domains, so an unverified claim never blocks the real owner, and a second agency cannot verify a hostname another one already verified.
- **Keep the TXT record.** The hourly `demail-domains` job rechecks every verified portal domain once a day (up to 20 per run) and turns the domain off when the record is gone (the name has no TXT answer or does not exist), and so does Check now. A lookup that times out or fails keeps the domain as it is and is tried again on the next recheck.
- **Operator steps on Vercel and Supabase.** No Vercel or DNS API is called and no token is needed, so this stays on the free tiers. For each hostname, whoever runs the instance: 1. adds the hostname to the Vercel project under Project Settings, Domains; Vercel shows the DNS record the agency publishes (usually a CNAME) and issues the certificate; 2. adds `https://<hostname>/auth/callback` to Supabase Auth, URL Configuration, Redirect URLs, so sign-up confirmation links return to that hostname. The Branding page lists both steps so the agency can pass them on.
- **What the redirect URL trusts.** Supabase Auth sends sign-in, sign-up and password recovery links to any listed redirect URL on request, for any user of the instance, so whoever controls the hostname's DNS can receive those links. Add a portal hostname only for an agency you trust with that, and remove it from Supabase Auth Redirect URLs and from the hosting project when the agency removes the domain, when it stops verifying, or when the agency leaves. Demail never edits these lists itself. Check your Vercel plan for how many domains a project may have.
- **Self-host.** The reverse proxy in front of the app must pass the original `Host` header and serve a certificate for the hostname, and the Supabase Auth redirect URL is added the same way.
- **What keeps the main address.** Links in mail (tracking, unsubscribe), invitation and agency invitation links, client connect links, hosted form links and the website snippet use `NEXT_PUBLIC_APP_URL`. Connecting a Google or Microsoft mailbox from a portal hostname leads back to the Mailboxes page with a note to connect from the main address, because the providers return only to their registered redirect URIs. Supabase Auth emails keep their own template and sender.
- **Sessions are per host.** Signing in on the portal hostname does not sign you in on the main address, or the other way around. A sign-up confirmation and the auth callback return to the hostname the user signed up on. The `demail_reader` cookie that keeps your own opens and clicks from counting is per host as well, and tracking links use the main address, so staff who work only on the portal hostname should sign in on the main address once a month in the browser they read mail in. Until they do, their own opens and clicks of client mail count, and a counted click on a tracked site can link their browser to that contact.
- **Host trust.** The hostname is read from the `Host` header and used only when it matches a verified domain of an agency workspace. Any other host, or a failed lookup, gets the main address and no brand, so a forged header can neither brand an unverified host nor send a confirmation link to one.
## Shared limits for agencies
- **Who sets them.** Owners and admins of an agency set them in the Shared limits card on the agency page, and a cap per client in its row of the client list. Client members see their caps, this month's usage and whether a pool is used up on their own Agency page. Every limit is unset by default, which means no limit.
- **Monthly window.** Usage is counted per UTC calendar month and starts again on the first of the month.
- **Send pool and caps.** The monthly send pool counts campaign mail sent by the agency and its current client workspaces; a client's monthly send cap counts that client's campaign mail. Warmup, unibox replies and test sends are not counted and never held. When the pool or a cap is used up, enrollments of that workspace wait and are retried every hour.
- **Sharing the agency AI key.** Off by default, because the agency's AI provider bills every call made with it. When an owner or admin turns it on, a client workspace with no key of its own uses the agency key, with the agency base URL and model. The client still needs AI turned on, the agency needs AI turned on and a stored key, and the client's daily limit still applies.
- **AI pool and caps.** The monthly AI pool counts the agency's own calls with its workspace key and its clients' calls with the agency key. A client's monthly AI cap counts that client's calls with the agency key. A client's own key and the instance key are not counted against the agency.
- **Overshoot.** The send tick reads the remaining pool once per workspace per tick and counts down in memory, so two overlapping ticks can send at most one batch more than the limit.
## Deliverability
Bands and checks are guidance based on your own sending. Nothing here guarantees inbox placement or improves a sender reputation.
- **Window and rates.** Each mailbox is scored over the last 7 days. Bounce and complaint rates divide by the larger of messages sent and 20, so a new mailbox with a few bounces still trips. `refresh_mailbox_health()` runs every 5 minutes from `schedule.sql`.
| Band | Bounce rate | Complaint rate | Effect on cold sending |
|---|---|---|---|
| Healthy | below 2% | below 0.1% | none |
| Watch | 2% or more, or SPF or DMARC missing or failing on the mailbox domain | 0.1% or more | none, flagged on the dashboard |
| Throttled | 5% or more | 0.3% or more | daily limit halved (at least 1), minimum gap doubled |
| Paused | 8% or more | 0.5% or more | no cold sends, retried every 15 minutes |
- **Stepping.** A worse band applies at once. A better one is reached one band at a time, and only after 24 hours in the current band. Follow-ups stay pinned to their mailbox and wait while it is paused.
- **Events.** Bounce notices read from Google and Microsoft mailboxes and Resend webhooks both write `delivery_events`, and the address is suppressed. Gmail and Microsoft do not report spam complaints, so complaints are only observable for Resend senders.
- **Resend webhook.** In the Resend dashboard add a webhook at `<NEXT_PUBLIC_APP_URL>/api/webhooks/resend` for `email.bounced` and `email.complained`, then set `RESEND_WEBHOOK_SECRET` to its signing secret. The Svix signature is verified and timestamps older than 5 minutes are rejected.
- **Domain checks.** `/app/deliverability` lists the domains of your mailboxes and any you add. `/api/cron/domains` rechecks each one every 24 hours, and Check now runs it at most once a minute per domain. SPF passes with a single record that ends in `~all` or `-all` and includes the provider (Google, Microsoft). DMARC needs a `v=DMARC1` record with a policy. The page shows the records to publish, merging the provider include into an existing SPF record.
- **DKIM caveat.** The DKIM selector is chosen by the provider and cannot be discovered from DNS. The check tries `google`, `selector1`, `selector2`, `resend` and the selector you set, and reports unknown when none answers.
## Warmup
Warmup sends ordinary conversations between the Google and Microsoft mailboxes of one workspace. Turn it on per mailbox on the Mailboxes page. It needs at least two active Google or Microsoft mailboxes with warmup on. Placement results describe what happened to the mail. Nothing here guarantees inbox placement or improves a sender reputation.
- **How it works.** `plan_warmup_jobs()` runs every 5 minutes from `schedule.sql` and plans the day's start jobs for each mailbox at random times inside its workday. `/api/cron/warmup` runs every minute, claims due jobs with `FOR UPDATE SKIP LOCKED` and executes them. A start job picks a partner among the other enabled mailboxes, avoiding the last 5 partners, and a hand-written conversation neither mailbox saw in the last 60 days, falling back to the least recently seen one. Mail goes out through the mailbox's own Gmail or Graph API as plain text with no tracking and no unsubscribe footer.
- **Ramp.** 10 messages a day on the first day, plus 1 a day, up to 40. About 60% of the day's volume starts threads and replies make up the rest. A throttled mailbox halves the target and holds the ramp, and a paused one sends nothing. If warmup was off for more than 7 days the ramp restarts.
- **Workday.** Monday to Friday, 09:00 to 17:30 in the mailbox timezone by default, skipping 12:00 to 13:00. At least 4 minutes pass between two warmup sends from one mailbox. Change the hours and timezone on the Mailboxes page.
- **Replies.** Minutes after each send a check job looks for the message in the recipient mailbox (up to 5 tries, 5 minutes apart) and records inbox, spam, other or missing. When it arrived the recipient replies with probability 0.7 (first reply) or 0.5 (later ones), 45 minutes to 5 hours later and inside its own workday. Threads have four turns.
- **Spam handling.** A Microsoft message found in junk is moved to the inbox. Gmail needs the `gmail.modify` scope, which Demail does not request, so Gmail only records placement. If 30% or more of at least 10 checked messages from a mailbox landed in spam over 7 days, its health band is at least Watch.
- **What is not sent.** Warmup mail never describes itself, carries no shared footer and no fixed subject prefix. Every message passes a wording check before sending. It is never sent to contacts and never to a mailbox of another workspace or a Resend sender.
- **Filter tag.** Off by default. When you turn it on for a mailbox, the warmup mail it receives ends with a random tag such as `dm-k3f9x2ab`, unique to that mailbox, so you can filter it. Turning it off keeps the tag for later. The Mailboxes page shows the Gmail filter (Has the words: the tag, Skip the Inbox, Never send to spam) and an Outlook rule hint. Nothing else carries the tag.
- **Provider limits.** Warmup volume counts toward Gmail and Microsoft sending limits in addition to the cold daily limit of the mailbox.
- **Library edits.** A conversation's key comes from its theme, subject and first message. An edited conversation keeps its old key in `previousKeys`, so threads in flight on it continue and the 60 day repeat window still holds.
- **Self-hosted limit.** An instance only warms between its own mailboxes in one workspace. A shared public pool is left for later.
## Design decisions

- **Directory name.** The rewrite lives in `demail-next/` next to the Go code, as its own pnpm project with its own lockfile.
- **Scheduling split.** Vercel Hobby cron runs at most once a day, so it cannot drive sending. Supabase `pg_cron` runs every minute and calls the app through `pg_net`. The URL and secret sit in Supabase Vault and are set by `schedule.sql`, never by a migration. `vercel.json` keeps a daily call as a fallback. Edge Functions and a queue extension are not used, because sending shares code with the app and a claimed queue table is enough.
- **Long-lived connections.** IMAP idle and pooled SMTP connections cannot run on Vercel or Supabase Edge Functions, so SMTP and IMAP mailboxes are not supported. Gmail and Microsoft Graph are plain HTTPS APIs and work from a serverless function.
- **Mailbox encryption.** OAuth tokens are sealed in the app with AES-256-GCM using `MAILBOX_ENCRYPTION_KEY` and stored in `mailbox_credentials`, a table with row level security, no policies and no grants for signed-in users, so only the service role reads it. Supabase Vault was not used: it needs one RPC per read and is awkward to dump and restore for self-hosts, while here a database dump alone is useless without the key. Resend-only installs need no key.
- **Polling over push.** Gmail watch needs a Pub/Sub topic and a renewal every 7 days, and Graph subscriptions need a public validated webhook renewed every 3 days. Both work against a free, easy install, so replies are polled. Push could be added later as an accelerator.
- **Cron split.** Work that needs the app (mail APIs, tokens) is an HTTP job: `demail-send`, `demail-sync`, `demail-warmup` and `demail-ai` every minute, `demail-crm` every 5 minutes and `demail-domains` hourly, each bounded to stay under the 60 second Vercel Hobby limit. Work that is only SQL (`demail-health` every 5 minutes, `demail-purge` daily) runs inside Postgres with no HTTP call. Vercel keeps its two daily fallback crons and no more. An existing install re-runs `supabase/setup/schedule.sql` to add `demail-ai` and `demail-crm`; without them, reply classification and scheduled HubSpot sync stay idle, while AI drafts and Sync now still work.
- **Realtime.** `threads` and `thread_messages` are in the `supabase_realtime` publication. The unibox subscribes and refreshes the page at most once a second. Row level security decides what each user receives.
- **Sender model.** One Resend key per instance. A mailbox row is a sender identity, not a credential store.
- **Forms spam protection.** Every hosted form has a honeypot and a signed fill-time token, optional Cloudflare Turnstile that fails closed, and per-address and daily limits enforced in `submit_form`, which takes the workspace from the form row and stores no IP address. Turnstile needs no new dependency and stays off until both keys are set.
- **Agency access.** Agency staff reach a client through the same `is_org_member` and `has_org_role` checks every policy already uses, with their agency role. A workspace joins an agency only when the agency creates it or its owner accepts an invitation through `accept_agency_attach`, and branding is read through `workspace_branding`, which answers only to those who can open the workspace.
- **Attach consent.** An existing workspace joins an agency only through `accept_agency_attach`, called by a direct owner of that workspace with a single-use invitation token. The organizations trigger allows the change only while that function marks the workspace, so no other path can attach one.
- **Shared limits.** Pools and caps are counted per UTC calendar month from `messages` and `ai_usage`, with caps keyed by the client and its current agency. Sharing the agency AI key is off by default because the agency's provider bills those calls; calls with it are recorded with source `agency`.
- **Connect links.** A link holder has no session, so the two OAuth callback paths are not forced through sign-in; the callback checks the session and role for member flows and the link from the sealed cookie for link flows. `consume_connect_link` takes one use atomically before the mailbox is stored, and the lookup and consume functions run only with the service role.
- **Portal domains.** A portal hostname is trusted only after its owner publishes a TXT record and the service role stores the result; members can insert only the workspace and hostname and cannot update a row. The app never calls a hosting or DNS API, so adding the hostname to the hosting project and to Supabase Auth Redirect URLs stays a manual operator step that costs nothing. An allowlisted redirect URL lets whoever controls that hostname receive Supabase Auth links for any user, so the operator adds it only for trusted agencies and removes it when the domain goes away.
- **Tenant isolation.** Every organization-owned table has `organization_id`, row level security and composite foreign keys, so a row cannot reference another workspace. Server Actions never take the workspace from form data. Agency staff reach client rows through `is_org_member` and `has_org_role`, which also accept a member of the client's agency, so no policy names agencies itself. Members can only rename a workspace; agency fields change only through security definer functions. Trigger functions run only as triggers and no signed-in or anonymous user can call them. The service role key is used only in `src/lib/supabase/admin.ts`.

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
- Warmup only runs between mailboxes of one workspace on this instance, and Gmail mail found in spam is not moved because that needs the `gmail.modify` scope.
- Supabase free projects pause after inactivity, which also pauses the scheduler.
- HubSpot is the only CRM, and sync is one way per data type: contacts come from HubSpot, replies go to HubSpot. Unsubscribes and sent mail are not pushed.
- Without `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`, hosted forms rely on the honeypot, the fill-time token and the rate limits, which slow automated spam but do not stop a determined sender.
- After a rollback to the release before agencies, agency staff keep database access to client rows, but the switcher lists only direct memberships and branding is not shown until you upgrade again.
- An agency send pool or client send cap can be overshot by at most one send batch when two scheduler ticks overlap.
- A custom portal domain needs the operator to add each hostname to the hosting project and to Supabase Auth Redirect URLs by hand. Sessions do not carry over between the portal hostname and the main address, Google and Microsoft mailboxes are connected from the main address only, and Supabase Auth emails are not branded.
- A condition is checked once, when the contact reaches it, and its targets only move forward, so a sequence cannot loop back or re-check a condition later.
- Migrations were checked against an in-memory Postgres, not a live Supabase project. The `schedule.sql` extensions run for the first time in your project.

## License

Apache-2.0, see the root `LICENSE`. Attribution is in the root [NOTICE](../NOTICE).
