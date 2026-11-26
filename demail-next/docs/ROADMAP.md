# Roadmap

Phase 1 is shipped in this directory: auth, workspaces, contacts, mailboxes, campaigns with email and wait steps, Resend sending, suppression and unsubscribe. Later phases, in order, with what each one needs.

## Phase 2: richer campaigns
Part 1 shipped:
- A/B variants with per-variant results.
- Campaign analytics per step and per mailbox.
- Test send of a saved step.
- A pre-launch review of blank merge fields and unsubscribed leads.
Still open:
- Branching steps on opened, clicked and replied. These need a step graph instead of positions.
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
Next: Phase 5 part 3.

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
Next: Phase 5 part 3.
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
Still open:
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
