-- Subsequences: opt-in rules that move a contact into another campaign, or forward to a later step of the same one, after a classified reply, a meeting request or a link click.
create table public.campaign_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  trigger text not null check (trigger in ('reply_intent', 'meeting', 'link_click')),
  intents text[] not null default '{}',
  url_contains text check (url_contains is null or char_length(btrim(url_contains)) between 1 and 300),
  target_campaign_id uuid,
  target_step_id uuid,
  enabled boolean not null default false,
  enabled_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete cascade,
  foreign key (target_campaign_id, organization_id) references public.campaigns (id, organization_id) on delete cascade,
  foreign key (target_step_id, campaign_id) references public.campaign_steps (id, campaign_id) on delete cascade,
  unique (id, organization_id),
  check ((target_campaign_id is not null) <> (target_step_id is not null)),
  check (target_campaign_id is null or target_campaign_id <> campaign_id),
  check (
    (trigger = 'reply_intent'
      and cardinality(intents) between 1 and 7
      and intents <@ array['interested', 'meeting', 'question', 'not_interested', 'out_of_office', 'referral', 'other']::text[])
    or (trigger in ('meeting', 'link_click') and cardinality(intents) = 0)
  ),
  check (trigger = 'link_click' or url_contains is null)
);
create index campaign_rules_campaign_idx on public.campaign_rules (campaign_id);
create index campaign_rules_enabled_idx on public.campaign_rules (enabled_at) where enabled;
create trigger campaign_rules_updated_at before update on public.campaign_rules
  for each row execute function public.set_updated_at();
create trigger campaign_rules_org_immutable before update on public.campaign_rules
  for each row execute function public.prevent_org_change();

-- A rule starts counting events from the moment it is switched on, and a campaign holds at most 20.
create function public.guard_campaign_rule() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.campaign_rules r where r.campaign_id = new.campaign_id) >= 20 then
    raise exception 'A campaign can have at most 20 rules.' using errcode = '23514';
  end if;
  if new.enabled then
    new.enabled_at := case when tg_op = 'UPDATE' and old.enabled then old.enabled_at else now() end;
  else
    new.enabled_at := null;
  end if;
  return new;
end;
$$;
create trigger campaign_rules_guard before insert or update on public.campaign_rules
  for each row execute function public.guard_campaign_rule();

alter table public.campaign_rules enable row level security;
create policy campaign_rules_select on public.campaign_rules for select to authenticated
  using (public.is_org_member(organization_id));
create policy campaign_rules_insert on public.campaign_rules for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy campaign_rules_update on public.campaign_rules for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy campaign_rules_delete on public.campaign_rules for delete to authenticated
  using (public.is_org_member(organization_id));
revoke all on public.campaign_rules from anon;
grant all on public.campaign_rules to service_role;

-- One row per rule and contact: what happened the one time that rule looked at that contact.
create table public.campaign_rule_moves (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  rule_id uuid not null,
  contact_id uuid not null,
  from_campaign_id uuid not null,
  outcome text not null check (outcome in ('moved', 'skipped_blocked', 'skipped_limit', 'skipped_already_enrolled', 'skipped_target', 'skipped_step')),
  created_at timestamptz not null default now(),
  foreign key (rule_id, organization_id) references public.campaign_rules (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete cascade,
  unique (rule_id, contact_id)
);
create index campaign_rule_moves_contact_idx on public.campaign_rule_moves (contact_id, created_at desc) where outcome = 'moved';
alter table public.campaign_rule_moves enable row level security;
create policy campaign_rule_moves_select on public.campaign_rule_moves for select to authenticated
  using (public.is_org_member(organization_id));
revoke all on public.campaign_rule_moves from anon;
revoke insert, update, delete on public.campaign_rule_moves from authenticated;
grant all on public.campaign_rule_moves to service_role;

-- Applies one rule to one contact and records the outcome. Loop guards: one look per rule and contact, an enrollment exists once per campaign and contact, and at most 3 moves per contact in 30 days.
create function public.apply_campaign_rule(p_rule uuid, p_contact uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.campaign_rules%rowtype;
  c public.contacts%rowtype;
  src public.campaign_contacts%rowtype;
  tstatus public.campaign_status;
  pos integer;
  n integer;
  result text;
begin
  select * into r from public.campaign_rules where id = p_rule and enabled;
  if not found then
    return null;
  end if;
  select * into c from public.contacts where id = p_contact and organization_id = r.organization_id;
  select * into src from public.campaign_contacts where campaign_id = r.campaign_id and contact_id = p_contact and organization_id = r.organization_id for update;
  if not found or c.id is null then
    result := 'skipped_blocked';
  elsif not c.subscribed
    or c.verify_status = 'invalid'
    or exists (
      select 1 from public.suppressed_recipients s
      where s.organization_id = c.organization_id and lower(s.email) = lower(c.email) and (s.expires_at is null or s.expires_at > now())
    ) then
    result := 'skipped_blocked';
  elsif (select count(*) from public.campaign_rule_moves m
         where m.organization_id = r.organization_id and m.contact_id = p_contact and m.outcome = 'moved' and m.created_at > now() - interval '30 days') >= 3 then
    result := 'skipped_limit';
  elsif r.target_campaign_id is not null then
    select cp.status into tstatus from public.campaigns cp where cp.id = r.target_campaign_id and cp.organization_id = r.organization_id;
    if not found or tstatus = 'completed' then
      result := 'skipped_target';
    elsif exists (select 1 from public.campaign_contacts t where t.campaign_id = r.target_campaign_id and t.contact_id = p_contact) then
      result := 'skipped_already_enrolled';
    else
      n := public.enroll_contacts(r.target_campaign_id, array[p_contact]);
      if n = 0 then
        result := 'skipped_blocked';
      else
        update public.campaign_contacts set status = 'stopped', next_send_at = null, stopped_reason = 'moved'
        where id = src.id and status = 'active';
        result := 'moved';
      end if;
    end if;
  else
    select s.position into pos from public.campaign_steps s where s.id = r.target_step_id and s.campaign_id = r.campaign_id;
    if not found or src.current_step >= pos then
      result := 'skipped_step';
    elsif src.status = 'active' or (src.status = 'stopped' and src.stopped_reason = 'replied') then
      update public.campaign_contacts
      set status = 'active', current_step = pos, next_send_at = now(), stopped_reason = null, attempts = 0, error = null
      where id = src.id;
      result := 'moved';
    else
      result := 'skipped_step';
    end if;
  end if;
  insert into public.campaign_rule_moves (organization_id, rule_id, contact_id, from_campaign_id, outcome)
  values (r.organization_id, r.id, p_contact, r.campaign_id, result)
  on conflict (rule_id, contact_id) do nothing;
  return result;
end;
$$;

-- Looks for new events (since the rule was switched on, at most 7 days old) and applies every enabled rule. Runs from pg_cron.
create function public.run_campaign_rules() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  cand uuid;
  total integer := 0;
  outcome text;
begin
  for r in select * from public.campaign_rules where enabled and enabled_at is not null order by enabled_at limit 200 loop
    for cand in
      select x.contact_id from (
        select th.contact_id
        from public.reply_intents ri
        join public.threads th on th.id = ri.thread_id and th.organization_id = ri.organization_id
        where r.trigger in ('reply_intent', 'meeting')
          and ri.organization_id = r.organization_id
          and ri.status = 'done'
          and ri.intent = any (case when r.trigger = 'meeting' then array['meeting'] else r.intents end)
          and th.campaign_id = r.campaign_id
          and th.contact_id is not null
          and ri.updated_at > r.enabled_at
          and ri.updated_at > now() - interval '7 days'
        union
        select te.contact_id
        from public.tracking_events te
        where r.trigger = 'link_click'
          and te.organization_id = r.organization_id
          and te.campaign_id = r.campaign_id
          and te.type = 'click'
          and te.counted
          and te.contact_id is not null
          and te.created_at > r.enabled_at
          and te.created_at > now() - interval '7 days'
          and (r.url_contains is null or strpos(lower(coalesce(te.url, '')), lower(r.url_contains)) > 0)
      ) x
      where not exists (select 1 from public.campaign_rule_moves m where m.rule_id = r.id and m.contact_id = x.contact_id)
      limit 100
    loop
      outcome := public.apply_campaign_rule(r.id, cand);
      if outcome = 'moved' then
        total := total + 1;
      end if;
    end loop;
  end loop;
  return total;
end;
$$;

revoke all on function public.guard_campaign_rule(), public.apply_campaign_rule(uuid, uuid), public.run_campaign_rules() from public, anon, authenticated;
grant execute on function public.apply_campaign_rule(uuid, uuid), public.run_campaign_rules() to service_role;
