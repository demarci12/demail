# Roadmap

Phase 1 is shipped in this directory: auth, workspaces, contacts, mailboxes, campaigns with email and wait steps, Resend sending, suppression and unsubscribe. Later phases, in order, with what each one needs.

## Phase 2: richer campaigns

- A/B variants with per-variant results.
- Branching steps (opened, clicked, replied) and subsequences. Needs open, click and reply events from phase 3 and 4.
- Attachments, test send of a saved step, and a pre-launch review that lists blank merge fields and unsubscribed leads.
- Campaign analytics per step and per mailbox.

## Phase 3: more mailboxes and replies
Shipped:
- Google and Microsoft OAuth mailboxes with sealed tokens, threaded follow-ups and per-mailbox caps.
- Reply sync by polling, a unibox with live updates, reply and compose, and stop on reply.
- Bounce notices read from connected mailboxes feed the suppression list.
Still open:
- SMTP/IMAP mailboxes, which need a long-lived connection that Vercel and Supabase Edge Functions cannot hold, so they would need an optional external poller.
- Bounce and complaint webhooks from Resend feeding the suppression list.
- Provider push (Gmail Pub/Sub, Graph change notifications) as an accelerator over polling.
Next: Phase 2 (richer campaigns) can now use reply events, then Phase 4.

## Phase 4: deliverability

- Warmup between owned mailboxes. Needs phase 3 mailboxes and reply sync.
- Blacklist (DNSBL) monitoring with auto-pause.
- Custom tracking domain, open and click tracking with bot filtering.
- Mailbox ramp-up schedule for cold sending.

## Phase 5: data, AI and channels

- AI writing, reply drafts and classification (bring your own key).
- Email verification and waterfall enrichment through provider adapters.
- Lead finder, CRM sync, forms and website tracking.
- LinkedIn and other channels through adapters, agencies and white-label.
- Hungarian and English localization.
