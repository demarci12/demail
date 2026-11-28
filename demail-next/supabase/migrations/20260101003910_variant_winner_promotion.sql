-- Winner promotion: an opt-in per email step. After every variant has a minimum sample, the variant with the best reply rate is promoted when it beats each other variant in a two-sided 95% two-proportion z-test.
alter table public.campaign_steps
  add column promote_winner boolean not null default false,
  add column promote_min_sample integer not null default 100 check (promote_min_sample between 30 and 100000),
  add column promoted_label text check (promoted_label is null or promoted_label ~ '^[A-Z]$'),
  add column promoted_at timestamptz,
  add column promotion_decision jsonb,
  add constraint campaign_steps_promote_email_check check (not promote_winner or type::text = 'email');

-- Members switch promotion on and off; only the scheduler writes a decision, and only undo_promotion clears one.
create function public.guard_step_promotion() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.promoted_label := old.promoted_label;
    new.promoted_at := old.promoted_at;
    new.promotion_decision := old.promotion_decision;
  end if;
  return new;
end;
$$;
create trigger campaign_steps_guard_promotion before update on public.campaign_steps
  for each row execute function public.guard_step_promotion();

-- The state of the test for one step: reply counts per variant and whether one variant has clearly won. Variant A is the step itself.
create function public.evaluate_step_promotion(p_step uuid) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  s public.campaign_steps%rowtype;
  rows_json jsonb;
  best record;
  other record;
  cnt integer;
  z double precision;
  zmin double precision := null;
  p double precision;
  p1 double precision;
  p2 double precision;
  se double precision;
begin
  select * into s from public.campaign_steps where id = p_step;
  if not found or s.type::text <> 'email' then
    return null;
  end if;
  with stats as (
    select coalesce(v.label, 'A') as label, coalesce(sum(m.sent), 0)::bigint as sent, coalesce(sum(m.replied), 0)::bigint as replied
    from public.campaign_message_stats(s.campaign_id) m
    left join public.campaign_step_variants v on v.id = m.variant_id and v.organization_id = s.organization_id
    where m.step_id = p_step and (m.variant_id is null or v.active)
    group by coalesce(v.label, 'A')
  ),
  labels as (
    select 'A'::text as label
    union
    select v.label from public.campaign_step_variants v where v.step_id = p_step and v.active
  )
  select coalesce(jsonb_agg(jsonb_build_object('label', l.label, 'sent', coalesce(st.sent, 0), 'replied', coalesce(st.replied, 0)) order by l.label), '[]'::jsonb)
  into rows_json
  from labels l left join stats st on st.label = l.label;
  cnt := jsonb_array_length(rows_json);
  if cnt < 2 then
    return jsonb_build_object('reason', 'one_variant', 'min_sample', s.promote_min_sample, 'rows', rows_json);
  end if;
  if exists (select 1 from jsonb_to_recordset(rows_json) as x(label text, sent bigint, replied bigint) where x.sent < s.promote_min_sample) then
    return jsonb_build_object('reason', 'sample', 'min_sample', s.promote_min_sample, 'rows', rows_json);
  end if;
  select * into best from jsonb_to_recordset(rows_json) as x(label text, sent bigint, replied bigint) order by x.replied::double precision / x.sent desc, x.label limit 1;
  for other in select * from jsonb_to_recordset(rows_json) as x(label text, sent bigint, replied bigint) where x.label <> best.label loop
    p1 := best.replied::double precision / best.sent;
    p2 := other.replied::double precision / other.sent;
    p := (best.replied + other.replied)::double precision / (best.sent + other.sent);
    se := sqrt(p * (1 - p) * (1.0 / best.sent + 1.0 / other.sent));
    if best.replied + other.replied < 10 or se = 0 or p1 <= p2 then
      z := 0;
    else
      z := (p1 - p2) / se;
    end if;
    zmin := least(coalesce(zmin, z), z);
  end loop;
  if zmin >= 1.96 then
    return jsonb_build_object('reason', 'winner', 'winner', best.label, 'z', round(zmin::numeric, 2), 'min_sample', s.promote_min_sample, 'rows', rows_json);
  end if;
  return jsonb_build_object('reason', 'no_clear_winner', 'z', round(coalesce(zmin, 0)::numeric, 2), 'min_sample', s.promote_min_sample, 'rows', rows_json);
end;
$$;

-- Promotes every step that has a clear winner. Runs from pg_cron.
create function public.promote_variant_winners() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  d jsonb;
  total integer := 0;
begin
  for s in
    select st.id from public.campaign_steps st
    join public.campaigns c on c.id = st.campaign_id and c.organization_id = st.organization_id
    where st.promote_winner and st.promoted_label is null and c.status = 'active'
    order by st.id
    limit 200
  loop
    d := public.evaluate_step_promotion(s.id);
    if d ->> 'reason' = 'winner' then
      update public.campaign_steps
      set promoted_label = d ->> 'winner', promoted_at = now(), promotion_decision = d || jsonb_build_object('decided_at', now())
      where id = s.id and promote_winner and promoted_label is null;
      if found then
        total := total + 1;
      end if;
    end if;
  end loop;
  return total;
end;
$$;

-- A member undoes a promotion: every variant sends again and promotion is switched off for the step.
create function public.undo_promotion(p_step uuid) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
begin
  select organization_id into org from public.campaign_steps where id = p_step and promoted_label is not null;
  if not found or not public.is_org_member(org) then
    return false;
  end if;
  update public.campaign_steps
  set promoted_label = null, promoted_at = null, promote_winner = false,
      promotion_decision = coalesce(promotion_decision, '{}'::jsonb) || jsonb_build_object('undone_at', now())
  where id = p_step;
  return true;
end;
$$;

revoke all on function public.guard_step_promotion(), public.promote_variant_winners(), public.undo_promotion(uuid) from public, anon, authenticated;
revoke all on function public.evaluate_step_promotion(uuid) from public, anon;
grant execute on function public.evaluate_step_promotion(uuid) to authenticated, service_role;
grant execute on function public.promote_variant_winners() to service_role;
grant execute on function public.undo_promotion(uuid) to authenticated, service_role;
