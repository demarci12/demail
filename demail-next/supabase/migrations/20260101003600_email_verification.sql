-- Built-in email verification: result columns on contacts, service-only writers, and a guard that keeps invalid addresses out of campaigns.
alter table public.contacts
  add column verify_status text check (verify_status in ('valid', 'risky', 'invalid', 'unknown')),
  add column verify_reason text check (char_length(verify_reason) <= 40),
  add column verify_suggestion text check (char_length(verify_suggestion) <= 320),
  add column verify_flags text[] not null default '{}'::text[] check (cardinality(verify_flags) <= 8),
  add column verified_at timestamptz;
create index contacts_verify_queue_idx on public.contacts (verified_at nulls first) where verify_status is null or verify_status = 'unknown';

-- Only the service role writes verification results; an edited address loses its old result.
create function public.guard_contact_verification() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated') then
      new.verify_status := null;
      new.verify_reason := null;
      new.verify_suggestion := null;
      new.verify_flags := '{}'::text[];
      new.verified_at := null;
    end if;
    return new;
  end if;
  if lower(new.email) is distinct from lower(old.email) then
    new.verify_status := null;
    new.verify_reason := null;
    new.verify_suggestion := null;
    new.verify_flags := '{}'::text[];
    new.verified_at := null;
  elsif current_user in ('anon', 'authenticated') then
    new.verify_status := old.verify_status;
    new.verify_reason := old.verify_reason;
    new.verify_suggestion := old.verify_suggestion;
    new.verify_flags := old.verify_flags;
    new.verified_at := old.verified_at;
  end if;
  return new;
end;
$$;
create trigger contacts_guard_verification before insert or update on public.contacts
  for each row execute function public.guard_contact_verification();

-- An enrollment row for an invalid address is dropped silently, so every enrolling path (enroll_contacts, submit_form, later ones) skips it.
create function public.skip_invalid_enrollment() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.contacts c
    where c.id = new.contact_id and c.organization_id = new.organization_id and c.verify_status = 'invalid'
  ) then
    return null;
  end if;
  return new;
end;
$$;
create trigger campaign_contacts_skip_invalid before insert on public.campaign_contacts
  for each row execute function public.skip_invalid_enrollment();

-- Contacts that still need a result: never verified, an inconclusive lookup older than a day, or a result older than 90 days.
create function public.contacts_to_verify(p_limit integer) returns table (id uuid, organization_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.organization_id, c.email
  from public.contacts c
  where c.verify_status is null
    or (c.verify_status = 'unknown' and c.verified_at < now() - interval '1 day')
    or (c.verify_status <> 'unknown' and c.verified_at < now() - interval '90 days')
  order by c.verified_at nulls first, c.created_at
  limit greatest(least(p_limit, 500), 0);
$$;

-- Stores results for one organization. A row whose address changed since it was read is ignored.
create function public.set_contact_verification(p_org uuid, p_results jsonb) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if jsonb_typeof(p_results) is distinct from 'array' then
    return 0;
  end if;
  update public.contacts c
  set verify_status = r.status,
      verify_reason = r.reason,
      verify_suggestion = r.suggestion,
      verify_flags = coalesce(r.flags, '{}'::text[]),
      verified_at = now()
  from jsonb_to_recordset(p_results) as r(id uuid, email text, status text, reason text, suggestion text, flags text[])
  where c.id = r.id
    and c.organization_id = p_org
    and lower(c.email) = lower(r.email)
    and r.status in ('valid', 'risky', 'invalid', 'unknown');
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Reports invalid addresses next to unsubscribed and suppressed ones.
create or replace function public.campaign_blocked_enrollments(p_campaign uuid)
returns table (contact_id uuid, email text, reason text, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    c.email,
    case when not c.subscribed then 'unsubscribed' when c.verify_status = 'invalid' then 'invalid address' else 'suppressed' end,
    count(*) over ()
  from public.campaign_contacts cc
  join public.contacts c on c.id = cc.contact_id and c.organization_id = cc.organization_id
  where cc.campaign_id = p_campaign
    and cc.status = 'active'
    and (
      not c.subscribed
      or c.verify_status = 'invalid'
      or exists (
        select 1 from public.suppressed_recipients sr
        where sr.organization_id = c.organization_id
          and lower(sr.email) = lower(c.email)
          and (sr.expires_at is null or sr.expires_at > now())
      )
    )
  order by c.email
  limit 20;
$$;

revoke all on function public.guard_contact_verification(), public.skip_invalid_enrollment(),
  public.contacts_to_verify(integer), public.set_contact_verification(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.contacts_to_verify(integer), public.set_contact_verification(uuid, jsonb) to service_role;
