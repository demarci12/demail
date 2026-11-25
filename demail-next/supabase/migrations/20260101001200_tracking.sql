-- Open and click tracking: per-campaign toggles, an append-only event log and its functions.
alter table public.campaigns
  add column track_opens boolean not null default false,
  add column track_clicks boolean not null default false;
-- Existing campaigns keep their current behavior; new ones track.
alter table public.campaigns
  alter column track_opens set default true,
  alter column track_clicks set default true;

alter table public.messages add constraint messages_id_org_key unique (id, organization_id);

create table public.tracking_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  message_id uuid not null,
  contact_id uuid,
  campaign_id uuid,
  mailbox_id uuid,
  type text not null check (type in ('open', 'click')),
  url text,
  counted boolean not null,
  filter_reason text check (filter_reason in ('bot', 'prefetch', 'privacy_proxy', 'too_early', 'own_read')),
  user_agent text,
  created_at timestamptz not null default now(),
  foreign key (message_id, organization_id) references public.messages (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete cascade,
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete cascade,
  foreign key (mailbox_id, organization_id) references public.mailboxes (id, organization_id) on delete set null (mailbox_id)
);
create index tracking_events_campaign_idx on public.tracking_events (campaign_id, type, counted);
create index tracking_events_contact_idx on public.tracking_events (contact_id, created_at desc);
create index tracking_events_message_idx on public.tracking_events (message_id);
create index tracking_events_created_idx on public.tracking_events (created_at);

alter table public.tracking_events enable row level security;
create policy tracking_events_select on public.tracking_events for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.tracking_events from anon, authenticated;

-- Called by the public tracking routes with the service role; stores no IP and caps events per message.
create function public.record_tracking_event(p_message uuid, p_type text, p_url text, p_counted boolean, p_reason text, p_ua text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages%rowtype;
begin
  select * into m from public.messages where id = p_message and status = 'sent';
  if not found then
    return false;
  end if;
  if (select count(*) from public.tracking_events where message_id = p_message) >= 200 then
    return false;
  end if;
  insert into public.tracking_events (organization_id, message_id, contact_id, campaign_id, mailbox_id, type, url, counted, filter_reason, user_agent)
  values (m.organization_id, m.id, m.contact_id, m.campaign_id, m.mailbox_id, p_type, left(p_url, 2000), p_counted, p_reason, left(p_ua, 200));
  return true;
end;
$$;
revoke all on function public.record_tracking_event(uuid, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.record_tracking_event(uuid, text, text, boolean, text, text) to service_role;

-- Security invoker, so row level security limits the counts to the caller's organizations.
create function public.campaign_engagement(p_campaign uuid)
returns table (sent bigint, opened bigint, clicked bigint, replied bigint, bounced bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*) from public.messages where campaign_id = p_campaign and status = 'sent'),
    (select count(distinct message_id) from public.tracking_events where campaign_id = p_campaign and counted),
    (select count(distinct message_id) from public.tracking_events where campaign_id = p_campaign and counted and type = 'click'),
    (select count(distinct tm.thread_id) from public.thread_messages tm join public.threads t on t.id = tm.thread_id and t.organization_id = tm.organization_id
      where t.campaign_id = p_campaign and tm.kind = 'reply'),
    (select count(distinct tm.thread_id) from public.thread_messages tm join public.threads t on t.id = tm.thread_id and t.organization_id = tm.organization_id
      where t.campaign_id = p_campaign and tm.kind = 'bounce');
$$;
revoke all on function public.campaign_engagement(uuid) from public, anon;
grant execute on function public.campaign_engagement(uuid) to authenticated, service_role;

-- Scheduled in a later migration; keeps 180 days of events.
create function public.purge_old_events()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.tracking_events where created_at < now() - interval '180 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purge_old_events() from public, anon, authenticated;
grant execute on function public.purge_old_events() to service_role;
