begin;

alter table public.profiles add column if not exists slack_user_id text;
alter table public.leads add column if not exists owner_rep_id uuid;
alter table public.leads add column if not exists outreach_platform text;
alter table public.leads add column if not exists outreach_account_id uuid;
alter table public.leads add column if not exists owner_assigned_at timestamptz;
alter table public.leads add column if not exists first_touch_at timestamptz;
alter table public.leads add column if not exists last_touch_at timestamptz;
alter table public.leads add column if not exists first_reply_at timestamptz;

create unique index if not exists dm_enrollments_one_active_entity on public.dm_enrollments(organization_id,entity_type,entity_id)
  where state in ('queued','step_due','sent');

create or replace function public.social_lead_ownership_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.owner_rep_id is null or nullif(trim(new.company),'') is null then return new; end if;
  if current_setting('app.social_assignment_override',true)='on' then return new; end if;
  if exists(select 1 from public.leads l where l.organization_id=new.organization_id and l.id<>new.id
      and lower(trim(l.company))=lower(trim(new.company)) and l.owner_rep_id is not null and l.owner_rep_id<>new.owner_rep_id) then
    raise exception 'Another rep already owns a lead for this company';
  end if;
  return new;
end $$;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='social_lead_ownership_guard') then
    create trigger social_lead_ownership_guard before insert or update of owner_rep_id,company on public.leads
      for each row execute function public.social_lead_ownership_guard();
  end if;
end $$;

create table if not exists public.audit_bookings (
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
  lead_id uuid references public.leads(id),rep_user_id uuid,connected_account_id uuid references public.connected_accounts(id),
  platform text,campaign_id uuid references public.dm_campaigns(id),template_id uuid references public.dm_templates(id),
  conversation_id uuid references public.conversations(id),calendly_event_uri text unique,calendly_invitee_uri text unique,
  scheduled_at timestamptz,status text not null default 'booked' check(status in ('booked','canceled','rescheduled','held','no_show')),
  booked_at timestamptz,source text not null default 'calendly',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists audit_bookings_rep_date on public.audit_bookings(organization_id,rep_user_id,scheduled_at desc);
alter table public.audit_bookings enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='audit_bookings' and policyname='audit_bookings_admin') then
    create policy audit_bookings_admin on public.audit_bookings for select to authenticated
      using(public.social_org_access(organization_id) and public.wf_role()='admin');
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='audit_bookings' and policyname='audit_bookings_rep') then
    create policy audit_bookings_rep on public.audit_bookings for select to authenticated
      using(rep_user_id=auth.uid() and public.has_social_perm(organization_id,'reports_view'));
  end if;
end $$;
grant select on public.audit_bookings to authenticated;

create table if not exists public.revenue_events (
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
  lead_id uuid references public.leads(id),rep_user_id uuid,connected_account_id uuid references public.connected_accounts(id),
  platform text,campaign_id uuid references public.dm_campaigns(id),stripe_object_id text unique,stripe_event_type text not null,
  amount_cents bigint not null,currency text not null default 'usd',occurred_at timestamptz not null,
  refunded boolean not null default false,metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists revenue_events_rep_date on public.revenue_events(organization_id,rep_user_id,occurred_at desc);
alter table public.revenue_events enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='revenue_events' and policyname='revenue_events_admin') then
    create policy revenue_events_admin on public.revenue_events for select to authenticated
      using(public.social_org_access(organization_id) and public.wf_role()='admin');
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='revenue_events' and policyname='revenue_events_rep') then
    create policy revenue_events_rep on public.revenue_events for select to authenticated
      using(rep_user_id=auth.uid() and public.has_social_perm(organization_id,'reports_view'));
  end if;
end $$;
grant select on public.revenue_events to authenticated;

create table if not exists public.outreach_events (
  id bigint generated always as identity primary key,organization_id uuid not null references public.organizations(id),
  occurred_at timestamptz not null default now(),rep_user_id uuid,connected_account_id uuid references public.connected_accounts(id),
  platform text,campaign_id uuid references public.dm_campaigns(id),step_id uuid references public.dm_campaign_steps(id),
  template_id uuid references public.dm_templates(id),variant_key text,lead_id uuid references public.leads(id),
  company_id uuid references public.crm_companies(id),conversation_id uuid references public.conversations(id),
  enrollment_id uuid references public.dm_enrollments(id),task_id uuid references public.dm_tasks(id),
  event_type text not null,value_cents bigint,source_key text unique,metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists outreach_events_rep_date on public.outreach_events(organization_id,rep_user_id,occurred_at desc);
create index if not exists outreach_events_campaign_date on public.outreach_events(organization_id,campaign_id,occurred_at desc);
create index if not exists outreach_events_account_date on public.outreach_events(organization_id,connected_account_id,occurred_at desc);
alter table public.outreach_events enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='outreach_events' and policyname='outreach_events_admin') then
    create policy outreach_events_admin on public.outreach_events for select to authenticated
      using(public.social_org_access(organization_id) and public.wf_role()='admin');
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='outreach_events' and policyname='outreach_events_rep') then
    create policy outreach_events_rep on public.outreach_events for select to authenticated
      using(rep_user_id=auth.uid() and public.has_social_perm(organization_id,'reports_view'));
  end if;
end $$;
grant select on public.outreach_events to authenticated;

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
  channel text not null check(channel in ('slack','app')),slack_target text,payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,status text not null default 'queued' check(status in ('queued','sending','sent','failed')),
  attempts integer not null default 0,next_attempt_at timestamptz not null default now(),sent_at timestamptz,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists notification_outbox_due on public.notification_outbox(organization_id,next_attempt_at) where status in ('queued','failed');
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from public,anon,authenticated;

create table if not exists public.social_attribution_secrets (
  organization_id uuid primary key references public.organizations(id),
  calendly_signing_vault_id uuid,stripe_signing_vault_id uuid,configured_by uuid,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.social_attribution_secrets enable row level security;
revoke all on public.social_attribution_secrets from public,anon,authenticated;

create materialized view if not exists public.metrics_daily as
select organization_id,(occurred_at at time zone 'America/New_York')::date activity_day,rep_user_id,connected_account_id,
  platform,campaign_id,template_id,variant_key,event_type,count(*)::bigint event_count,coalesce(sum(value_cents),0)::bigint value_cents
from public.outreach_events group by 1,2,3,4,5,6,7,8,9;
create unique index if not exists metrics_daily_refresh_key on public.metrics_daily
  (organization_id,activity_day,rep_user_id,connected_account_id,platform,campaign_id,template_id,variant_key,event_type) nulls not distinct;
revoke all on public.metrics_daily from public,anon,authenticated;
create or replace view public.metrics_weekly as select organization_id,date_trunc('week',activity_day)::date activity_week,
  rep_user_id,connected_account_id,platform,campaign_id,template_id,variant_key,event_type,
  sum(event_count)::bigint event_count,sum(value_cents)::bigint value_cents from public.metrics_daily group by 1,2,3,4,5,6,7,8,9;
create or replace view public.metrics_monthly as select organization_id,date_trunc('month',activity_day)::date activity_month,
  rep_user_id,connected_account_id,platform,campaign_id,template_id,variant_key,event_type,
  sum(event_count)::bigint event_count,sum(value_cents)::bigint value_cents from public.metrics_daily group by 1,2,3,4,5,6,7,8,9;
revoke all on public.metrics_weekly,public.metrics_monthly from public,anon,authenticated;

do $$ begin
  if exists(select 1 from pg_namespace where nspname='cron')
    and not exists(select 1 from cron.job where jobname='rep_dm_metrics_refresh') then
    perform cron.schedule('rep_dm_metrics_refresh','*/15 * * * *','refresh materialized view concurrently public.metrics_daily');
  end if;
end $$;

commit;
