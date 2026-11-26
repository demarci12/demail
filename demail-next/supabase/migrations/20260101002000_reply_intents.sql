-- Opt-in AI reply classification: a service-written queue and the latest intent on each thread; no action is taken on a verdict.
alter table public.thread_messages add constraint thread_messages_id_org_key unique (id, organization_id);
create index thread_messages_reply_created_idx on public.thread_messages (created_at) where direction = 'in' and kind = 'reply';
alter table public.threads add column intent text check (
  intent is null or intent in ('interested', 'meeting', 'question', 'not_interested', 'unsubscribe', 'out_of_office', 'referral', 'other')
);
create table public.reply_intents (
  thread_message_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  thread_id uuid not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  intent text check (
    intent is null or intent in ('interested', 'meeting', 'question', 'not_interested', 'unsubscribe', 'out_of_office', 'referral', 'other')
  ),
  summary text check (summary is null or char_length(summary) <= 300),
  attempts smallint not null default 1,
  lease_until timestamptz,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (thread_message_id, organization_id) references public.thread_messages (id, organization_id) on delete cascade,
  foreign key (thread_id, organization_id) references public.threads (id, organization_id) on delete cascade
);
create index reply_intents_retry_idx on public.reply_intents (next_attempt_at) where status <> 'done';
create index reply_intents_thread_idx on public.reply_intents (thread_id);
create trigger reply_intents_updated_at before update on public.reply_intents
  for each row execute function public.set_updated_at();
create trigger reply_intents_org_immutable before update on public.reply_intents
  for each row execute function public.prevent_org_change();
alter table public.reply_intents enable row level security;
create policy reply_intents_select on public.reply_intents for select to authenticated
  using (public.is_org_member(organization_id));
revoke insert, update, delete on public.reply_intents from anon, authenticated;
grant all on public.reply_intents to service_role;
-- Queues new replies of opted-in workspaces (never before classify_enabled_at or older than 3 days) and leases due retries.
create function public.claim_reply_classifications(batch integer)
returns setof public.reply_intents
language sql
security definer
set search_path = ''
as $$
  with fresh as (
    insert into public.reply_intents (thread_message_id, organization_id, thread_id, status, attempts, lease_until)
    select tm.id, tm.organization_id, tm.thread_id, 'running', 1, now() + interval '5 minutes'
    from public.thread_messages tm
    join public.ai_settings s
      on s.organization_id = tm.organization_id and s.enabled and s.classify_replies and s.classify_enabled_at is not null
    where tm.direction = 'in'
      and tm.kind = 'reply'
      and tm.created_at >= greatest(s.classify_enabled_at, now() - interval '3 days')
      and not exists (select 1 from public.reply_intents r where r.thread_message_id = tm.id)
    order by tm.created_at
    limit greatest(batch, 0)
    on conflict (thread_message_id) do nothing
    returning *
  ),
  retry as (
    update public.reply_intents r
    set status = 'running', attempts = r.attempts + 1, lease_until = now() + interval '5 minutes'
    where r.thread_message_id in (
      select r2.thread_message_id
      from public.reply_intents r2
      join public.ai_settings s2 on s2.organization_id = r2.organization_id and s2.enabled and s2.classify_replies
      where r2.attempts < 3
        and ((r2.status = 'failed' and r2.next_attempt_at <= now()) or (r2.status = 'running' and r2.lease_until < now()))
      order by r2.next_attempt_at nulls first
      limit greatest(batch, 0)
      for update of r2 skip locked
    )
    returning r.*
  )
  select * from fresh
  union all
  select * from retry;
$$;
revoke all on function public.claim_reply_classifications(integer) from public, anon, authenticated;
grant execute on function public.claim_reply_classifications(integer) to service_role;
