-- Replies HubSpot refused during push, kept until a retry adds them, their message or connection is gone, or they are dismissed.
create table public.crm_push_skips (
  organization_id uuid not null,
  provider text not null check (provider = 'hubspot'),
  message_id uuid not null,
  skipped_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts >= 1),
  retry_requested boolean not null default false,
  primary key (message_id, provider),
  foreign key (organization_id, provider) references public.crm_connections (organization_id, provider) on delete cascade,
  foreign key (message_id, organization_id) references public.thread_messages (id, organization_id) on delete cascade
);
create index crm_push_skips_org_idx on public.crm_push_skips (organization_id, provider, skipped_at desc);
create trigger crm_push_skips_org_immutable before update on public.crm_push_skips
  for each row execute function public.prevent_org_change();
alter table public.crm_push_skips enable row level security;
create policy crm_push_skips_select on public.crm_push_skips for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.crm_push_skips from anon, authenticated;
grant all on public.crm_push_skips to service_role;
