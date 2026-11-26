-- Hosted lead-capture forms. Public submissions are written only by submit_form, inside the form's own organization.
create table public.forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  slug text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16) check (slug ~ '^[A-Za-z0-9_-]{8,32}$'),
  published boolean not null default false,
  title text not null default '' check (char_length(title) <= 200),
  intro text not null default '' check (char_length(intro) <= 2000),
  submit_label text not null default 'Submit' check (char_length(btrim(submit_label)) between 1 and 40),
  success_message text not null default 'Thanks, we got your details.' check (char_length(btrim(success_message)) between 1 and 500),
  consent_text text check (consent_text is null or char_length(btrim(consent_text)) between 1 and 1000),
  fields jsonb not null default '[{"key":"email","label":"Email","type":"email","required":true,"maps_to":"email"},{"key":"first_name","label":"First name","type":"text","required":false,"maps_to":"first_name"}]'::jsonb
    check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) between 1 and 20),
  accent_color text not null default '#0284c7' check (accent_color ~ '^#[0-9a-f]{6}$'),
  layout text not null default 'card' check (layout in ('card', 'plain')),
  label_id uuid,
  campaign_id uuid,
  daily_limit integer not null default 200 check (daily_limit between 1 and 10000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (label_id, organization_id) references public.labels (id, organization_id) on delete set null (label_id),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete set null (campaign_id)
);
create index forms_org_idx on public.forms (organization_id, created_at desc);
create trigger forms_updated_at before update on public.forms
  for each row execute function public.set_updated_at();
create trigger forms_org_immutable before update on public.forms
  for each row execute function public.prevent_org_change();
alter table public.forms enable row level security;
create policy forms_select on public.forms for select to authenticated
  using (public.is_org_member(organization_id));
create policy forms_insert on public.forms for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy forms_update on public.forms for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy forms_delete on public.forms for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  form_id uuid not null,
  contact_id uuid not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  consented boolean not null default false,
  enrolled boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (form_id, organization_id) references public.forms (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete cascade
);
create index form_submissions_form_idx on public.form_submissions (form_id, created_at desc);
create index form_submissions_contact_idx on public.form_submissions (contact_id);
create trigger form_submissions_org_immutable before update on public.form_submissions
  for each row execute function public.prevent_org_change();
alter table public.form_submissions enable row level security;
create policy form_submissions_select on public.form_submissions for select to authenticated
  using (public.is_org_member(organization_id));
create policy form_submissions_delete on public.form_submissions for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
revoke insert, update on public.form_submissions from anon, authenticated;
grant all on public.form_submissions to service_role;

-- Hourly submission counters keyed by an HMAC of form, address prefix and day; no IP address is stored.
create table public.form_rate_buckets (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  form_id uuid not null,
  bucket text not null check (char_length(bucket) between 1 and 100),
  window_start timestamptz not null,
  hits integer not null default 1,
  primary key (form_id, bucket, window_start),
  foreign key (form_id, organization_id) references public.forms (id, organization_id) on delete cascade
);
alter table public.form_rate_buckets enable row level security;
revoke all on public.form_rate_buckets from anon, authenticated;
grant all on public.form_rate_buckets to service_role;

-- Records one public submission; the organization always comes from the form row.
create function public.submit_form(p_form uuid, p_bucket text, p_contact jsonb, p_answers jsonb, p_consented boolean) returns text
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
  v_created boolean := false;
  v_first text := nullif(btrim(p_contact ->> 'first_name'), '');
  v_last text := nullif(btrim(p_contact ->> 'last_name'), '');
  v_company text := nullif(btrim(p_contact ->> 'company'), '');
  v_phone text := nullif(btrim(p_contact ->> 'phone'), '');
  v_rows integer;
  v_enrolled boolean := false;
begin
  select * into v_form from public.forms where id = p_form and published;
  if not found then
    return 'closed';
  end if;
  v_email := lower(btrim(p_contact ->> 'email'));
  if v_email is null or char_length(v_email) not between 3 and 320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return 'invalid';
  end if;
  v_custom := coalesce(p_contact -> 'custom_fields', '{}'::jsonb);
  if jsonb_typeof(p_answers) is distinct from 'object' or jsonb_typeof(v_custom) <> 'object' then
    return 'invalid';
  end if;
  if p_bucket is null or char_length(p_bucket) not between 1 and 100 then
    return 'invalid';
  end if;

  insert into public.form_rate_buckets (organization_id, form_id, bucket, window_start)
  values (v_form.organization_id, p_form, p_bucket, date_trunc('hour', now()))
  on conflict (form_id, bucket, window_start) do update set hits = public.form_rate_buckets.hits + 1
  returning hits into v_hits;
  delete from public.form_rate_buckets where form_id = p_form and window_start < now() - interval '1 day';
  if v_hits > 5 then
    return 'rate_limited';
  end if;
  select count(*) into v_today from public.form_submissions
  where form_id = p_form and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  if v_today >= v_form.daily_limit then
    return 'rate_limited';
  end if;

  select id into v_contact from public.contacts where organization_id = v_form.organization_id and lower(email) = v_email;
  if v_contact is null then
    insert into public.contacts (organization_id, email, first_name, last_name, company, phone, custom_fields, subscribed)
    values (v_form.organization_id, v_email, v_first, v_last, v_company, v_phone, v_custom, true)
    on conflict do nothing
    returning id into v_contact;
    if v_contact is null then
      select id into v_contact from public.contacts where organization_id = v_form.organization_id and lower(email) = v_email;
    else
      v_created := true;
    end if;
  end if;
  if v_contact is null then
    return 'invalid';
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

  insert into public.form_submissions (organization_id, form_id, contact_id, answers, consented, enrolled)
  values (v_form.organization_id, p_form, v_contact, p_answers, coalesce(p_consented, false), v_enrolled);
  return 'ok';
end;
$$;
revoke all on function public.submit_form(uuid, text, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.submit_form(uuid, text, jsonb, jsonb, boolean) to service_role;
