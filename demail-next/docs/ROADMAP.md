# Roadmap

Phase 1 is shipped in this directory: auth, workspaces, contacts, mailboxes, campaigns with email and wait steps, Resend sending, suppression and unsubscribe. Later phases, in order, with what each one needs.

## Phase 2: richer campaigns

- A/B variants with per-variant results.
- Branching steps (opened, clicked, replied) and subsequences. Needs open, click and reply events from phase 3 and 4.
- Attachments, test send of a saved step, and a pre-launch review that lists blank merge fields and unsubscribed leads.
- Campaign analytics per step and per mailbox.

## Phase 3: more mailboxes and replies

- SMTP/IMAP and OAuth mailboxes (Google, Microsoft). Needs a place to keep credentials sealed (Supabase Vault or an env key) and an answer to the long-lived connection limit.
- Reply sync and a unified inbox. Uses provider push (Gmail Pub/Sub, Microsoft Graph subscriptions, Resend inbound webhooks) or an optional small external poller container, since IMAP idle cannot run on Vercel or Supabase Edge Functions.
- Bounce and complaint webhooks from Resend feeding the suppression list.
- Stop on reply, which depends on reply sync.

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
