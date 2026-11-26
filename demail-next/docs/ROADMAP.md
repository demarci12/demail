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
Next: Phase 5 part 2.

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
Next: Phase 5 part 2.
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
- **Pull and push rules.** Pull pages by last modified time (100 per page, 5 pages per run), creates new contacts, only fills blank fields and only ever unsubscribes; push turns each reply after connect into a note, creating the HubSpot contact when needed, and saves its position after each note. A reply HubSpot refuses with 400, 404 or 422 is skipped after one retry by email, and the pull position is saved before push runs.
- **Scheduling jobs.** `demail-ai` runs every minute and `demail-crm` every 5 minutes from `supabase/setup/schedule.sql`, each within a 45 second budget; Vercel keeps its two daily crons.
Part 2 plan:
- Hosted lead-capture forms.
- Then agencies with client workspaces, and white-label.
Still open:
- Optional per-workspace auto-send of AI replies, off by default.
- Acting on a reply intent (stop, suppress, follow up) and a manual intent override.
- AI variables at send time, AI sequence generation and AI skills.
- Salesforce, Pipedrive and Zoho sync.
- A HubSpot OAuth app.
- Pushing unsubscribes and sent mail to HubSpot.
- Email verification and waterfall enrichment.
- Lead finder and website tracking.
- LinkedIn and other channels.
- Hungarian and English localization.
