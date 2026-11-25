-- Replies and conversations. Only mail matching a sent campaign message or a known thread is stored.
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  mailbox_id uuid not null,
  provider_thread_id text not null,
  subject text,
  contact_id uuid,
  campaign_id uuid,
  snippet text,
  last_message_at timestamptz not null,
  is_unread boolean not null default true,
  status text not null default 'open' check (status in ('open', 'archived')),
  created_at timestamptz not null default now(),
  foreign key (mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete set null (contact_id),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete set null (campaign_id),
  unique (id, organization_id),
  unique (mailbox_id, provider_thread_id)
);
create index threads_org_list_idx on public.threads (organization_id, status, last_message_at desc);
create trigger threads_org_immutable before update on public.threads
  for each row execute function public.prevent_org_change();

create table public.thread_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  thread_id uuid not null,
  direction text not null check (direction in ('in', 'out')),
  kind text not null check (kind in ('reply', 'auto_reply', 'bounce', 'sent')),
  provider_message_id text not null,
  rfc_message_id text,
  in_reply_to text,
  from_email text,
  from_name text,
  to_emails text[] not null default '{}',
  subject text,
  body_text text,
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (thread_id, organization_id) references public.threads (id, organization_id) on delete cascade,
  unique (thread_id, provider_message_id)
);
create index thread_messages_thread_idx on public.thread_messages (thread_id, sent_at);

alter table public.threads enable row level security;
alter table public.thread_messages enable row level security;
create policy threads_select on public.threads for select to authenticated
  using (public.is_org_member(organization_id));
create policy threads_update on public.threads for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy thread_messages_select on public.thread_messages for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, delete on public.threads from anon, authenticated;
revoke insert, update, delete on public.thread_messages from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.threads, public.thread_messages;
  end if;
end;
$$;
