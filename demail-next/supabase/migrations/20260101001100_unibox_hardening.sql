-- Members may change only status and unread state on a thread; matching columns are service-written.
revoke update on public.threads from authenticated;
grant update (status, is_unread) on public.threads to authenticated;

-- Write only rows whose hotness changed, to avoid a dead tuple per mailbox per tick.
create or replace function public.refresh_sync_hotness() returns void
language sql security definer
set search_path = ''
as $$
  update public.mailbox_sync_state s
  set hot = h.hot
  from (
    select s2.mailbox_id, exists (
      select 1
      from public.campaign_mailboxes cm
      join public.campaign_contacts cc on cc.campaign_id = cm.campaign_id and cc.status = 'active'
      where cm.mailbox_id = s2.mailbox_id
    ) as hot
    from public.mailbox_sync_state s2
  ) h
  where s.mailbox_id = h.mailbox_id and s.hot is distinct from h.hot;
$$;
