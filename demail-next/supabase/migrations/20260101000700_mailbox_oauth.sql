-- Google and Microsoft mailboxes. Resend stays the default provider.
alter table public.mailboxes drop constraint mailboxes_provider_check;
alter table public.mailboxes add constraint mailboxes_provider_check check (provider in ('resend', 'google', 'microsoft'));
alter table public.mailboxes
  add column last_synced_at timestamptz,
  add column last_error text,
  add column provider_account_id text;

-- Tokens are sealed by the app (AES-256-GCM) before they reach the database; only the service role can read this table.
create table public.mailbox_credentials (
  mailbox_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ciphertext text not null,
  key_version smallint not null default 1,
  version integer not null default 1,
  scopes text,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete cascade
);
create trigger mailbox_credentials_updated_at before update on public.mailbox_credentials
  for each row execute function public.set_updated_at();
create trigger mailbox_credentials_org_immutable before update on public.mailbox_credentials
  for each row execute function public.prevent_org_change();
alter table public.mailbox_credentials enable row level security;
revoke all on public.mailbox_credentials from anon, authenticated;
grant all on public.mailbox_credentials to service_role;
