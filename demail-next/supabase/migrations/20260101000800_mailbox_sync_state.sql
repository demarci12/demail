-- Per-mailbox sync cursor and schedule. Service role only, like mailbox_credentials.
create table public.mailbox_sync_state (
  mailbox_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  cursor text,
  next_sync_at timestamptz not null default now(),
  last_synced_at timestamptz,
  consecutive_errors integer not null default 0,
  hot boolean not null default false,
  foreign key (mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete cascade
);
create index mailbox_sync_state_due_idx on public.mailbox_sync_state (next_sync_at);
create trigger mailbox_sync_state_org_immutable before update on public.mailbox_sync_state
  for each row execute function public.prevent_org_change();
alter table public.mailbox_sync_state enable row level security;
revoke all on public.mailbox_sync_state from anon, authenticated;
grant all on public.mailbox_sync_state to service_role;

alter table public.messages
  add column provider_message_id text,
  add column provider_thread_id text,
  add column rfc_message_id text;
create index messages_mailbox_thread_idx on public.messages (mailbox_id, provider_thread_id);
create index messages_mailbox_rfc_idx on public.messages (mailbox_id, rfc_message_id);
alter table public.campaign_contacts add column stopped_reason text;
