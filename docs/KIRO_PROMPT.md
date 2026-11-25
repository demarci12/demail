# Kiro prompt: Demail, an open-source cold email platform on a Warmbly fork

Paste everything below the line into Kiro (spec mode) at the root of your fork of
https://github.com/warmbly/warmbly. Run it as **Phase 0 first**, then one spec per epic.
Kiro does best with small, focused specs, so do not ask it to build all epics in one spec.

---

## Role and goal

You are working in a fork of **Warmbly** (Apache-2.0, Go backend + React/Vite frontends,
Postgres, Redis, event bus, pull-based worker fleet). Warmbly is already a full cold email
and warmup platform. The goal is to make this fork the **most complete open-source,
self-hostable cold email platform**: match the feature set of Emailchaser, Instantly,
Smartlead, Saleshandy, QuickMail, Woodpecker, SmartReach.io and Salesforge, **without** depending
on any closed partner service for core features.

This is a gap-filling job, not a rewrite. Reuse existing packages, tables, handlers and UI
patterns wherever they exist. Never rebuild something the codebase already has.

## Non-negotiable ground rules

1. **Read `AGENTS.md` first and obey it.** It is the repo's constitution (about 1,150 lines). In particular:
   - Self-hosting is first-class: every feature must work with `make up` / the installer and
     **no cloud account** (no AWS, GCP, Stripe or Kafka required). A paid third-party service is
     only ever an *optional adapter*, never a hard dependency.
   - Workers never touch Postgres; they talk through the event bus. Keep the
     control-plane / execution-plane split.
   - Deployment and rollback compatibility: migrations are additive and backward-compatible,
     and old workers must keep working while new ones roll out.
   - Envelope encryption for every secret (API keys, OAuth tokens, SMTP passwords).
   - Access-control, audit-spine, org-scoped events, sending-safety and warmup-pool rules
     apply to every new feature.
   - Tests are opt-in per `AGENTS.md`; follow its verification section, not your defaults.
2. **Every outside provider sits behind a Go interface with a fake.** Copy the pattern of
   `internal/pkg/graphkit` (a real client plus an in-process `Fake` used by `make dev`,
   sandbox and QA). New adapters: one interface, one fake, then real adapters.
3. **Feature flags and safe defaults.** Anything that sends on a new channel (LinkedIn,
   SMS, WhatsApp, calls) or spends money (domains, mailboxes, lead credits) is **off by default**,
   needs an explicit admin toggle, and must pass a human approval gate before it first spends or sends.
4. **Compliance by design:** unsubscribe and opt-out on every channel, a global suppression list
   checked before every send on every channel, GDPR erasure that covers new tables, and
   per-channel rate limits. LinkedIn automation breaks LinkedIn's ToS, so ship it as an optional adapter
   with conservative limits and a clear warning in the UI.
5. **Rebrand.** Apache-2.0 does not grant trademark rights. Replace the "Warmbly" name and logo
   in user-facing UI, docs and installer with the product name **Demail** (CLI `demail`, operator CLI `demailctl`).
   Keep `LICENSE`, keep copyright notices, and add a `NOTICE` file crediting Warmbly.
6. Keep each spec small enough to merge alone (one epic = one spec = one PR series).

## Phase 0: audit and steering (do this before any feature spec)

1. Read `AGENTS.md`, `README.md`, `docs/`, `go.mod`, `web/package.json`, `Makefile`,
   `docker-compose.yml`, and skim `internal/` (`api/handler`, `app`, `tasks`, `jobs`,
   `repository`, `models`, `pkg`) plus `web/src`.
2. Create Kiro steering files:
   - `.kiro/steering/product.md`: what the product is, who it is for, the competitor list
     below, the non-goals.
   - `.kiro/steering/tech.md`: real stack and versions, how to run, lint, typecheck and test,
     and the `AGENTS.md` invariants above in short form.
   - `.kiro/steering/structure.md`: where handlers, services, repositories, migrations,
     workers, fakes and UI components live, and the naming conventions in use.
3. **Verify the feature inventory.** For every row in the matrix below marked ✅ or 🟡,
   find the code that implements it and write the file paths into
   `.kiro/steering/feature-inventory.md`. If something marked ✅ is actually missing or only
   partial, correct the matrix. Do not start any epic until this file exists.
   Ask me before you continue if the audit changes an epic's scope.

## Full feature list

`FEATURES.md` (next to this prompt; copy it to `.kiro/steering/features.md` in the fork) is the
complete Demail feature list with a status for each row: ✅ inherited, 🔓 open up
(GraphKit-only today), 🆕 build, and the epic each row belongs to. Treat it as the scope
source of truth; the matrix below is the short version.

## Competitor feature matrix (my research, Nov 2026; verify in Phase 0)

Legend: ✅ in Warmbly already · 🟡 partial, or only through a closed partner (GraphKit) · ❌ missing

| Area | Feature | Seen at | Warmbly |
|---|---|---|---|
| Sending | Unlimited mailboxes (Gmail/Workspace OAuth, Microsoft OAuth, SMTP/IMAP) | all | ✅ |
| Sending | Inbox (sender) rotation, per-mailbox caps and spacing | all | ✅ |
| Sending | ESP matching (Google→Google, Microsoft→Microsoft) | SmartReach, Instantly | 🟡 (verify it is used in sender selection) |
| Sending | Time-zone sending windows | all | ✅ |
| Sending | Holiday skipping per recipient country | SmartReach | 🟡 verify |
| Sending | Gradual mailbox ramp-up (e.g. 10/day week 1 up to a 30/day cap) | Emailchaser | 🟡 verify |
| Sequences | Multi-step email + wait + AI steps, A/B/Z variants, spintax | all | ✅ |
| Sequences | Auto-promote the winning variant | Emailchaser | 🟡 verify (`pg_step_ab.go`) |
| Sequences | Conditional branches (opened/clicked/replied/visited) | SmartReach, Salesforge | ✅ (`switch_step`) |
| Sequences | **Subsequences triggered by reply intent** | Smartlead, Saleshandy | ❌ (only in importers) |
| Sequences | Stop on reply / on booked meeting | all | ✅ |
| Channels | LinkedIn steps (connect, message, InMail, voice note, profile visit) | QuickMail, Woodpecker, Saleshandy, SmartReach, Salesforge | 🟡 GraphKit only |
| Channels | **Call steps + dialer** (click-to-call, recording, transcript, sentiment, retry list) | Smartlead, SmartReach, Saleshandy | ❌ |
| Channels | **WhatsApp / SMS steps** | Saleshandy, SmartReach | 🟡/❌ verify |
| Channels | **Manual task steps** (custom task, reminder, snooze) | Saleshandy, SmartReach | ❌ verify |
| Inbox | Unified inbox (unibox), tags, forward, compose | all | ✅ |
| Inbox | AI reply classification (interested, OOO, not interested, …) | Smartlead, SmartReach, Salesforge | ✅ verify depth |
| Inbox | AI reply drafts, optional auto-send | Emailchaser, Instantly, Smartlead | ✅ (`ai_reply`, `ai_inbox_agent`) |
| Inbox | LinkedIn + email in one inbox thread | QuickMail, SmartReach, Salesforge | 🟡 depends on LinkedIn |
| Deliverability | Warmup pool (free + premium tiers) | all | ✅ |
| Deliverability | Inbox placement tests | Instantly, Saleshandy | ✅ |
| Deliverability | SPF/DKIM/DMARC checks + generator | all | ✅ checks · ❌ public generator |
| Deliverability | **Blacklist (DNSBL) monitoring with auto-pause** | Smartlead, SmartReach, QuickMail | 🟡 verify |
| Deliverability | Bounce/complaint auto-pause, suppression, global block list | all | ✅ |
| Deliverability | Custom tracking domain | all | ✅ |
| Deliverability | Spam-word / content checker before send | Saleshandy, Emailchaser | ✅ (`content_lint`, `humanlint`) |
| Infra | **Buy domains + auto DNS (SPF/DKIM/DMARC/forwarding)** | Emailchaser, Saleshandy, QuickMail, Woodpecker, Instantly | 🟡 GraphKit only |
| Infra | **Buy/provision mailboxes (DFY)** | Emailchaser, Smartlead, Instantly | 🟡 GraphKit + vendor import |
| Leads | Lead finder / B2B search | all except QuickMail | ✅ (`leadfinder`, Apollo, Clay) |
| Leads | **Waterfall enrichment (try several email/phone providers in order)** | Instantly, SmartReach | ❌ verify |
| Leads | **Consensus verification (2–3 verifiers must agree)** | Emailchaser (2x), Smartlead (3x) | 🟡 single verifier per request; many providers exist |
| Leads | LinkedIn Sales Navigator import | Emailchaser | 🟡 GraphKit only |
| Leads | Intent/buying signals, website visitor identification | Instantly, Saleshandy, Smartlead | 🟡 website tracking exists, verify identification |
| AI | **Autopilot: website → ICP → audience → sequence → approval → buy infra → run** | Emailchaser, Salesforge (Agent Frank), Instantly (AI SDR) | 🟡 parts exist (`ai_agent`, `ai_research`, `advisor`), not the end-to-end flow |
| AI | Bring your own LLM key, several providers | Instantly | ✅ verify (`ai_connections`) |
| AI | MCP server + CLI + skills | Emailchaser, Smartlead, Salesforge, Woodpecker | ✅ |
| CRM | Contacts, pipelines, deals, tasks, meetings | Smartlead, Saleshandy, Instantly | ✅ |
| CRM | Two-way sync HubSpot / Salesforce / Pipedrive / Zoho | SmartReach, QuickMail | ✅ HubSpot, Salesforce, Pipedrive · ❌ Zoho |
| Analytics | Campaign, step, variant and mailbox analytics | all | ✅ |
| Analytics | **Team leaderboard, per-rep activity across channels** | SmartReach | ❌ |
| Agency | Client workspaces, white-label portal, roles, client reports | Smartlead, Saleshandy, SmartReach, Salesforge | ✅ |
| Migration | Importers for Instantly, Smartlead, lemlist, Saleshandy, QuickMail, Woodpecker, Reply, Snov, Mailshake | Emailchaser ("switch from Instantly") | ✅ |
| Integrations | Zapier, Make, webhooks, REST API, Slack | all | ✅ · ❌ n8n node in this repo (exists upstream as a separate repo) |
| Growth | **Free public tools: email verifier, SPF/DMARC generator, spam-word checker, subject-line and follow-up generators, blacklist check** | Emailchaser, Smartlead | ❌ |
| i18n | **UI localization (i18n framework + first extra locale)** | — (our edge) | ❌ no i18n library in `web/` |

## Epics: one Kiro spec each, in this order

For each epic: write `requirements.md` (EARS: *WHEN … THE SYSTEM SHALL …*), `design.md`
(data model + migrations, API routes, events, worker changes, UI screens, adapter
interfaces + fakes, failure modes, security/abuse review against `AGENTS.md`), and
`tasks.md` (small, ordered, each task names the files it touches). Stop after each spec's
documents and wait for my approval before writing code.

### E1. Open infrastructure adapters (removes the GraphKit lock-in)
- `DomainRegistrar` interface: search, quote, buy, renew, set nameservers. Adapters:
  Porkbun, Namecheap, Cloudflare Registrar (where its API allows), plus "bring your own domain".
- `DNSProvider` interface: Cloudflare, Route 53, Porkbun DNS, plus a manual mode that shows the
  records and polls until they resolve. Auto-create SPF, DKIM, DMARC, MX, tracking CNAME,
  and forwarding of the root domain to the main website.
- `MailboxProvisioner` interface: Google Workspace (Admin SDK, via the user's own
  Workspace), Microsoft 365 (Graph, the user's own tenant), and the existing vendor-import path.
- Keep GraphKit as just one more adapter. Approval gate and cost preview before every purchase.

### E2. Sending safety upgrades
- ESP matching in sender selection (prefer a sender on the same provider as the recipient's MX; reuse `contact_mail_host`).
- Mailbox ramp schedule per mailbox (configurable curve, default 10/day in week 1 up to a 30/day cap).
- Holiday calendar per recipient country (bundled open dataset, no API).
- DNSBL monitoring job (Spamhaus DBL/ZEN, SURBL, Barracuda, …) for sending domains and
  tracking domains, with auto-pause and an Advisor finding.

### E3. Sequence engine: subsequences, task steps, more channels
- Subsequences: WHEN a reply is classified as intent X (or a meeting is booked, or a link is clicked),
  move the lead into subsequence Y. Configurable per campaign. Respect the existing stop rules.
- New step types: `manual_task`, `call`, `sms`, `whatsapp`, `linkedin_*`, each with a
  `ChannelProvider` interface + fake. Adapters: Twilio and Telnyx (SMS/voice),
  WhatsApp Cloud API (template messages only), LinkedIn via an optional adapter
  (e.g. Unipile-style API) or the existing GraphKit adapter.
- Tasks queue UI: due today, snooze, complete, reminders; calls open a browser softphone
  (WebRTC via the chosen voice provider), with recording + transcript + AI summary + sentiment.
- Every channel goes through the same suppression and opt-out checks before sending.

### E4. Lead data: waterfall enrichment + consensus verification
- `EnrichmentProvider` interface; waterfall order set by the admin (e.g. Prospeo → LeadMagic →
  Findymail → Hunter → Apollo). Stop at the first verified hit. Cache results and track cost per provider.
- Consensus verification: run N configured verifiers (MillionVerifier, ZeroBounce,
  Bouncer, …, already wired), store each verdict as evidence, and mark an address
  `valid` only when the quorum (default 2) agrees. Catch-all handling and a risk score.
- Sales Navigator / LinkedIn list import through the LinkedIn adapter from E3.

### E5. Autopilot (end-to-end AI SDR with human approval)
Build on the existing `ai_agent`, `ai_research`, `advisor`, `leadfinder`.
1. Read the user's website → propose an ICP (titles, industries, sizes, locations). The user edits or accepts.
2. Size the audience at no cost (counts only).
3. Draft a multi-step sequence + variants from the website and ICP. Saved as a draft.
4. **Approval screen:** audience, copy, infra to buy, estimated monthly cost. Nothing is
   revealed, bought or sent before a human clicks Approve (an MCP caller may approve only when the org opts in).
5. Buy domain + mailboxes through E1, then put them on the ramp from E2 and into the warmup pool.
6. Run unattended: top up leads, promote winning variants, draft replies
   (auto-send only when it is explicitly turned on). Weekly report into Slack/email.
Expose every Autopilot action over the existing MCP server and API.

### E6. Analytics + CRM gaps
- Team leaderboard and per-rep activity across email, calls, LinkedIn and tasks.
- Zoho CRM two-way sync, using the existing CRM provider abstraction.
- Cross-channel timeline on the contact card.

### E7. Free public tools (growth)
Public, rate-limited, no-login pages served by the existing `site/`: email verifier
(1 address, captcha-free but abuse-limited), SPF/DMARC generator, DNS/blacklist checker,
spam-word checker, AI subject-line and follow-up generators. Each page has a CTA to sign up.
Reuse the internal services; no new external calls without a cache.

### E8. Internationalization
- Add an i18n framework to `web/`, `portal/` and `site/` (i18next or similar). Extract strings
  screen by screen, starting with onboarding, campaigns and the inbox.
- Ship `en` + `hu` (Hungarian) first. Make AI-written copy and reply classification respect
  the campaign language (the reply classifier already has `languages.go`).

## Non-goals (for now)
- Our own shared IP pools / "SISR"-style server sharding: we send through the mailbox's own
  provider, as Warmbly does.
- Our own B2B contact database: we integrate providers instead.
- Dynamic images, video and personalized landing pages (lemlist-style), unless they are cheap after E3.

## Definition of done for every epic
- Works on a fresh `make up` with only fakes enabled (no outside accounts).
- Migrations are additive and reversible, and old workers stay compatible.
- New secrets are sealed with the existing envelope encryption.
- Suppression, opt-out, audit events and org scoping are covered.
- The admin can turn the feature off; it is off by default when it spends money or adds a channel.
- Docs page added under `docs/`, and `.kiro/steering/feature-inventory.md` updated.
- Lint and typecheck pass per `AGENTS.md` (`make fmt`, `make lint`, `pnpm typecheck`, `pnpm lint`).

Start with **Phase 0** now. Report the corrected matrix and the steering files, then stop.
