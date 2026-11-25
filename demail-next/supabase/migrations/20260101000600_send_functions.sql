-- Enrollment, the claim queue used by the sender, and the daily send counter.
create function public.enroll_contacts(p_campaign uuid, p_contact_ids uuid[]) returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.campaign_contacts (campaign_id, contact_id, organization_id, next_send_at)
  select camp.id, c.id, camp.organization_id, now()
  from public.campaigns camp
  join public.contacts c on c.organization_id = camp.organization_id
  where camp.id = p_campaign
    and c.id = any (p_contact_ids)
    and c.subscribed
    and not exists (
      select 1 from public.suppressed_recipients s
      where s.organization_id = c.organization_id and lower(s.email) = lower(c.email)
        and (s.expires_at is null or s.expires_at > now())
    )
  on conflict (campaign_id, contact_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Leases due rows for 10 minutes so concurrent ticks never pick the same enrollment.
create function public.claim_due_enrollments(batch integer) returns setof public.campaign_contacts
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

create function public.count_sent_today(p_mailbox uuid) returns integer
language sql stable
set search_path = ''
as $$
  select count(*)::integer
  from public.messages m
  join public.mailboxes mb on mb.id = m.mailbox_id
  where mb.id = p_mailbox
    and m.status = 'sent'
    and m.sent_at >= (date_trunc('day', now() at time zone mb.timezone) at time zone mb.timezone);
$$;

revoke all on function public.enroll_contacts(uuid, uuid[]), public.claim_due_enrollments(integer),
  public.count_sent_today(uuid) from public, anon, authenticated;
grant execute on function public.enroll_contacts(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.claim_due_enrollments(integer), public.count_sent_today(uuid) to service_role;
