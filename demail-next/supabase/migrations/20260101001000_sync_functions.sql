-- Mailbox sync queue, stop on reply, and the hot/idle polling flag. Service role only.
-- Leases due mailboxes for 5 minutes so overlapping ticks never pick the same one.
create function public.claim_due_mailbox_syncs(batch integer, p_org uuid default null) returns setof public.mailbox_sync_state
language sql security definer
set search_path = ''
as $$
  with due as (
    select s.mailbox_id
    from public.mailbox_sync_state s
    join public.mailboxes m on m.id = s.mailbox_id
    where m.status = 'active' and m.provider in ('google', 'microsoft')
      and s.next_sync_at <= now()
      and (p_org is null or s.organization_id = p_org)
    order by s.next_sync_at
    limit greatest(batch, 0)
    for update of s skip locked
  )
  update public.mailbox_sync_state s
  set next_sync_at = now() + interval '5 minutes'
  from due
  where s.mailbox_id = due.mailbox_id
  returning s.*;
$$;

create function public.stop_enrollments_on_reply(p_org uuid, p_contact uuid, p_campaign uuid default null) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.campaign_contacts cc
  set status = 'stopped', next_send_at = null, stopped_reason = 'replied'
  from public.campaigns c
  where c.id = cc.campaign_id
    and c.stop_on_reply
    and cc.organization_id = p_org
    and cc.contact_id = p_contact
    and cc.status = 'active'
    and (p_campaign is null or cc.campaign_id = p_campaign);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Mailboxes in an active campaign with active enrollments are polled every minute, the rest less often.
create function public.refresh_sync_hotness() returns void
language sql security definer
set search_path = ''
as $$
  update public.mailbox_sync_state s
  set hot = exists (
    select 1
    from public.campaign_mailboxes cm
    join public.campaign_contacts cc on cc.campaign_id = cm.campaign_id and cc.status = 'active'
    where cm.mailbox_id = s.mailbox_id
  );
$$;

revoke all on function public.claim_due_mailbox_syncs(integer, uuid), public.stop_enrollments_on_reply(uuid, uuid, uuid),
  public.refresh_sync_hotness() from public, anon, authenticated;
grant execute on function public.claim_due_mailbox_syncs(integer, uuid), public.stop_enrollments_on_reply(uuid, uuid, uuid),
  public.refresh_sync_hotness() to service_role;
