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
Next: Phase 5 part 1.

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
Next: Phase 5 part 1.
## Phase 5: data, AI and channels

- AI writing, reply drafts and classification (bring your own key).
- Email verification and waterfall enrichment through provider adapters.
- Lead finder, CRM sync, forms and website tracking.
- LinkedIn and other channels through adapters, agencies and white-label.
- Hungarian and English localization.

Part 1 plan:
- **AI provider.** One OpenAI-compatible chat completions adapter, configured with a base URL and a model, so OpenAI, OpenRouter, Groq or a local Ollama all work.
- **AI keys.** Each workspace brings its own key, sealed by the app with secretbox under a new domain-separated key and stored in a service-only table. An optional instance key env var covers single-tenant self-hosts.
- **AI sending.** AI drafts and AI replies are never sent until a member approves them. Auto-send stays off by default, and paid AI calls are off by default.
- **CRM.** HubSpot sync comes first.
- **Then.** Hosted forms, then agencies and white-label.
