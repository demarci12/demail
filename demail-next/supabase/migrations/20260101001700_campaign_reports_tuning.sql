-- Reply attribution through an indexed lateral lookup, and a blank check that matches JS trim; same signatures, still security invoker.
create or replace function public.campaign_message_stats(p_campaign uuid)
returns table (step_id uuid, variant_id uuid, mailbox_id uuid, sent bigint, opened bigint, clicked bigint, replied bigint, bounced bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with sent as (
    select m.id, m.step_id, m.variant_id, m.mailbox_id, m.contact_id, m.sent_at
    from public.messages m
    where m.campaign_id = p_campaign and m.status = 'sent'
  ),
  first_replies as (
    select tm.thread_id, t.contact_id, min(tm.sent_at) as at
    from public.thread_messages tm
    join public.threads t on t.id = tm.thread_id and t.organization_id = tm.organization_id
    where t.campaign_id = p_campaign and t.contact_id is not null and tm.kind = 'reply'
    group by tm.thread_id, t.contact_id
  ),
  replied as (
    select distinct l.id as message_id
    from first_replies r
    cross join lateral (
      select m.id from public.messages m
      where m.contact_id = r.contact_id and m.campaign_id = p_campaign and m.status = 'sent' and m.sent_at <= r.at
      order by m.sent_at desc
      limit 1
    ) l
  )
  select
    s.step_id,
    s.variant_id,
    s.mailbox_id,
    count(*)::bigint,
    (count(*) filter (where exists (
      select 1 from public.tracking_events e where e.message_id = s.id and e.counted
    )))::bigint,
    (count(*) filter (where exists (
      select 1 from public.tracking_events e where e.message_id = s.id and e.counted and e.type = 'click'
    )))::bigint,
    (count(*) filter (where s.id in (select r.message_id from replied r)))::bigint,
    (count(*) filter (where exists (
      select 1 from public.delivery_events d where d.message_id = s.id and d.type = 'bounce'
    )))::bigint
  from sent s
  group by s.step_id, s.variant_id, s.mailbox_id;
$$;
revoke all on function public.campaign_message_stats(uuid) from public, anon;
grant execute on function public.campaign_message_stats(uuid) to authenticated, service_role;
-- The character class is the set JS String.prototype.trim strips, so review and send agree on blank.
create or replace function public.campaign_missing_merge_fields(p_campaign uuid, p_fields text[])
returns table (contact_id uuid, email text, missing text[], total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with checked as (
    select
      c.id,
      c.email,
      array(
        select f
        from unnest(p_fields) as f
        where coalesce(case f
          when 'email' then c.email
          when 'first_name' then c.first_name
          when 'last_name' then c.last_name
          when 'company' then c.company
          when 'phone' then c.phone
          else case when jsonb_typeof(c.custom_fields -> f) = 'string' then c.custom_fields ->> f end
        end, '') ~ '^[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*$'
      ) as missing
    from public.campaign_contacts cc
    join public.contacts c on c.id = cc.contact_id and c.organization_id = cc.organization_id
    where cc.campaign_id = p_campaign and cc.status = 'active'
  )
  select k.id, k.email, k.missing, count(*) over ()
  from checked k
  where cardinality(k.missing) > 0
  order by k.email
  limit 20;
$$;
revoke all on function public.campaign_missing_merge_fields(uuid, text[]) from public, anon;
grant execute on function public.campaign_missing_merge_fields(uuid, text[]) to authenticated, service_role;
