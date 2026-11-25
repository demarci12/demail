# Demail: complete feature list

**Demail** is an open-source, self-hostable cold outreach platform: email + LinkedIn +
social + calls, with warmup, deliverability, lead finding, CRM and AI agents in one app.
It is a fork of Warmbly (Apache-2.0) extended with every major feature of Emailchaser,
Instantly, Smartlead, Saleshandy, QuickMail, Woodpecker, SmartReach.io and Salesforge.

**Status legend**
- ✅ **Inherited**: already in the Warmbly codebase; rebrand and keep.
- 🔓 **Open up**: exists, but only through GraphKit (a closed partner API). Demail adds open, swappable adapters.
- 🆕 **Build**: missing; taken from competitors. The Kiro epic is in brackets, e.g. `[E3]`.

Everything that spends money or adds a sending channel is **off by default** and needs an
admin toggle plus human approval. Every outside service is an optional adapter, so Demail
runs with no cloud account.

---

## 1. Mailboxes and sending accounts

| Feature | Status |
|---|---|
| Unlimited mailboxes on every plan | ✅ |
| Google / Google Workspace (OAuth) | ✅ |
| Microsoft 365 / Outlook (OAuth) | ✅ |
| Any SMTP + IMAP provider (Zoho, Yahoo, Fastmail, custom) | ✅ |
| Push sync for mailboxes (instant reply detection) | ✅ |
| Bulk mailbox import (CSV) | ✅ |
| Mailbox vendor import (connect a vendor API key, pull in its mailboxes) | ✅ |
| Whole-domain connect | ✅ |
| Mailbox tags (use a tag as a sender group) | ✅ |
| Per-mailbox daily cold cap (default 50/day, warning above 100, hard max 5,000) | ✅ |
| Minimum gap between sends per mailbox (default 600 s) | ✅ |
| **Human workday per mailbox**: randomized hours, volume, lunch break, spacing, in its own timezone | ✅ |
| Shared reply inbox (replies routed to one mailbox) | ✅ |
| Mailbox lock / rest / disconnect states, with leads moved off a "gone" mailbox | ✅ |
| Seed mailboxes for placement tests (never warm, never send campaigns) | ✅ |
| Profile photo + signature per sender | ✅ |
| **Mailbox ramp-up schedule for cold sending** (e.g. 10/day week 1 → cap) | 🆕 `[E2]` (warmup has a ramp; cold sending needs its own) |
| **ESP matching**: send from Google to Google and Microsoft to Microsoft | 🆕 `[E2]` (the recipient's mail host is already detected) |

## 2. Domains and infrastructure

| Feature | Status |
|---|---|
| Sending domains list with SPF / DKIM / DMARC status | ✅ |
| Custom tracking domain (one CNAME per domain, e.g. `link.domain.com`) | ✅ |
| Root-domain redirect to your main website | ✅ |
| Bulk domain setup (tracking host + redirect for many domains at once) | ✅ |
| Advisor gives the exact DNS records to paste (SPF include filled in, DMARC at `p=none`) | ✅ |
| Failing authentication pauses sending on that domain | ✅ |
| Buy domains in the app | 🔓 `[E1]`: open adapters for Porkbun, Namecheap, Cloudflare + bring your own domain |
| Automatic DNS (SPF, DKIM, DMARC, MX, tracking CNAME, forwarding) | 🔓 `[E1]`: Cloudflare, Route 53, Porkbun DNS + manual mode with polling |
| Buy Google Workspace / Microsoft 365 mailboxes (address patterns, up to 5 senders, photos, signatures) | 🔓 `[E1]`: provision in your own Workspace / M365 tenant through Admin SDK / Graph |
| Done-for-you order flow: cost preview → approval → setup → auto-connect → warmup on | 🔓 `[E1]` |
| **Blacklist (DNSBL) monitoring for sending + tracking domains, with auto-pause** | 🆕 `[E2]` (Spamhaus, SURBL, Barracuda, …) |
| Public SPF / DMARC generator and DNS checker | 🆕 `[E7]` |

## 3. Warmup

| Feature | Status |
|---|---|
| Built-in warmup on every mailbox | ✅ |
| **Warmup pools**: free + premium tiers, isolated; premium never receives unsolicited free-tier mail | ✅ |
| Pool members are real, monitored mailboxes, not throwaway accounts | ✅ |
| Partner selection balanced across providers (Google, Microsoft, Yahoo, others get equal new-thread share) | ✅ |
| Per-recipient-host spam placement tracking (7-day window) steers partner choice | ✅ |
| Routing rules (weight a pairing up or down; weight 0 excludes it) | ✅ |
| Recent-partner avoidance (no repetitive pairings) | ✅ |
| Reciprocity balancing: mailboxes owed mail get more inbound; daily inbound caps per inbox | ✅ |
| Unreachable-recipient detection (mail handed off but never arrived → dropped from the draw) | ✅ |
| Bounced warmup addresses removed from the draw | ✅ |
| **AI-generated, human-like warmup content** (work, life and craft libraries, conversational threads) | ✅ |
| Your own campaign copy can be mixed into warmup | ✅ |
| **Replies in warmup threads** (target reply rate; replies 45 min–5 h later inside the replier's workday) | ✅ |
| **Recovery engagement**: the pool opens, replies to, and rescues your mail from spam when placement drops | ✅ |
| Gradual ramp (default start 10/day, +1/day, ceiling 40/day) | ✅ |
| Ramp held on an early bad signal | ✅ |
| Single-use, recipient-bound verification tokens (warmup mail cannot be replayed or redirected) | ✅ |
| Filter tag so warmup mail stays out of your inbox (Gmail / Outlook filter instructions) | ✅ |
| Hide warmup from other tools' pools in the unibox | ✅ |
| Warmup keeps running after campaigns start | ✅ |
| Warmup fraud detection, quarantine, appeals and re-entry | ✅ |
| Warmup health bands: Healthy → Watch → Throttled → Quarantine (7 days) → Blocked (30 days) | ✅ |
| Warmup placement dashboard (where warmup lands, by provider) | ✅ |
| Self-hosted note: a self-hosted instance only warms between its own mailboxes | ⚠️ Plan a public "Demail Network" pool later (opt-in, federated) |

## 4. Campaigns

| Feature | Status |
|---|---|
| Campaign wizard with volume estimate (how long the mailbox pool needs to reach every lead) | ✅ |
| Sender selection: by tag, individually, or all active mailboxes | ✅ |
| Follow-ups from other mailboxes; campaigns sharing mailboxes | ✅ |
| Send in the recipient's timezone | ✅ |
| Delay before the first email | ✅ |
| Continuous campaigns (keep enrolling new leads) | ✅ |
| Live segment linked to a campaign (new members auto-enroll) | ✅ |
| **Pre-launch review**: blank merge fields, steps that won't render, unsubscribed and failed-verification leads | ✅ |
| Per-lead email preview and editing a single lead's email | ✅ |
| Approve leads before sending (hold / back to review) | ✅ |
| List quality launch check (blocks bad lists at launch, not at import) | ✅ |
| Plain-text-only mode; images in the editor; attachments | ✅ |
| Open and link tracking (on/off per campaign) | ✅ |
| Stop on reply, stop on booked meeting | ✅ |
| Daily budget per campaign; auto-pause with a reason | ✅ |
| Test email; send test of a saved step | ✅ |
| Copy a campaign (also across workspaces) | ✅ |
| **Holiday skipping by recipient country** | 🆕 `[E2]` |

## 5. Sequences

| Feature | Status |
|---|---|
| Visual flow canvas (steps, paths, "go to step", explicit end) | ✅ |
| Email steps with rich editor, preview, test | ✅ |
| Wait / spacing steps | ✅ |
| Follow-ups threaded in the same conversation | ✅ |
| **A/B/Z variants** with results per variant | ✅ |
| Automatically promote the winning variant | ✅ verify / 🆕 `[E3]` |
| **Switch / branch steps** (opened, clicked, replied, visited site, field values) | ✅ |
| **AI steps** inside sequences | ✅ |
| Action steps (update contact, add label, CRM actions) | ✅ |
| Spintax | ✅ |
| Merge fields with fallbacks + template expressions (`{{if}}`, `default`) | ✅ |
| **AI variables**: per-recipient AI-written snippets at send time, optional web search | ✅ |
| Content lint / spam-word and "human tone" checks before send | ✅ |
| **Subsequences triggered by reply intent, meeting booked or link clicked** | 🆕 `[E3]` |
| **Manual task steps** (custom to-do, reminder, snooze) | 🆕 `[E3]` |
| **Call steps** | 🆕 `[E3]` |
| **SMS steps** | 🆕 `[E3]` |

## 6. LinkedIn

All LinkedIn actions run through a `SocialProvider` adapter. Today that is GraphKit, and Demail
adds open adapters `[E3]`. LinkedIn automation breaks LinkedIn's terms of service, so it is off by default,
has conservative daily limits, and shows a warning in the UI.

| Feature | Status |
|---|---|
| Connect a LinkedIn account by email/phone + password, or the `li_at` session cookie | 🔓 |
| Sales Navigator **or** Recruiter seat per connection | 🔓 |
| Sign-in details are never stored (session only); reconnect flow | 🔓 |
| **Connection request (invite)** with or without a note | 🔓 |
| **Withdraw a pending invite** | 🔓 |
| **Message** (1st-degree connections) | 🔓 |
| **InMail** | 🔓 |
| **Voice note**: recorded, or written text turned into voice | 🔓 |
| **Profile visit** | 🔓 |
| **Follow** | 🔓 |
| **Like a post** | 🔓 |
| **Comment on a post** | 🔓 |
| **Endorse a skill** | 🔓 |
| A/B variants on LinkedIn steps | 🔓 |
| "If the LinkedIn profile is missing": skip the step or stop the lead | 🔓 |
| Action states: pending → queued → running → succeeded / skipped / failed / cancelled / expired, with retry | 🔓 |
| **Search LinkedIn for leads** (incl. Sales Navigator / Recruiter search) and add results to contacts | 🔓 |
| LinkedIn list import (queued → running → done) | 🔓 |
| **LinkedIn conversations in the unibox**, next to email | 🔓 |
| LinkedIn profile URL / public id stored on the contact | ✅ |
| Per-account daily safety limits and warm-up of new LinkedIn accounts | 🆕 `[E3]` |
| Open adapters (e.g. Unipile-style API) + a self-hosted option | 🆕 `[E3]` |
| Several LinkedIn senders rotated in one campaign | 🆕 `[E3]` |

## 7. Other social channels and phone

| Feature | Status |
|---|---|
| **WhatsApp**: connect by QR code or pairing code; send WhatsApp steps; conversations in the unibox | 🔓 |
| **Telegram**: connect by QR code; steps; conversations | 🔓 |
| **Instagram**: username + password or cookies; DMs | 🔓 |
| **Facebook**: Messenger to friends | 🔓 |
| **Consent basis per contact and channel** (opt-in, existing conversation, imported with consent, friend) | ✅ |
| WhatsApp Cloud API adapter (official, template messages) | 🆕 `[E3]` |
| **Calls**: browser softphone (WebRTC), click-to-call, local-presence numbers | 🆕 `[E3]` (Twilio / Telnyx adapters) |
| Call recording, transcript, AI summary, sentiment, objection tags | 🆕 `[E3]` |
| Retry lists, skip voicemail / dial tone, number verification | 🆕 `[E3]` |
| Manual call logging | ✅ (meetings page) |
| **SMS** (Twilio / Telnyx) | 🆕 `[E3]` |

## 8. Unified inbox (unibox)

| Feature | Status |
|---|---|
| Every mailbox and reply in one place, threaded | ✅ |
| Folders, scopes, layouts, keyboard shortcuts | ✅ |
| Labels / thread tags | ✅ |
| Compose, reply, forward, drafts | ✅ |
| Booking link and "Book a call" in the composer | ✅ |
| Tracking pixels stripped when you read (your own reads never count as opens) | ✅ |
| Visibility controls (who sees which mailboxes) | ✅ |
| Hide other tools' warmup mail (warmup tags) | ✅ |
| **Inbox tagging (AI)**: labels, relevance, priority, "who owes whom a reply", automated mail kept out | ✅ |
| Your own yes/no and pick-one classification questions | ✅ |
| Multilingual reply reading (OOO, bounces, "not interested", "interested" in many languages) | ✅ (add Hungarian `[E8]`) |
| Act on a verdict: hold, stop, follow up, suppress | ✅ |
| **Inbox agent**: AI drafts a reply in your voice for you to approve, edit or discard | ✅ |
| Optional auto-send of AI replies (per-workspace opt-in, off by default) | 🆕 `[E5]` (Warmbly never auto-sends; Emailchaser and Instantly do) |
| Social conversations (LinkedIn, WhatsApp, Telegram, Instagram, Facebook) in the same inbox | 🔓 |
| Bulk actions: assign, archive, forward | ✅ verify |

## 9. Deliverability

| Feature | Status |
|---|---|
| Deliverability dashboard: bounces, complaints, spam placement | ✅ |
| Health bands with automatic throttle / pause (warmup and cold volume) | ✅ |
| Domain authentication checks (SPF / DMARC passing, failing, unknown) | ✅ |
| **Inbox placement tests** from one mailbox or a whole fleet to seed inboxes at the main providers | ✅ |
| Your own seed inboxes | ✅ |
| Bounce + complaint processing (DSN parsing, blame attribution) | ✅ |
| Global suppression list / block list | ✅ |
| One-click unsubscribe (RFC 8058) + unsubscribe page in many languages | ✅ |
| Bot, prefetch and privacy-proxy filtering for opens and clicks (Apple MPP etc.) | ✅ |
| **Advisor**: watches your sending, raises findings on the page where the fix lives, "fix with agent" | ✅ |
| Sync governor and abuse detection | ✅ |
| **DNSBL blacklist monitoring + auto-pause** | 🆕 `[E2]` |
| Public blacklist / bounce-rate tools | 🆕 `[E7]` |

## 10. Leads and data

| Feature | Status |
|---|---|
| **Lead finder (map)**: search an area for local businesses, pins or heatmap, color by reachability/score | ✅ |
| Reads business websites for owners, emails, phones and socials (reader service + web search fallback) | ✅ |
| Lead scoring, filters, saved searches, export | ✅ |
| Apollo integration | ✅ |
| Clay integration | ✅ |
| LinkedIn lead search | 🔓 |
| Contact import (CSV/XLSX) with field mapping and list-quality review | ✅ |
| **Built-in email verification**: syntax, MX, disposable, mailbox probe | ✅ |
| Verifier integrations: MillionVerifier, CleanMyList; import results from ZeroBounce, NeverBounce, Bouncer, Kickbox, Emailable, DeBounce, Clearout, EmailListVerify | ✅ |
| Re-verify old contacts | ✅ |
| Email provider detection per contact (Google, Microsoft, …) | ✅ |
| Contact location / region | ✅ |
| **AI contact research**: company summary, dated cited signals, ready-made openers | ✅ |
| **Consensus verification** (2–3 verifiers must agree; catch-all risk score) | 🆕 `[E4]` |
| **Waterfall enrichment** (email + phone across Prospeo, LeadMagic, Findymail, Hunter, Apollo, …) | 🆕 `[E4]` |
| Lookalike companies, tech-stack, funding and job-posting filters (through providers) | 🆕 `[E4]` |
| Buying / intent signals (job change, hiring, funding, website visits) | 🆕 `[E4]` (website visits ✅ already) |

## 11. CRM

| Feature | Status |
|---|---|
| Contacts with custom fields, labels, sources, bulk edit | ✅ |
| Segments (rules + manual pins), split by region, live link to campaigns | ✅ |
| Pipelines and deals (Kanban) | ✅ |
| Tasks | ✅ |
| Meetings timeline; Calendly and Cal.com webhooks | ✅ |
| Contact activity timeline (email, opens, clicks, visits, replies) | ✅ |
| Two-way sync: HubSpot, Salesforce, Pipedrive | ✅ |
| **Zoho CRM sync** | 🆕 `[E6]` |
| Cross-channel timeline (calls, LinkedIn, WhatsApp, tasks) on the contact card | 🆕 `[E6]` |

## 12. Website tracking and forms

| Feature | Status |
|---|---|
| Website tracking snippet: pages a contact visits, shown in their timeline | ✅ |
| Consent modes (ask first / record on load), retention controls, abuse controls | ✅ |
| Anonymous visitor → known contact when they click your email | ✅ |
| "Visited site" as a sequence branch condition | ✅ |
| **Hosted lead-capture forms**: multi-page, themes, layouts, focus mode, embed, custom fields, add to campaign | ✅ |
| Company-level identification of anonymous visitors (reverse IP) | 🆕 `[E4]` (adapter, optional) |

## 13. AI

| Feature | Status |
|---|---|
| **AI assistant ("Remie", renamed for Demail)**: searches data, edits records, manages campaigns; asks approval before sending | ✅ |
| AI sequence and email writing | ✅ |
| AI variables (per-recipient snippets at send time) | ✅ |
| AI contact research | ✅ |
| AI reply drafts (inbox agent) | ✅ |
| AI inbox tagging and classification | ✅ |
| AI steps in sequences and automations ("Ask AI" yes/no conditions) | ✅ |
| **AI skills**: your team's playbooks (objection handling, booking) that every AI feature follows | ✅ |
| Bring your own AI keys / AI connections; AI credit balance and caps | ✅ |
| **Autopilot (AI SDR)**: website → target customer profile → free audience count → sequence draft → approval screen with cost → buy domain + mailboxes → ramp + warmup → runs unattended (tops up leads, promotes winners, drafts replies) → weekly report | 🆕 `[E5]` |
| Autopilot fully controllable over MCP and API | 🆕 `[E5]` |

## 14. Automations and integrations

| Feature | Status |
|---|---|
| **Visual automation builder**: trigger → IF / AI yes-no / random split / expression → actions | ✅ |
| Inbound webhook trigger | ✅ |
| Outbound webhooks (signed) | ✅ |
| REST API + OpenAPI + SDKs (JS, Python, Go) | ✅ |
| **MCP server** (for Claude, ChatGPT, Cursor) + agent tools | ✅ |
| CLI + Claude Code skills (api, cli, install, ops) | ✅ |
| Zapier, Make, n8n | ✅ |
| Slack app (notifications, approvals) | ✅ |
| OAuth apps (third parties build on Demail) | ✅ |
| **Importers from other tools**: Instantly, Smartlead, lemlist, Saleshandy, QuickMail, Woodpecker, Reply.io, Snov.io, Mailshake, Apollo | ✅ |
| Workspace export / import (full data portability) | ✅ |

## 15. Analytics and reporting

| Feature | Status |
|---|---|
| Workspace dashboard, per-campaign, per-step, per-variant, per-mailbox | ✅ |
| Honest counting: human replies only, auto-opens and auto-clicks logged but not counted, click counts as open | ✅ |
| Reporting periods and filters by campaign or folder | ✅ |
| **Client reports**: live branded link, embed, scheduled weekly/monthly email | ✅ |
| **Team leaderboard + per-rep activity across channels** | 🆕 `[E6]` |
| Call analytics (connection rate, sentiment) | 🆕 `[E3]` |

## 16. Agencies and white-label

| Feature | Status |
|---|---|
| Agency account: one workspace per client, staff reach every client | ✅ |
| "View as client" | ✅ |
| Shared monthly send pool with per-client caps | ✅ |
| Shared AI balance with per-client caps and transfers | ✅ |
| **White-label**: your brand, theme, fonts, tab icon, sign-in page, support/legal links | ✅ |
| Your own portal domain (dashboard and client sign-in on your domain) | ✅ |
| Client connect links (clients connect their own mailboxes without an account) | ✅ |
| "Powered by" on/off | ✅ |

## 17. Team, security and collaboration

| Feature | Status |
|---|---|
| Roles and permissions; access limited to selected campaigns/mailboxes | ✅ |
| **Realtime collaboration**: who's online, who's editing, live cursors, chat, shared builder canvases | ✅ |
| Two-factor auth, passkeys, SSO, Google/Apple sign-in | ✅ |
| Confirm sensitive changes (fresh auth) | ✅ |
| Sessions management; impossible-travel sign-in detection | ✅ |
| Audit log | ✅ |
| Envelope encryption for every secret (local AES key or AWS KMS) | ✅ |
| GDPR: mailbox erasure, contact deletion, retention windows, data export | ✅ |
| Notifications (in-app, email, Slack) with preferences | ✅ |
| Mobile app (iOS) | ✅ |

## 18. Self-hosting and operations

| Feature | Status |
|---|---|
| One-command install (`curl … | sh`) with wizard, dry run and checksum | 🔁 rebrand to `install.demail…` |
| Docker Compose; no AWS / GCP / Stripe / Kafka required | ✅ |
| Control plane + pull-based worker fleet (scale by adding workers) | ✅ |
| Deploy guides: bare metal, Coolify, AWS Fargate, split deployment | ✅ |
| Operator CLI (`demailctl`, renamed from `warmblyctl`): accounts, passwords, admin, status | ✅ |
| Admin panel: instance health, fleet, jobs, mail, warmup content, updates | ✅ |
| `make doctor` health checks; self-updater | ✅ |
| Billing (Stripe) optional; credits ledger; plans | ✅ |
| Sandbox + fakes for every outside service | ✅ |

## 19. Growth: free public tools `[E7]`

| Tool | Status |
|---|---|
| Email verifier (one address, rate-limited) | 🆕 |
| SPF record generator / DMARC generator | 🆕 |
| DNS + blacklist checker | 🆕 |
| Spam-word checker | 🆕 |
| AI subject-line generator | 🆕 |
| AI follow-up email generator | 🆕 |
| Email permutator / company email-format finder | 🆕 |

## 20. Localization `[E8]`

| Feature | Status |
|---|---|
| i18n framework across dashboard, portal, site | 🆕 |
| English + **Hungarian** first | 🆕 |
| AI writing and reply classification follow the campaign language | 🆕 (classifier is partly multilingual already) |

---

## Rebrand checklist (Warmbly → Demail)

- Product name, logo, favicon, emails, installer URL, docs domain, CLI names (`warmblyctl` → `demailctl`, `warmbly` CLI → `demail`).
- Assistant name ("Remie") → pick a Demail name.
- The warmup filter marker / tag text, so it doesn't collide with real Warmbly instances.
- Keep `LICENSE` (Apache-2.0) and all copyright notices; add `NOTICE`: "Based on Warmbly © 2026 Mindroot Ltd."
- Don't use the Warmbly name or logo anywhere in the product (Apache-2.0 grants no trademark rights).

## Explicit non-goals (for now)

- Our own shared IP pools / server sharding: Demail sends through each mailbox's own provider.
- Our own B2B contact database: Demail integrates data providers.
- Dynamic images, video and personalized landing pages.
