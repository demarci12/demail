-- AI drafts a member reviews; nothing here is sent without a member's click.
create table public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('step', 'reply')),
  campaign_id uuid,
  thread_id uuid,
  brief text check (brief is null or char_length(brief) <= 2000),
  subject text check (subject is null or char_length(subject) <= 500),
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  status text not null default 'draft' check (status in ('draft', 'used', 'sent', 'discarded')),
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete cascade,
  foreign key (thread_id, organization_id) references public.threads (id, organization_id) on delete cascade,
  check ((kind = 'step' and campaign_id is not null and thread_id is null) or (kind = 'reply' and thread_id is not null and campaign_id is null)),
  unique (id, organization_id)
);
create index ai_drafts_campaign_idx on public.ai_drafts (campaign_id, created_at desc) where campaign_id is not null;
create index ai_drafts_thread_idx on public.ai_drafts (thread_id, created_at desc) where thread_id is not null;
create trigger ai_drafts_updated_at before update on public.ai_drafts
  for each row execute function public.set_updated_at();
create trigger ai_drafts_org_immutable before update on public.ai_drafts
  for each row execute function public.prevent_org_change();
alter table public.ai_drafts enable row level security;
create policy ai_drafts_select on public.ai_drafts for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.ai_drafts from anon, authenticated;
grant all on public.ai_drafts to service_role;
