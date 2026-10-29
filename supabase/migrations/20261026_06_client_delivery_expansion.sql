begin;

create table if not exists public.ad_spend_entries (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.sub_accounts(id) on delete cascade,
  platform text not null check (platform in ('google_ads','meta_ads','local_services','other')),
  month date not null check (extract(day from month)=1),
  amount_cents bigint not null check (amount_cents>=0),
  source text not null default 'manual' check (source in ('manual','api')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_account_id,platform,month)
);
create index if not exists ad_spend_entries_account_month_idx on public.ad_spend_entries(client_account_id,month);
alter table public.ad_spend_entries enable row level security;
drop policy if exists ad_spend_entries_read on public.ad_spend_entries;
create policy ad_spend_entries_read on public.ad_spend_entries for select to authenticated
  using (public.can_access_account(client_account_id) and public.portal_page_allowed('reports'));

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references public.automation_workflows(id) on delete set null,
  job_id uuid unique references public.client_automation_jobs(id) on delete set null,
  client_account_id uuid not null references public.sub_accounts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  status text not null check(status in ('running','sent','cancelled','failed')),
  step text not null,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists automation_runs_account_started_idx on public.automation_runs(client_account_id,started_at desc);
alter table public.automation_runs enable row level security;
drop policy if exists automation_runs_read on public.automation_runs;
create policy automation_runs_read on public.automation_runs for select to authenticated
  using (public.is_agency_admin() or (public.is_agency() and public.can_access_account(client_account_id)));

create table if not exists public.client_call_details (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.sub_accounts(id) on delete cascade,
  external_call_id text not null,
  lead_id uuid references public.leads(id) on delete set null,
  occurred_at timestamptz not null,
  caller_number text,
  business_number text,
  status text,
  direction text,
  duration_seconds integer check(duration_seconds>=0),
  recording_url text,
  agent_name text,
  outcome text check(outcome in ('booked','message_taken','spam','existing_customer','other')),
  summary text,
  booked boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(client_account_id,external_call_id)
);
create index if not exists client_call_details_account_time_idx on public.client_call_details(client_account_id,occurred_at desc);
alter table public.client_call_details enable row level security;
drop policy if exists client_call_details_read on public.client_call_details;
create policy client_call_details_read on public.client_call_details for select to authenticated
  using (public.can_access_account(client_account_id) and public.portal_page_allowed('calls'));

create table if not exists public.client_lead_events (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.sub_accounts(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  event_type text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists client_lead_events_lead_time_idx on public.client_lead_events(lead_id,created_at desc);
alter table public.client_lead_events enable row level security;
drop policy if exists client_lead_events_read on public.client_lead_events;
create policy client_lead_events_read on public.client_lead_events for select to authenticated
  using (public.can_access_account(client_account_id) and public.portal_page_allowed('leads'));

alter table public.review_requests add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.review_requests add column if not exists contact_email text;
alter table public.review_requests add column if not exists click_token uuid default gen_random_uuid();
alter table public.review_requests add column if not exists reminder_sent_at timestamptz;
create unique index if not exists review_requests_click_token_idx on public.review_requests(click_token);
alter table public.report_sends add column if not exists work_done text;
alter table public.report_sends add column if not exists whats_next text;
alter table public.report_sends add column if not exists storage_bucket text;
alter table public.contact_tasks add column if not exists automation_job_id uuid references public.client_automation_jobs(id) on delete set null;
create unique index if not exists contact_tasks_automation_job_unique on public.contact_tasks(automation_job_id)
  where automation_job_id is not null;
alter table public.client_automation_jobs drop constraint if exists client_automation_jobs_kind_check;
alter table public.client_automation_jobs add column if not exists workflow_id uuid references public.automation_workflows(id) on delete set null;
alter table public.client_automation_jobs add constraint client_automation_jobs_kind_check
  check(kind in ('lead_followup','lead_email','lead_nudge','agent_call_task','missed_call_text','review_request','review_reminder','weekly_report','report_send','owner_alert','stop_confirmation'));

create or replace function public.portal_dashboard_metrics(p_account uuid,p_start timestamptz,p_end timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('dashboard')
    or p_start>=p_end or p_end-p_start>interval '367 days' then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select jsonb_build_object(
    'account',(select to_jsonb(a) from (select id,name,package,logo_url,brand,goal_metric,goal_value from public.sub_accounts where id=p_account) a),
    'newLeads',(select count(*) from public.leads where client_account_id=p_account and created_at>=p_start and created_at<p_end),
    'bookedJobs',(select count(*) from public.booking_appointments where client_account_id=p_account and status not in ('cancelled','no_show') and start_at>=p_start and start_at<p_end),
    'answeredCalls',(select count(*) from public.client_call_details where client_account_id=p_account and lower(status) in ('answered','connected') and occurred_at>=p_start and occurred_at<p_end),
    'missedCallsRecovered',(select count(distinct j.source_id) from public.client_automation_jobs j where j.client_account_id=p_account and j.kind='missed_call_text' and j.status='sent' and j.sent_at>=p_start and j.sent_at<p_end),
    'reviewsReceived',(select count(*) from public.reviews where client_account_id=p_account and created_at>=p_start and created_at<p_end),
    'averageRating',(select round(avg(rating)::numeric,1) from public.reviews where client_account_id=p_account and created_at>=p_start and created_at<p_end),
    'adSpendCents',(select coalesce(sum(amount_cents),0) from public.ad_spend_entries where client_account_id=p_account and month>=date_trunc('month',p_start)::date and month<date_trunc('month',p_end)::date+interval '1 month'),
    'sourceBreakdown',(select coalesce(jsonb_object_agg(source,count),'{}'::jsonb) from (select coalesce(nullif(source,''),'other') source,count(*) from public.leads where client_account_id=p_account and created_at>=p_start and created_at<p_end group by 1) s)
  ) into result;
  return result;
end $$;
revoke all on function public.portal_dashboard_metrics(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.portal_dashboard_metrics(uuid,timestamptz,timestamptz) to authenticated;

create or replace function public.portal_lead_timeline(p_account uuid,p_lead uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('leads')
    or not exists(select 1 from public.leads where id=p_lead and client_account_id=p_account) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select jsonb_build_object(
    'lead',(select to_jsonb(l) from (select id,first_name,last_name,email,phone,source,status,notes,pipeline_stage_id,custom_fields,created_at from public.leads where id=p_lead) l),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb) from
      (select event_type,body,metadata,created_at from public.client_lead_events where lead_id=p_lead and client_account_id=p_account
       union all select 'form',null,jsonb_build_object('form_id',form_id,'data',data),created_at from public.form_submissions where lead_id=p_lead and client_account_id=p_account
       union all select 'call',summary,jsonb_build_object('recording_url',recording_url,'duration_seconds',duration_seconds,'outcome',outcome),occurred_at from public.client_call_details where lead_id=p_lead and client_account_id=p_account
       union all select 'text',message_text,jsonb_build_object('direction',direction),created_at from public.mightycall_sms_messages where client_account_id=p_account and right(regexp_replace(coalesce(to_number,from_number,''),'[^0-9]','','g'),10)=right(regexp_replace(coalesce((select phone from public.leads where id=p_lead),''),'[^0-9]','','g'),10)
      ) e)
  ) into result;
  return result;
end $$;
revoke all on function public.portal_lead_timeline(uuid,uuid) from public, anon;
grant execute on function public.portal_lead_timeline(uuid,uuid) to authenticated;

create or replace function public.portal_set_ad_spend(p_account uuid,p_platform text,p_month date,p_amount_cents bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_access_account(p_account) or public.auth_role() not in ('agency_admin','agency_staff')
    or p_platform not in ('google_ads','meta_ads','local_services','other')
    or extract(day from p_month)<>1 or p_amount_cents<0 then
    raise exception 'Access denied' using errcode='42501';
  end if;
  insert into public.ad_spend_entries(client_account_id,platform,month,amount_cents)
  values(p_account,p_platform,p_month,p_amount_cents)
  on conflict(client_account_id,platform,month) do update set amount_cents=excluded.amount_cents,updated_at=now();
end $$;
revoke all on function public.portal_set_ad_spend(uuid,text,date,bigint) from public, anon;
grant execute on function public.portal_set_ad_spend(uuid,text,date,bigint) to authenticated;

create or replace function public.portal_ad_spend(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('reports') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.month desc,e.platform),'[]'::jsonb) into result
  from (select id,platform,month,amount_cents,source from public.ad_spend_entries
    where client_account_id=p_account order by month desc limit 100) e;
  return result;
end $$;
revoke all on function public.portal_ad_spend(uuid) from public, anon;
grant execute on function public.portal_ad_spend(uuid) to authenticated;

create or replace function public.portal_calls(p_account uuid,p_start timestamptz,p_end timestamptz,p_outcome text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('calls')
    or p_start>=p_end or p_end-p_start>interval '367 days' then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.occurred_at desc),'[]'::jsonb) into result
  from (select id,external_call_id,lead_id,occurred_at,caller_number,business_number,
    status,direction,duration_seconds,recording_url,agent_name,outcome,summary,booked
    from public.client_call_details where client_account_id=p_account
      and occurred_at>=p_start and occurred_at<p_end and (p_outcome is null or outcome=p_outcome)
    order by occurred_at desc limit 200) c;
  return result;
end $$;
revoke all on function public.portal_calls(uuid,timestamptz,timestamptz,text) from public, anon;
grant execute on function public.portal_calls(uuid,timestamptz,timestamptz,text) to authenticated;

notify pgrst, 'reload schema';
commit;
