-- Records one public submission with optional files, double opt-in and notifications; the organization always comes from the form row.
-- The old submit_form signature stays and now calls the core, so the previous release keeps working on this schema.
create function public.submit_form_core(p_form uuid, p_bucket text, p_contact jsonb, p_answers jsonb, p_consented boolean, p_files jsonb) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_form public.forms%rowtype;
  v_email text;
  v_custom jsonb;
  v_hits integer;
  v_today integer;
  v_contact uuid;
  v_subscribed boolean;
  v_created boolean := false;
  v_first text := nullif(btrim(p_contact ->> 'first_name'), '');
  v_last text := nullif(btrim(p_contact ->> 'last_name'), '');
  v_company text := nullif(btrim(p_contact ->> 'company'), '');
  v_phone text := nullif(btrim(p_contact ->> 'phone'), '');
  v_rows integer;
  v_enrolled boolean := false;
  v_files jsonb := coalesce(p_files, '[]'::jsonb);
  v_file jsonb;
  v_bytes bigint := 0;
  v_ext text;
  v_fid uuid;
  v_path text;
  v_out jsonb := '[]'::jsonb;
  v_submission uuid;
  v_confirm uuid;
  v_pending boolean := false;
  v_suppressed boolean;
begin
  select * into v_form from public.forms where id = p_form and published;
  if not found then
    return jsonb_build_object('status', 'closed');
  end if;
  v_email := lower(btrim(p_contact ->> 'email'));
  if v_email is null or char_length(v_email) not between 3 and 320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_custom := coalesce(p_contact -> 'custom_fields', '{}'::jsonb);
  if jsonb_typeof(p_answers) is distinct from 'object' or jsonb_typeof(v_custom) <> 'object' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if p_bucket is null or char_length(p_bucket) not between 1 and 100 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if jsonb_typeof(v_files) <> 'array' or jsonb_array_length(v_files) > 3 then
    return jsonb_build_object('status', 'invalid');
  end if;
  for v_file in select * from jsonb_array_elements(v_files) loop
    if jsonb_typeof(v_file) <> 'object'
      or coalesce(v_file ->> 'type', '') not in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain')
      or coalesce(v_file ->> 'size', '') !~ '^[0-9]{1,7}$'
      or (v_file ->> 'size')::integer not between 1 and 3000000
      or char_length(coalesce(v_file ->> 'name', '')) not between 1 and 100
      or not exists (
        select 1 from jsonb_array_elements(v_form.fields) f
        where f ->> 'key' = v_file ->> 'key' and f ->> 'type' = 'file'
      )
      or (select count(*) from jsonb_array_elements(v_files) o where o ->> 'key' = v_file ->> 'key') > 1 then
      return jsonb_build_object('status', 'invalid');
    end if;
    v_bytes := v_bytes + (v_file ->> 'size')::integer;
  end loop;

  insert into public.form_rate_buckets (organization_id, form_id, bucket, window_start)
  values (v_form.organization_id, p_form, p_bucket, date_trunc('hour', now()))
  on conflict (form_id, bucket, window_start) do update set hits = public.form_rate_buckets.hits + 1
  returning hits into v_hits;
  delete from public.form_rate_buckets where form_id = p_form and window_start < now() - interval '1 day';
  if v_hits > 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select count(*) into v_today from public.form_submissions
  where form_id = p_form and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  if v_today >= v_form.daily_limit then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  -- Storage quotas: 50 MB per form per day and 300 MB per workspace.
  if v_bytes > 0 and (
    v_bytes + coalesce((select sum(size_bytes) from public.form_files where form_id = p_form and created_at > now() - interval '1 day' and status <> 'failed'), 0) > 50000000
    or v_bytes + coalesce((select sum(size_bytes) from public.form_files where organization_id = v_form.organization_id and status <> 'failed'), 0) > 300000000
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select id, subscribed into v_contact, v_subscribed from public.contacts where organization_id = v_form.organization_id and lower(email) = v_email;
  if v_contact is null then
    insert into public.contacts (organization_id, email, first_name, last_name, company, phone, custom_fields, subscribed)
    values (v_form.organization_id, v_email, v_first, v_last, v_company, v_phone, v_custom, not v_form.double_opt_in)
    on conflict do nothing
    returning id into v_contact;
    if v_contact is null then
      select id, subscribed into v_contact, v_subscribed from public.contacts where organization_id = v_form.organization_id and lower(email) = v_email;
    else
      v_created := true;
      v_subscribed := not v_form.double_opt_in;
    end if;
  end if;
  if v_contact is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not v_created then
    update public.contacts c set
      first_name = case when coalesce(btrim(c.first_name), '') = '' and v_first is not null then v_first else c.first_name end,
      last_name = case when coalesce(btrim(c.last_name), '') = '' and v_last is not null then v_last else c.last_name end,
      company = case when coalesce(btrim(c.company), '') = '' and v_company is not null then v_company else c.company end,
      phone = case when coalesce(btrim(c.phone), '') = '' and v_phone is not null then v_phone else c.phone end,
      custom_fields = v_custom || c.custom_fields
    where c.id = v_contact and c.organization_id = v_form.organization_id;
  end if;

  if not v_form.double_opt_in then
    if v_form.label_id is not null then
      insert into public.contact_labels (contact_id, label_id, organization_id)
      values (v_contact, v_form.label_id, v_form.organization_id)
      on conflict do nothing;
    end if;
    if v_form.campaign_id is not null then
      insert into public.campaign_contacts (campaign_id, contact_id, organization_id, next_send_at)
      select camp.id, c.id, camp.organization_id, now()
      from public.campaigns camp
      join public.contacts c on c.organization_id = camp.organization_id
      where camp.id = v_form.campaign_id
        and camp.organization_id = v_form.organization_id
        and camp.status <> 'completed'
        and c.id = v_contact
        and c.subscribed
        and not exists (
          select 1 from public.suppressed_recipients s
          where s.organization_id = c.organization_id and lower(s.email) = lower(c.email)
            and (s.expires_at is null or s.expires_at > now())
        )
      on conflict (campaign_id, contact_id) do nothing;
      get diagnostics v_rows = row_count;
      v_enrolled := v_rows > 0;
    end if;
  end if;

  insert into public.form_submissions (organization_id, form_id, contact_id, answers, consented, enrolled)
  values (v_form.organization_id, p_form, v_contact, p_answers, coalesce(p_consented, false), v_enrolled)
  returning id into v_submission;

  for v_file in select * from jsonb_array_elements(v_files) loop
    v_fid := gen_random_uuid();
    v_ext := case v_file ->> 'type'
      when 'application/pdf' then 'pdf'
      when 'image/png' then 'png'
      when 'image/jpeg' then 'jpg'
      when 'image/webp' then 'webp'
      else 'txt'
    end;
    v_path := v_form.organization_id::text || '/' || p_form::text || '/' || v_fid::text || '.' || v_ext;
    insert into public.form_files (id, organization_id, form_id, submission_id, field_key, storage_path, original_name, content_type, size_bytes)
    values (v_fid, v_form.organization_id, p_form, v_submission, v_file ->> 'key', v_path, v_file ->> 'name', v_file ->> 'type', (v_file ->> 'size')::integer);
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_fid, 'path', v_path, 'type', v_file ->> 'type'));
  end loop;

  -- Double opt-in: a new contact stays unsubscribed, and label and enrollment wait for the link. A contact who unsubscribed on their own gets no mail.
  if v_form.double_opt_in then
    v_pending := v_created or exists (
      select 1 from public.form_confirmations fc
      where fc.form_id = p_form and fc.contact_id = v_contact and fc.contact_was_pending and fc.confirmed_at is null
    );
    select exists (
      select 1 from public.suppressed_recipients s
      where s.organization_id = v_form.organization_id and lower(s.email) = v_email
        and (s.expires_at is null or s.expires_at > now())
    ) into v_suppressed;
    if (v_subscribed or v_pending) and not v_suppressed
      and v_form.mail_mailbox_id is not null
      and not exists (
        select 1 from public.form_confirmations fc
        where fc.form_id = p_form and fc.contact_id = v_contact and fc.confirmed_at is null and fc.created_at > now() - interval '1 hour'
      ) then
      insert into public.form_confirmations (organization_id, form_id, contact_id, submission_id, contact_was_pending)
      values (v_form.organization_id, p_form, v_contact, v_submission, v_pending)
      returning id into v_confirm;
      insert into public.form_mail_jobs (organization_id, form_id, submission_id, kind, confirmation_id)
      values (v_form.organization_id, p_form, v_submission, 'confirm', v_confirm);
    end if;
  end if;

  -- Notifications: at most 20 submissions per form per UTC day, to at most 5 members.
  if v_form.notify_enabled and v_form.mail_mailbox_id is not null
    and (
      select count(distinct submission_id) from public.form_mail_jobs
      where form_id = p_form and kind = 'notify' and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
    ) < 20 then
    insert into public.form_mail_jobs (organization_id, form_id, submission_id, kind, recipient_user_id)
    select v_form.organization_id, p_form, v_submission, 'notify', r.user_id
    from public.form_notify_recipients r
    where r.form_id = p_form and r.organization_id = v_form.organization_id
    order by r.created_at
    limit 5;
  end if;

  return jsonb_build_object('status', 'ok', 'submission_id', v_submission, 'files', v_out);
end;
$$;

create or replace function public.submit_form(p_form uuid, p_bucket text, p_contact jsonb, p_answers jsonb, p_consented boolean) returns text
language sql security definer
set search_path = ''
as $$
  select public.submit_form_core(p_form, p_bucket, p_contact, p_answers, p_consented, '[]'::jsonb) ->> 'status';
$$;

create function public.submit_form_files(p_form uuid, p_bucket text, p_contact jsonb, p_answers jsonb, p_consented boolean, p_files jsonb) returns jsonb
language sql security definer
set search_path = ''
as $$
  select public.submit_form_core(p_form, p_bucket, p_contact, p_answers, p_consented, p_files);
$$;

-- Confirms one double opt-in link once; the contact is subscribed only when this form created it as pending.
create function public.confirm_form_optin(p_confirmation uuid) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  c public.form_confirmations%rowtype;
  v_form public.forms%rowtype;
  v_rows integer;
  v_enrolled boolean := false;
  v_suppressed boolean;
  v_email text;
begin
  select * into c from public.form_confirmations where id = p_confirmation for update;
  if not found then
    return 'invalid';
  end if;
  if c.confirmed_at is not null then
    return 'used';
  end if;
  if c.expires_at <= now() then
    return 'expired';
  end if;
  select * into v_form from public.forms where id = c.form_id and organization_id = c.organization_id;
  select lower(email) into v_email from public.contacts where id = c.contact_id and organization_id = c.organization_id;
  if v_email is null then
    return 'invalid';
  end if;
  update public.form_confirmations set confirmed_at = now() where id = c.id;
  select exists (
    select 1 from public.suppressed_recipients s
    where s.organization_id = c.organization_id and lower(s.email) = v_email
      and (s.expires_at is null or s.expires_at > now())
  ) into v_suppressed;
  if not v_suppressed then
    if c.contact_was_pending then
      update public.contacts set subscribed = true where id = c.contact_id and organization_id = c.organization_id and not subscribed;
    end if;
    if v_form.label_id is not null then
      insert into public.contact_labels (contact_id, label_id, organization_id)
      values (c.contact_id, v_form.label_id, c.organization_id)
      on conflict do nothing;
    end if;
    if v_form.campaign_id is not null then
      insert into public.campaign_contacts (campaign_id, contact_id, organization_id, next_send_at)
      select camp.id, ct.id, camp.organization_id, now()
      from public.campaigns camp
      join public.contacts ct on ct.organization_id = camp.organization_id
      where camp.id = v_form.campaign_id
        and camp.organization_id = c.organization_id
        and camp.status <> 'completed'
        and ct.id = c.contact_id
        and ct.subscribed
      on conflict (campaign_id, contact_id) do nothing;
      get diagnostics v_rows = row_count;
      v_enrolled := v_rows > 0;
    end if;
  end if;
  update public.form_submissions set optin_confirmed_at = now(), enrolled = v_enrolled
  where id = c.submission_id and organization_id = c.organization_id;
  return 'ok';
end;
$$;

revoke all on function public.submit_form_core(uuid, text, jsonb, jsonb, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.submit_form(uuid, text, jsonb, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.submit_form_files(uuid, text, jsonb, jsonb, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.confirm_form_optin(uuid) from public, anon, authenticated;
grant execute on function public.submit_form(uuid, text, jsonb, jsonb, boolean) to service_role;
grant execute on function public.submit_form_files(uuid, text, jsonb, jsonb, boolean, jsonb) to service_role;
grant execute on function public.confirm_form_optin(uuid) to service_role;
