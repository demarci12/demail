# Roadmap

Phase 1 is shipped in this directory: auth, workspaces, contacts, mailboxes, campaigns with email and wait steps, Resend sending, suppression and unsubscribe. Later phases, in order, with what each one needs.

## Phase 2: richer campaigns
Part 1 shipped:
- A/B variants with per-variant results.
- Campaign analytics per step and per mailbox.
- Test send of a saved step.
- A pre-launch review of blank merge fields and unsubscribed leads.
Shipped later:
- Branching steps on opened, clicked and replied shipped in Phase 5 part 5.
Still open:
- Subsequences.
- Attachments, which need Storage, size limits under the Vercel body limit and MIME parts for three providers.
- Promoting a winning variant automatically.

## Phase 3: more mailboxes and replies
Shipped:
- Google and Microsoft OAuth mailboxes with sealed tokens, threaded follow-ups and per-mailbox caps.
- Reply sync by polling, a unibox with live updates, reply and compose, and stop on reply.
- Bounce notices read from connected mailboxes feed the suppression list.
Still open:
- SMTP/IMAP mailboxes, which need a long-lived connection that Vercel and Supabase Edge Functions cannot hold, so they would need an optional external poller.
- Provider push (Gmail Pub/Sub, Graph change notifications) as an accelerator over polling.
Next: Phase 5 part 6.

## Phase 4: deliverability
Part 1 shipped:
- Open and click tracking with bot and privacy-proxy filtering.
- Deliverability: bounce and complaint events, health bands that throttle or pause cold sending, SPF, DKIM and DMARC checks.
- Warmup between your own Google and Microsoft mailboxes, with a ramp, human-delay replies and placement checks.
Still open:
- Blacklist (DNSBL) monitoring with auto-pause.
- Custom tracking domain.
- Mailbox ramp-up schedule for cold sending.
- Gmail rescue from spam, which needs the `gmail.modify` scope.
- A public warmup pool across instances.
- An AI content bank next to the hand-written library.
Next: Phase 5 part 6.
## Phase 5: data, AI and channels

- AI writing, reply drafts and classification (bring your own key).
- Email verification and waterfall enrichment through provider adapters.
- Lead finder, CRM sync, forms and website tracking.
- LinkedIn and other channels through adapters, agencies and white-label.
- Hungarian and English localization.

Part 1 shipped:
- An OpenAI-compatible AI adapter with workspace keys sealed under a derived key and an optional instance key.
- AI off by default, with daily call limits per workspace and for the instance key.
- AI step drafts and AI reply drafts that are only sent on a member's click.
- Opt-in reply classification with intents and summaries in the unibox.
- HubSpot sync with contact pull and reply notes.
Decisions:
- **AI provider.** One `POST <base>/chat/completions` adapter in the OpenAI format with a base URL and a model, using fetch and no new dependency.
- **Key derivation and domains.** `sealFor`/`openFor` derive a key from `MAILBOX_ENCRYPTION_KEY` with HKDF-SHA256 (info `demail:<domain>:v1`), AES-256-GCM with the domain as AAD, domains `ai-key` and `crm-token`, and the previous key is tried on open so rotation covers them.
- **Key resolution.** A workspace key uses the workspace base URL and model; otherwise `AI_API_KEY` uses `AI_BASE_URL` and `AI_MODEL` and ignores the workspace values; with neither, AI is unavailable.
- **Off by default and limits.** AI and reply classification are separate opt-ins for owners and admins, each workspace has a daily call limit (default 100), instance-key calls are capped by `AI_INSTANCE_DAILY_CALL_CAP`, and a call is reserved in SQL before it is made.
- **Base URL rule.** A workspace base URL must be public https and must not resolve to a private, loopback, link-local, CGNAT, unique-local or multicast address; redirects are refused; a local model only goes through the operator's `AI_BASE_URL`.
- **Drafts approval.** AI drafts are service-written rows that a member edits; a draft is sent only by a member clicking send, which records who approved it and when, and no auto-send exists.
- **Classification queue and window.** `claim_reply_classifications` queues new replies of opted-in workspaces from the moment classification is turned on and at most 3 days back, retries 3 times, parks rows at the daily limit, and never acts on a verdict.
- **HubSpot token.** A private app token with the contacts read and write scopes, pasted by an owner or admin and sealed under `crm-token` in a service-only table; no OAuth app and no new env var.
- **Pull and push rules.** Pull pages by last modified time (100 per page, 5 pages per run), creates new contacts, only fills blank fields and only ever unsubscribes; push turns each reply after connect into a note, creating the HubSpot contact when needed, and saves its position after each note. A reply HubSpot refuses with 400, 404 or 422 is skipped after one retry by email, and the pull position is saved before push runs. Skipped replies are kept in crm_push_skips until retried or dismissed.
- **Scheduling jobs.** `demail-ai` runs every minute and `demail-crm` every 5 minutes from `supabase/setup/schedule.sql`, each within a 45 second budget; Vercel keeps its two daily crons.
Part 2 shipped:
- Hosted lead-capture forms with an iframe embed, spam protection and rate limits.
- Agencies with client workspaces.
- White-label for agencies.
- HubSpot replies refused during push are kept until retried or dismissed.
Part 2 decisions:
- **Skipped replies.** Each refused reply gets a `crm_push_skips` row keyed by message, removed when a retry pushes it, when the message, its contact or the connection is gone, or when an owner or admin dismisses it; Retry makes the connection due and the next run retries up to 25, and `last_error` holds only real errors.
- **Form writes.** All writes go through the service-only `submit_form`, which takes the organization from the form row; label and campaign references are composite foreign keys, and the route passes only the form id from the slug lookup.
- **Contact rules.** A submission finds or creates the contact by email, fills blank fields only, merges custom fields without overwriting, never resubscribes, adds the form label and stores the answers; erasing a contact erases its submissions.
- **Slugs.** A random 16 character slug from a database default, so nobody can squat a vanity path.
- **Spam checks.** A honeypot and an HMAC fill-time token (key derived from `UNSUBSCRIBE_SECRET` with the label `demail:forms:v1`, valid from 3 seconds to 24 hours), plus optional Cloudflare Turnstile when both keys are set, failing closed; a tripped honeypot shows success and writes nothing.
- **Limits.** 5 submissions per hour per IP address (an IPv6 /64 counts as one) and a per-form daily limit (default 200, 1 to 10000), enforced in `submit_form` through `form_rate_buckets` keyed by an HMAC of form, address prefix and UTC day, so no IP address is stored; old buckets are pruned by `submit_form`.
- **Enrollment off by default.** A form enrolls into a campaign only when a member picks one, the campaign is not completed and the contact is subscribed and not suppressed; addresses are not verified, so the UI and README warn that enrollment sends campaign mail.
- **Untrusted input.** `src/lib/input.ts` strips control, bidi and zero-width characters, names refuse links, addresses and hostnames, company names refuse markup and links, client and brand names pass the name check, everything renders as React text, and the embed uses a fixed iframe title; there is no custom redirect after submit.
- **Agency access model.** `is_org_member` and `has_org_role` also accept members of the client's agency, whose role applies unchanged, so every policy, RPC and Realtime check gains agency access with no policy edits; `my_workspaces()` feeds the switcher and the effective role.
- **Attach rule.** A workspace joins an agency only when the agency creates it; a trigger refuses nested agencies, a change of agency and turning agency mode off while clients exist, and release or leave needs a direct client owner.
- **Column grant.** Members may update only `organizations.name`, so `agency_id` and `is_agency` change only through security definer functions.
- **Branding scope.** Branding belongs to agency workspaces and applies to the agency and its clients in the dashboard (sidebar name, logo, accent border, tab title and icon, links, Powered by) and on their hosted forms; sign-in, unsubscribe, custom domains and sender names are unchanged.
- **Logo by URL.** A logo is an https URL rendered with `referrerPolicy="no-referrer"`, so no Storage bucket is needed; viewers' browsers load it from its host.
- **Rollout window.** All schema changes are additive except the two redefined helpers and the column grant; the previous release works on the new schema, and after a rollback agency staff keep database access to client rows while the old switcher lists only direct memberships. New env vars are optional and the schedulers are unchanged.
Part 3 plan:
- Multi-page forms, more themes, focus mode, a redirect after submit, file fields, submission notifications and double opt-in.
- Website tracking snippet, consent modes, visitor to contact matching and the "visited site" condition.
- A custom portal domain, a branded sign-in page and a branded unsubscribe page.
- Client connect links, so clients connect mailboxes without an account.
- A shared monthly send pool and a shared AI balance with per-client caps.
- Attaching an existing workspace to an agency, with that workspace owner's consent.
Part 3 shipped:
- Attaching an existing workspace to an agency with its owner's consent.
- A shared monthly send pool and a shared AI balance with per-client caps.
- A branded unsubscribe page.
- Client connect links, so clients connect Google or Microsoft mailboxes without an account.
Part 3 decisions:
- **Scope split.** Part 3 ships the four items that finish the agency story, because they share one access model (`is_org_member`/`has_org_role`, `organizations.agency_id`, `getPublicBranding`); the remaining items move to Part 4 plan.
- **Attach consent.** An agency owner or admin creates an invitation link (single use, valid 7 days, at most 20 open per agency, only its sha256 stored). A signed-in direct owner of a workspace that is neither an agency nor a client opens `/agency-invite/<token>`, picks the workspace and accepts. `accept_agency_attach` is the only path: `guard_agency_fields` allows `agency_id` to go from null to an agency only while the transaction-local setting `demail.attach_org` equals that workspace id, which only that function sets. Moving from one agency to another is still refused; leaving still uses `detach_client_workspace`.
- **Send pool.** Per UTC calendar month. The agency pool counts campaign mail (`messages.status = 'sent'`) of the agency and its current client workspaces; a per-client cap counts that client's campaign mail. Unset means no limit, which is the default. The send tick reads the state once per workspace per tick (`send_pool_state`) and counts down in memory; a held enrollment is deferred 60 minutes. Two overlapping ticks can overshoot by at most one batch. Warmup, unibox replies and test sends are neither counted nor held.
- **AI balance.** An agency may share its own AI key with its clients (`agency_pools.share_ai_key`, off by default because the agency's provider bills those calls). Calls with it are recorded with `ai_usage.source = 'agency'` on the client. The agency monthly AI pool counts the agency's own workspace-key calls plus its clients' agency-key calls; a per-client monthly AI cap counts that client's agency-key calls. A client's own key and the instance key are not counted against the agency. A client still needs AI turned on and its daily limit still applies; the shared key needs the agency's AI turned on and a stored agency key. Key order in `resolveAi`: workspace key, agency key, instance key. Advisory lock order in `reserve_ai_call`: workspace, agency, instance.
- **Caps keyed by agency.** `agency_client_caps` has primary key `(organization_id, agency_id)`, so caps left behind by a former agency never block or apply under a new one.
- **Branded unsubscribe.** For a contact in an agency or client workspace the unsubscribe page shows the agency logo, its privacy and terms links and the accent color on the button, and the tab title and icon follow the brand. No Powered by line is added and the wording is unchanged. An invalid link shows no branding.
- **Connect links.** Owners and admins (agency staff included, through `has_org_role`) create a link with a label, a lifetime of 1 to 30 days (default 7) and 1 to 50 mailboxes (default 1); at most 20 unexpired links per workspace. The token (64 hex) is shown once, only its sha256 is stored, and revoking deletes the row. `/connect/<token>` shows the cleaned workspace name, the label and the agency branding, with Connect Google and Connect Microsoft for configured providers. OAuth reuses the registered redirect URIs `/app/mailboxes/connect/<provider>/callback`; the middleware no longer forces sign-in on those two callback paths, and the sealed OAuth cookie carries the link id and token. A use is consumed atomically (`consume_connect_link`) before the mailbox is stored, reconnecting an address already in the workspace counts as a use and keeps a paused mailbox paused, the mailbox's `created_by` is the link creator, and the provider display name is cleaned with `displayName` (falling back to empty). The page sends no referrer.
- **Rollout window.** All schema changes are additive except the redefined `guard_agency_fields` and `reserve_ai_call` (same signatures) and the widened `ai_usage` source check; one new partial index on `messages` (a short write lock while it builds). The previous release works on the new schema: it never sets `demail.attach_org`, never writes source `agency`, and ignores the new tables. Migrations are not reverted on a rollback, so the redefined `reserve_ai_call` stays in place: the agency monthly AI pool still applies to the agency's own workspace-key calls, and the previous release reports a refusal there as the daily AI limit. Attached workspaces stay attached, the send pool and per-client caps stop applying because the old code never calls `send_pool_state` or writes source `agency`, clients stop using the agency key, and connect links stop working until the upgrade returns. No data is lost. Migrations are applied before the new app deploys; new code on the old schema holds campaign enrollments and fails agency-key AI calls until they run.
Part 4 plan:
- Multi-page forms, more themes, focus mode, a redirect after submit, file fields, submission notifications and double opt-in.
- Website tracking snippet, consent modes, visitor to contact matching and the "visited site" condition (that condition also needs branching steps, still open in Phase 2).
- A custom portal domain and a branded sign-in page, which need per-host Supabase Auth redirect URLs and Vercel domain setup.
Part 4 shipped:
- Website tracking: a snippet with ask-first and record-on-load consent modes (Global Privacy Control honored), a public collect endpoint that stores no IP address, bounded retention, visitor to contact matching through tracked email clicks, a Website page and visits on the contact timeline.
- A custom portal domain for agencies, proven by a DNS TXT record and rechecked daily, with branded sign-in and sign-up pages on that hostname.
Part 4 decisions:
- **Scope split.** Part 4 ships website tracking and the custom portal domain with a branded sign-in page, which share nothing in the schema and are what the consent, public-endpoint and untrusted-text rules are written against; the forms extras and the visited-site condition become Part 5 plan and both "Next:" lines say "Next: Phase 5 part 5."
- **Trackers.** Owners and admins (agency staff included, through `has_org_role`) create site trackers on a Website page (`/app/website`), at most 5 per workspace (checked in the Server Action). A tracker has a name, 1 to 10 domains (a page on a listed domain or any subdomain of it counts), a consent mode, a retention of 1 to 365 days (default 90), a daily limit of 1 to 50000 page views (default 1000, sized for the 500 MB free database), "link email clicks to visitors" (default on), enabled (default on) and a random 24 hex public key that goes into the snippet. Members see trackers read-only.
- **Consent modes.** `ask` (the default): the snippet records nothing and stores nothing until the site calls `demail('consent', true)`, and the collect endpoint refuses views of an `ask` tracker that do not carry the explicit consent flag. `record`: the snippet records on load, for sites that already have a legal basis; `demail('consent', false)` opts a visitor out in both modes and removes the stored visitor id. A browser that sends Global Privacy Control (`navigator.globalPrivacyControl` in the snippet, `Sec-GPC: 1` at the endpoint) is never recorded in either mode.
- **What is stored.** A random visitor id kept in the site's own `localStorage` (no cookie), the page host (taken from the request `Origin`, never from the body), the path (no query string or fragment, at most 300 characters), and the referrer host only. No IP address, no user agent, no page title. Bots and empty user agents (the existing `BOT_AGENTS` list), and signed-in members carrying the existing `demail_reader` cookie, are dropped before anything is written.
- **Collect endpoint.** `POST /api/w/v`, a `text/plain` JSON body of at most 4 KB sent with `navigator.sendBeacon`, so there is no CORS preflight. It always answers 204 (405 for GET, 411 and 413 for a missing or too large body), so it is no oracle for keys or domains. All writes go through the service-only `record_site_view`, which takes the organization from the tracker row and checks the host against the tracker's domains in SQL.
- **Limits.** 120 views per hour per IP address per tracker (an IPv6 /64 counts as one), through `site_rate_buckets` keyed by an HMAC of tracker key, address prefix and UTC day under a key derived from `UNSUBSCRIBE_SECRET` with the label `demail:website:v1`, so no IP address is stored; plus the tracker's daily limit. Every request for a known tracker key with a well-formed bucket counts toward the hourly limit before any other check, so refused views (disabled, invalid, another host, no consent) are limited too. The address comes from `clientIp` (`TRUSTED_PROXY_HOPS`), the same rule as hosted forms.
- **Visitor matching.** When a counted email click (not a bot, prefetch, privacy proxy, own read or too early) redirects to a host listed by an enabled tracker of the message's workspace with link email clicks on, the click route appends `dm=<message id>.<issued ms>.<hmac>` to the destination. The snippet reads it, strips it from the address bar with `history.replaceState`, and sends it with the first view only after consent. The endpoint accepts it for 1 hour; `record_site_view` links the visitor to the message's contact only when the message is sent and belongs to the tracker's workspace. The latest match wins. Earlier anonymous views of that visitor then show on the contact. A forwarded link identifies whoever opens it as the contact; the README says so.
- **Retention and erasure.** `purge_old_events()` (daily `demail-purge`) deletes views older than their tracker's retention, visitors not seen within it, and rate buckets older than a day. Deleting a contact deletes its linked visitors and their views; deleting a tracker deletes its visitors and views.
- **Untrusted text.** Paths and hosts come from strangers and are shown to members: validated at write (`cleanPath`, host regex in the route and `CHECK` constraints in SQL) and cleaned again at render with `cleanText`, rendered as React text. Tracker names are cleaned with `cleanText`.
- **Portal domain.** One hostname per agency in `portal_domains` (owners and admins add and remove it on the Branding page; agency only, enforced by the existing `guard_branding_agency` trigger). It must be a public hostname (lowercase, at least two labels, a letter-led top-level label, not `localhost` or a `.local`, `.internal`, `.localhost` or `.lan` name) and not the app's own host. Members insert only `organization_id` and `hostname` (column grant) and have no update; changing the hostname means remove and add, which issues a new token.
- **Verification.** The app shows a TXT record `_demail.<hostname>` with the value `demail-verify=<32 hex token>`. Check now (owners and admins, at most once a minute per domain) looks it up and writes `verified_at` and `last_checked_at` with the service role after the role check. A check that finds no TXT answer (`ENODATA` or `ENOTFOUND`) turns a verified domain off; a timeout or other resolver error keeps the current state and only updates `last_checked_at`, and Check now says the lookup failed. The hourly `demail-domains` job rechecks verified portal domains every 24 hours (up to 20 per run). A hostname is unique only among verified domains (partial unique index), so an unverified claim never blocks the real owner.
- **What the domain changes.** On a verified portal host of an agency workspace, the sign-in and sign-up pages show the agency logo, "Sign in to <brand>" and "Create your <brand> account", the accent color on the button, the privacy and terms links and the Powered by line unless hidden, and the tab title and icon. `/` redirects to `/login`. The sign-up confirmation link and the auth callback return to the portal host, so the session stays on that host. The dashboard works on that host and keeps its per-workspace branding. Anyone may sign in there; workspace access is unchanged. Without a branding row the pages look as on the main address.
- **What it does not change.** Links in mail (tracking, unsubscribe), invitation, agency invitation, connect and form links keep `NEXT_PUBLIC_APP_URL`. Connecting Google or Microsoft from a portal host redirects to the Mailboxes page with a message to connect from the main address, because the providers return only to the registered redirect URIs. Supabase Auth emails keep their own template and sender.
- **Host trust.** The portal host is read from the `Host` header and used only after it matches a verified row of an agency workspace; any other host (or a lookup error) gives the main address and no brand, so a forged header can neither brand an unverified host nor redirect anywhere unverified. A self-host proxy must pass the original `Host`.
- **Free tier and operator steps.** No Vercel or DNS API is called and no token is needed: the operator adds the hostname to the hosting project (Vercel: Project Settings, Domains, which shows the record to publish and issues the certificate) and adds `https://<hostname>/auth/callback` to Supabase Auth Redirect URLs. The Branding page lists these steps for the agency to pass on. Supabase Auth sends sign-in and recovery links for any user to an allowlisted URL on request, so README, the Branding card and the remove message tell the operator to add a hostname only for a trusted agency and to remove it, with the hosting domain, when the portal domain is removed, stops verifying or the agency leaves.
- **Own reads on a portal host.** The `demail_reader` cookie is per host and tracking links use the main address, so README tells portal-only staff to sign in on the main address once a month in the browser they read mail in; the cookie is not shared across hosts.
- **Rollout window.** All schema changes are additive except the redefined `purge_old_events()` (same signature and grants). The previous release works on the new schema: it never calls `record_site_view`, never reads `portal_domains`, and its click route does not append `dm`. After a rollback the snippet's views are refused with 404 by the old app (nothing is stored), clicks stop linking visitors, portal hosts show the default sign-in page, and collected visits and domains stay. New code on the old schema fails soft: the endpoint answers 204 and stores nothing, the click route skips matching, portal lookups give no brand, and the Website page and the domain card show a load error until the migrations run. No data is lost either way. Migrations are applied before the new app deploys.
Part 4 upgrade order: apply `20260101003100_website_tracking.sql`, then `20260101003200_portal_domains.sql`, then deploy the app; `supabase/setup/schedule.sql` needs no re-run (README, Upgrading).
Part 5 plan:
- Multi-page forms, more themes, focus mode, a redirect after submit, file fields, submission notifications and double opt-in.
- The "visited site" condition, which needs branching steps (still open in Phase 2); the visit data it will read ships in Part 4.
Part 5 shipped:
- Condition steps in campaigns: opened, clicked, replied and visited site, with an end of path step, forward-only targets and decisions kept per contact.
- Hosted form extras: page breaks, focus mode, light, dark and soft themes and a redirect after submit.
Part 5 decisions:
- **Scope split.** Part 5 ships condition steps in campaigns (closing the Phase 2 branching item and delivering the visited site condition) and the forms extras that need no mail and no storage: multi-page forms, focus mode, three themes and an optional redirect after submit. File fields, submission notifications and double opt-in move to Part 6 plan, because they need Storage with public uploads from strangers, or send mail from the instance to addresses typed by strangers and need a sender, quota and abuse design of their own. Subsequences and automatic winner promotion stay open in Phase 2.
- **Step model.** A condition is a step row (`campaign_steps.type = 'branch'`), so positions still order the sequence. Its columns are `branch_condition` (`opened`, `clicked`, `replied`, `visited_site`, `always`), `branch_tracker_id` (visited site only, null means any tracker of the workspace), `branch_path` (visited site only, a path prefix such as `/pricing`), `yes_action` and `no_action` (`next`, `end`, `step`) and `yes_step_id` and `no_step_id`. End of path in the UI is `always` with `yes_action = 'end'` (or a later step when edited); its `no_action` is stored as `end` and never used.
- **Forward only.** A `step` target must be a step of the same campaign (composite foreign key `(yes_step_id, campaign_id)`) with a higher position, so every enrollment visits each step at most once, the per-position idempotency key of email steps stays unique, and every sequence ends. Server Actions refuse saves, moves, deletes and launches that break this (`graphProblems`). At run time a target that is missing, deleted (the foreign key sets it null) or not later ends the enrollment as completed; it never sends.
- **When and how a condition is checked.** When the enrollment reaches the step (claimed like any step, no send window, nothing sent), once. The service-only `decide_branch` computes the answer, stores it in `campaign_branch_results` keyed by enrollment and step, and returns the stored answer on any retry, so a crash or a second tick gives the same path. Only data since the enrollment was created counts. Opened: a counted open or click (a click counts as an open) on mail of this campaign to this contact. Clicked: a counted click on mail of this campaign to this contact. Replied: a human reply (`thread_messages.direction = 'in'`, `kind = 'reply'`, auto replies and bounces excluded) in a thread of this campaign and contact, by `thread_messages.created_at`. Visited site: a stored page view of a visitor linked to this contact, optionally of one tracker and with a path starting with the prefix; only views the tracker's consent mode allowed exist and views past its retention are already purged, so the condition never sees more than the Website page does. Always: true.
- **The run after a condition.** The enrollment moves to the target with `next_send_at = now()` and is handled on the next tick (up to a minute later); `end`, or `next` with no later step, completes it. A decide error defers it 15 minutes. From a target the sequence continues by position as before.
- **Stop on reply toggle.** Campaign settings gain Stop on reply (default on; every existing campaign keeps `true`). The UI says the replied condition is only reached when it is off.
- **Existing linear campaigns.** No branch rows means the engine runs the same code path as before; the only change for them is the claim function name, whose body is unchanged.
- **Rollback safety through the claim.** `claim_due_enrollments(batch)`, which the previous release calls, is redefined with the same signature and grants to skip campaigns that contain a branch step; the new `claim_send_batch(batch)` has the old body and is what the new release calls. On a rollback the old release cannot misread a branch step as a blank email: enrollments of campaigns with conditions wait, nothing is sent, and they continue after the upgrade returns. New code on the old schema falls back to `claim_due_enrollments` when `claim_send_batch` is missing (PostgREST `PGRST202`).
- **Enum in the same migration.** `alter type public.step_type add value 'branch'` cannot be followed by a use of `'branch'::step_type` in the same transaction ("unsafe use of new value"), so every SQL in migration 003300 compares `type::text = 'branch'`.
- **Branch results.** `campaign_branch_results` is org-owned, RLS on, members select, written only by `decide_branch`; it cascades with the enrollment, step, campaign and contact, so contact erasure removes it. The campaign page shows Yes and No counts per condition.
- **Page breaks.** A field property `page_break: true` ("Starts a new page"), ignored on the first field and kept by `parseFields`; the previous release's `parseFields` drops unknown keys, so old code renders one page.
- **Focus mode.** `forms.focus_mode` (default off): every field is its own screen with a progress line. Multi-page forms and focus mode use a small client component that keeps every page in the document and posts all answers in one submission; a form with one page and focus off renders exactly as before, with no client component. Both need JavaScript in the visitor's browser, which Turnstile already needs.
- **Themes.** `forms.theme` is `light` (default, the earlier look), `dark` or `soft`; the accent color stays per form and inputs keep the white field style in every theme.
- **Redirect after submit.** `forms.redirect_url`, optional, set by members: only an `https://` address on a public hostname with no user name or password, at most 500 characters, normalized with `new URL().href` and checked by a database `CHECK` too. It is read from the form row only, never from the request, and checked again before use. A successful submission (and a tripped honeypot, which must look the same) answers 303 to it; an embedded form shows the success message with a Continue link (`target="_top"`, `rel="noopener noreferrer"`) instead, because the target site may refuse framing. This replaces the Part 2 decision that there is no custom redirect after submit.
- **Fail soft.** Public form loaders and the submit route select `*`, so the new code works before migration 003400 runs (light theme, one page, no redirect); saving form settings fails with the existing "Could not save the form." until it runs. Before migration 003300 the engine falls back to `claim_due_enrollments` and condition steps cannot be added.
- **Rollout window.** All changes are additive except the redefined `claim_due_enrollments` (same signature and grants) and the replaced `campaign_steps` check (widened). The previous release works on the new schema: it never writes branch steps or the new form columns. After a rollback, campaigns with conditions wait without sending, linear campaigns send as before, forms show one light page with the success message, and the old form editor drops page breaks when it saves fields; collected results stay. Migrations are applied before the new app deploys.
Part 5 upgrade order: apply `20260101003300_campaign_branches.sql`, then `20260101003400_form_display.sql`, then deploy the app; `supabase/setup/schedule.sql` needs no re-run (README, Upgrading).
Part 6 plan:
- File fields on hosted forms, which need Storage and limits for uploads from strangers.
- Submission notifications and double opt-in, which send mail to addresses typed into a form and need a sender, quota and abuse rules.
Still open:
- Branded sender names for agency and client workspaces.
- Optional per-workspace auto-send of AI replies, off by default.
- Acting on a reply intent (stop, suppress, follow up) and a manual intent override.
- AI variables at send time, AI sequence generation and AI skills.
- Salesforce, Pipedrive and Zoho sync.
- A HubSpot OAuth app.
- Pushing unsubscribes and sent mail to HubSpot.
- Email verification and waterfall enrichment.
- Lead finder.
- LinkedIn and other channels.
- Hungarian and English localization.
