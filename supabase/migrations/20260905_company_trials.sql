-- Additive company CRM. Existing contacts, pipelines and activities are untouched.
begin;
create extension if not exists btree_gist;

create function public.crm_trial_end(start_date date) returns date
language plpgsql immutable strict set search_path = public as $$
declare result date := start_date; remaining integer := 2;
begin
  if extract(isodow from start_date) > 5 then
    raise exception 'Trials must start on a weekday' using errcode = '23514';
  end if;
  while remaining > 0 loop
    result := result + 1;
    if extract(isodow from result) <= 5 then remaining := remaining - 1; end if;
  end loop;
  return result;
end;
$$;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 500),
  phone text not null default '',
  city text not null default '',
  state text not null default '',
  industry text not null default '',
  contact_name text not null default '',
  fit_notes text not null default '',
  source text not null default '',
  stage text not null default 'new' check (stage in ('new','contacted','engaged','qualified','trial_booked','trial_active','trial_completed','client','disqualified')),
  needs_verification boolean not null default false,
  trial_type text check (trial_type in ('inbound','outbound')),
  trial_start_date date,
  trial_end_date date,
  trial_capacity_slot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint complete_trial_window check (
    (trial_start_date is null and trial_end_date is null and trial_capacity_slot is null)
    or (trial_start_date is not null and trial_end_date is not null and trial_type is not null
      and trial_capacity_slot is not null and length(btrim(trial_capacity_slot)) > 0
      and trial_end_date = public.crm_trial_end(trial_start_date))
  ),
  constraint trial_stage_requires_dates check (
    stage not in ('trial_booked','trial_active','trial_completed') or trial_start_date is not null
  ),
  constraint solo_inbound_slot check (
    trial_type is distinct from 'inbound' or trial_start_date is null or trial_capacity_slot = 'solo-inbound'
  ),
  -- Inclusive windows, enforced atomically for concurrent bookings. Outbound is independent.
  constraint no_overlapping_inbound_trials exclude using gist (
    daterange(trial_start_date, trial_end_date, '[]') with &&
  ) where (trial_type = 'inbound' and stage in ('trial_booked','trial_active'))
);
create index companies_stage_idx on public.companies(stage);
create index companies_trial_start_idx on public.companies(trial_start_date) where trial_start_date is not null;

create function public.crm_company_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger crm_company_updated_at before update on public.companies
for each row execute function public.crm_company_updated_at();

create table public.company_activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  direction text not null check (direction in ('inbound','outbound')),
  outcome text not null check (outcome in ('no_answer','voicemail','not_interested','conversation','qualified','trial_booked','callback_requested','appointment_booked')),
  response_time_minutes double precision check (
    response_time_minutes >= 0 and response_time_minutes < 'Infinity'::double precision
  ),
  notes text not null default '',
  occurred_at timestamptz not null default now(),
  logged_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint inbound_response_only check (direction = 'inbound' or response_time_minutes is null)
);
create index company_activity_timeline_idx on public.company_activities(company_id, occurred_at desc, id desc);
create index company_activity_occurred_idx on public.company_activities(occurred_at);

-- Reuse existing Supabase roles and pipeline page permission; this is one internal workspace.
create function public.crm_can_access(write_access boolean default false) returns boolean
language sql stable set search_path = public as $$
  select auth.uid() is not null
    and coalesce(auth.jwt()->'user_metadata'->>'status', 'active') not in ('inactive','deactivated')
    and nullif(auth.jwt()->'user_metadata'->>'client_account_id', '') is null
    and (not write_access or coalesce(auth.jwt()->'user_metadata'->>'role','member') <> 'viewer')
    and (auth.jwt()->'user_metadata'->>'role' = 'owner'
      or auth.jwt()->'user_metadata'->'page_permissions' is null
      or auth.jwt()->'user_metadata'->'page_permissions' = 'null'::jsonb
      or auth.jwt()->'user_metadata'->'page_permissions' ? 'pipeline');
$$;
alter table public.companies enable row level security;
alter table public.company_activities enable row level security;
revoke all on public.companies, public.company_activities from anon, authenticated;
grant select, insert, update on public.companies to authenticated;
grant select, insert on public.company_activities to authenticated;
create policy crm_company_read on public.companies for select to authenticated using (public.crm_can_access());
create policy crm_company_insert on public.companies for insert to authenticated with check (public.crm_can_access(true));
create policy crm_company_update on public.companies for update to authenticated using (public.crm_can_access(true)) with check (public.crm_can_access(true));
create policy crm_activity_read on public.company_activities for select to authenticated using (public.crm_can_access());
create policy crm_activity_insert on public.company_activities for insert to authenticated
with check (public.crm_can_access(true) and logged_by = auth.uid());

-- Aggregate in PostgreSQL so API row limits never truncate KPIs. Day boundaries use the selected timezone.
create function public.company_crm_kpis(from_date date, to_date date, report_timezone text)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare result jsonb;
begin
  if from_date is null or to_date is null or to_date < from_date or to_date - from_date > 366 then
    raise exception 'Select a report window of at most 367 days' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_timezone_names where name = report_timezone) then
    raise exception 'Invalid report timezone' using errcode = '22023';
  end if;
  with days as (
    select from_date + n as day from generate_series(0, to_date - from_date) n
  ), daily as (
    select (occurred_at at time zone report_timezone)::date as day,
      count(*) filter (where direction = 'outbound') as outbound_dials,
      count(*) filter (where direction = 'inbound') as inbound_leads,
      count(*) filter (where outcome = 'appointment_booked') as appointments_booked,
      avg(response_time_minutes) filter (where direction = 'inbound') as average_response_minutes,
      count(response_time_minutes) filter (where direction = 'inbound') as response_samples
    from public.company_activities
    where occurred_at >= (from_date::timestamp at time zone report_timezone)
      and occurred_at < ((to_date + 1)::timestamp at time zone report_timezone)
    group by 1
  )
  select jsonb_build_object(
    'daily', (select jsonb_agg(jsonb_build_object('day', days.day,
      'outbound_dials', coalesce(daily.outbound_dials, 0), 'inbound_leads', coalesce(daily.inbound_leads, 0),
      'appointments_booked', coalesce(daily.appointments_booked, 0),
      'average_response_minutes', daily.average_response_minutes, 'response_samples', coalesce(daily.response_samples, 0)) order by days.day)
      from days left join daily using (day)),
    'trials_active', (select count(*) from public.companies where stage = 'trial_active'),
    'trials_awaiting_close', (select count(*) from public.companies where stage = 'trial_completed')
  ) into result;
  return result;
end;
$$;
revoke all on function public.company_crm_kpis(date,date,text) from public, anon;
grant execute on function public.company_crm_kpis(date,date,text) to authenticated;
notify pgrst, 'reload schema';
commit;
