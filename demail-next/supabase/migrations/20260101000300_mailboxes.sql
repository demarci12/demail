-- A mailbox is a sender identity. Credentials stay in env (Resend), never in this table.
create table public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  from_name text not null default '',
  reply_to text,
  provider text not null default 'resend' check (provider in ('resend')),
  status public.mailbox_status not null default 'active',
  daily_limit integer not null default 50 check (daily_limit between 1 and 5000),
  min_gap_seconds integer not null default 600 check (min_gap_seconds >= 0),
  signature_plain text,
  signature_html text,
  timezone text not null default 'UTC',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index mailboxes_org_email_idx on public.mailboxes (organization_id, lower(email));
create trigger mailboxes_updated_at before update on public.mailboxes
  for each row execute function public.set_updated_at();
create trigger mailboxes_org_immutable before update on public.mailboxes
  for each row execute function public.prevent_org_change();

alter table public.mailboxes enable row level security;

create policy mailboxes_select on public.mailboxes for select to authenticated
  using (public.is_org_member(organization_id));
create policy mailboxes_insert on public.mailboxes for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy mailboxes_update on public.mailboxes for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy mailboxes_delete on public.mailboxes for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
