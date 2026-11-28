-- Condition steps: branch step columns, per-enrollment branch results and a claim the previous release can call safely.
alter type public.step_type add value if not exists 'branch';

alter table public.campaign_steps
  add column branch_condition text check (branch_condition is null or branch_condition in ('opened', 'clicked', 'replied', 'visited_site', 'always')),
  add column branch_tracker_id uuid,
  add column branch_path text check (branch_path is null or (char_length(branch_path) between 1 and 300 and left(branch_path, 1) = '/')),
  add column yes_action text check (yes_action is null or yes_action in ('next', 'end', 'step')),
  add column yes_step_id uuid,
  add column no_action text check (no_action is null or no_action in ('next', 'end', 'step')),
  add column no_step_id uuid;

alter table public.campaign_steps add constraint campaign_steps_id_campaign_key unique (id, campaign_id);
alter table public.campaign_steps
  add constraint campaign_steps_yes_step_fkey foreign key (yes_step_id, campaign_id)
    references public.campaign_steps (id, campaign_id) on delete set null (yes_step_id),
  add constraint campaign_steps_no_step_fkey foreign key (no_step_id, campaign_id)
    references public.campaign_steps (id, campaign_id) on delete set null (no_step_id),
  add constraint campaign_steps_branch_tracker_fkey foreign key (branch_tracker_id, organization_id)
    references public.site_trackers (id, organization_id) on delete set null (branch_tracker_id);

-- The enum value is new in this transaction, so every comparison goes through text.
alter table public.campaign_steps drop constraint campaign_steps_check;
alter table public.campaign_steps add constraint campaign_steps_kind_check check (
  (type::text = 'email'
    and char_length(btrim(coalesce(subject, ''))) > 0
    and char_length(btrim(coalesce(body_plain, ''))) > 0)
  or (type::text = 'wait' and wait_seconds is not null and wait_seconds > 0)
  or (type::text = 'branch' and branch_condition is not null and yes_action is not null and no_action is not null)
);

create table public.campaign_branch_results (
  enrollment_id uuid not null,
  step_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null,
  outcome boolean not null,
  decided_at timestamptz not null default now(),
  primary key (enrollment_id, step_id),
  foreign key (enrollment_id, organization_id) references public.campaign_contacts (id, organization_id) on delete cascade,
  foreign key (step_id, organization_id) references public.campaign_steps (id, organization_id) on delete cascade,
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete cascade
);
create index campaign_branch_results_campaign_idx on public.campaign_branch_results (campaign_id, step_id);
alter table public.campaign_branch_results enable row level security;
create policy campaign_branch_results_select on public.campaign_branch_results
  for select to authenticated using (public.is_org_member(organization_id));
revoke all on public.campaign_branch_results from anon;
revoke insert, update, delete on public.campaign_branch_results from authenticated;
grant all on public.campaign_branch_results to service_role;

-- The claim the new release calls: every due enrollment of an active campaign.
create function public.claim_send_batch(batch integer) returns setof public.campaign_contacts
language sql security definer
set search_path = ''
as $$
  with due as (
    select cc.id
    from public.campaign_contacts cc
    join public.campaigns c on c.id = cc.campaign_id
    where c.status = 'active' and cc.status = 'active' and cc.next_send_at <= now()
    order by cc.next_send_at
    limit greatest(batch, 0)
    for update of cc skip locked
  )
  update public.campaign_contacts cc
  set next_send_at = now() + interval '10 minutes'
  from due
  where cc.id = due.id
  returning cc.*;
$$;

-- The previous release calls this and must never see a branch step, so campaigns with one wait.
create or replace function public.claim_due_enrollments(batch integer) returns setof public.campaign_contacts
language sql security definer
set search_path = ''
as $$
  with due as (
    select cc.id
    from public.campaign_contacts cc
    join public.campaigns c on c.id = cc.campaign_id
    where c.status = 'active' and cc.status = 'active' and cc.next_send_at <= now()
      and not exists (select 1 from public.campaign_steps s where s.campaign_id = c.id and s.type::text = 'branch')
    order by cc.next_send_at
    limit greatest(batch, 0)
    for update of cc skip locked
  )
  update public.campaign_contacts cc
  set next_send_at = now() + interval '10 minutes'
  from due
  where cc.id = due.id
  returning cc.*;
$$;

-- Decides a condition once per enrollment and step from activity since enrollment; retries return the stored answer.
create function public.decide_branch(p_enrollment uuid, p_step uuid) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  e public.campaign_contacts%rowtype;
  s public.campaign_steps%rowtype;
  stored boolean;
  v boolean;
begin
  select * into e from public.campaign_contacts where id = p_enrollment;
  if not found then
    return null;
  end if;
  select * into s from public.campaign_steps
  where id = p_step and campaign_id = e.campaign_id and organization_id = e.organization_id and type::text = 'branch';
  if not found then
    return null;
  end if;
  select r.outcome into stored from public.campaign_branch_results r where r.enrollment_id = p_enrollment and r.step_id = p_step;
  if found then
    return stored;
  end if;
  if s.branch_condition = 'always' then
    v := true;
  elsif s.branch_condition = 'opened' then
    v := exists (
      select 1 from public.tracking_events t
      where t.organization_id = e.organization_id and t.campaign_id = e.campaign_id and t.contact_id = e.contact_id
        and t.counted and t.created_at >= e.created_at
    );
  elsif s.branch_condition = 'clicked' then
    v := exists (
      select 1 from public.tracking_events t
      where t.organization_id = e.organization_id and t.campaign_id = e.campaign_id and t.contact_id = e.contact_id
        and t.counted and t.type = 'click' and t.created_at >= e.created_at
    );
  elsif s.branch_condition = 'replied' then
    v := exists (
      select 1 from public.thread_messages tm
      join public.threads th on th.id = tm.thread_id and th.organization_id = tm.organization_id
      where th.organization_id = e.organization_id and th.campaign_id = e.campaign_id and th.contact_id = e.contact_id
        and tm.direction = 'in' and tm.kind = 'reply' and tm.created_at >= e.created_at
    );
  elsif s.branch_condition = 'visited_site' then
    v := exists (
      select 1 from public.site_page_views pv
      join public.site_visitors vis on vis.id = pv.visitor_id and vis.organization_id = pv.organization_id
      where vis.organization_id = e.organization_id and vis.contact_id = e.contact_id and pv.created_at >= e.created_at
        and (s.branch_tracker_id is null or pv.tracker_id = s.branch_tracker_id)
        and (s.branch_path is null or left(pv.path, char_length(s.branch_path)) = s.branch_path)
    );
  else
    v := false;
  end if;
  insert into public.campaign_branch_results (enrollment_id, step_id, organization_id, campaign_id, outcome)
  values (e.id, s.id, e.organization_id, e.campaign_id, v)
  on conflict do nothing;
  select r.outcome into stored from public.campaign_branch_results r where r.enrollment_id = p_enrollment and r.step_id = p_step;
  return stored;
end;
$$;

revoke all on function public.claim_send_batch(integer), public.claim_due_enrollments(integer),
  public.decide_branch(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_send_batch(integer), public.claim_due_enrollments(integer),
  public.decide_branch(uuid, uuid) to service_role;
