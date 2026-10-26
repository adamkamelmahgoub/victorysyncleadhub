begin;

alter table public.report_recipients add column if not exists client_account_id uuid
  references public.sub_accounts(id) on delete cascade;
create index if not exists report_recipients_account_idx on public.report_recipients(client_account_id);
drop policy if exists client_tenancy_guard on public.report_recipients;
create policy client_tenancy_guard on public.report_recipients as restrictive for all to authenticated
  using(public.is_agency_admin() or (client_account_id is null and public.is_agency())
    or (client_account_id is not null and public.can_access_account(client_account_id)))
  with check(public.is_agency_admin() or (client_account_id is null and public.is_agency())
    or (client_account_id is not null and public.can_access_account(client_account_id)));

create table if not exists public.client_package_templates (
  package text primary key check (package in ('starter','scale','domination','overflow','business_hours','coverage_247','appt_part_time','appt_full_time','revive','custom')),
  onboarding_tasks jsonb not null default '[]'::jsonb,
  workflows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
insert into public.client_package_templates(package,onboarding_tasks,workflows) values
('starter','["Confirm business details","Connect MightyCall number","Publish lead form","Review follow-up copy","Launch weekly report"]',
 '[{"name":"Lead follow-up","trigger_type":"form_submitted","actions":[{"type":"sms_followup"}]},{"name":"Missed-call text-back","trigger_type":"missed_call","actions":[{"type":"sms_text_back"}]},{"name":"Review request","trigger_type":"appointment_completed","actions":[{"type":"review_request"}]}]'),
('scale','["Confirm business details","Connect MightyCall number","Publish lead form","Connect review profile","Review follow-up copy","Launch weekly report"]',
 '[{"name":"Lead follow-up","trigger_type":"form_submitted","actions":[{"type":"sms_followup"}]},{"name":"Missed-call text-back","trigger_type":"missed_call","actions":[{"type":"sms_text_back"}]},{"name":"Review request","trigger_type":"appointment_completed","actions":[{"type":"review_request"}]}]'),
('domination','["Confirm business details","Connect MightyCall number","Publish campaign pages","Connect review profile","Review follow-up copy","Launch weekly report"]',
 '[{"name":"Lead follow-up","trigger_type":"form_submitted","actions":[{"type":"sms_followup"}]},{"name":"Missed-call text-back","trigger_type":"missed_call","actions":[{"type":"sms_text_back"}]},{"name":"Review request","trigger_type":"appointment_completed","actions":[{"type":"review_request"}]}]'),
('overflow','["Confirm call routing","Connect MightyCall number","Test overflow calls","Launch weekly report"]','[{"name":"Missed-call text-back","trigger_type":"missed_call","actions":[{"type":"sms_text_back"}]}]'),
('business_hours','["Confirm business hours","Connect MightyCall number","Test routing","Launch weekly report"]','[{"name":"Missed-call text-back","trigger_type":"missed_call","actions":[{"type":"sms_text_back"}]}]'),
('coverage_247','["Confirm round-the-clock routing","Connect MightyCall number","Test routing","Launch weekly report"]','[{"name":"Missed-call text-back","trigger_type":"missed_call","actions":[{"type":"sms_text_back"}]}]'),
('appt_part_time','["Confirm booking rules","Connect calendar","Test appointment flow","Launch weekly report"]','[{"name":"Review request","trigger_type":"appointment_completed","actions":[{"type":"review_request"}]}]'),
('appt_full_time','["Confirm booking rules","Connect calendar","Test appointment flow","Launch weekly report"]','[{"name":"Review request","trigger_type":"appointment_completed","actions":[{"type":"review_request"}]}]'),
('revive','["Import opted-in contacts","Review DNC list","Approve follow-up copy","Launch weekly report"]','[{"name":"Lead follow-up","trigger_type":"form_submitted","actions":[{"type":"sms_followup"}]}]'),
('custom','["Confirm scope and success metric","Connect required assets","Approve messages","Launch weekly report"]','[]')
on conflict (package) do nothing;

create unique index if not exists sub_accounts_company_unique_idx on public.sub_accounts(company_id) where company_id is not null;

create or replace function public.portal_create_client(p_company uuid,p_package text,
  p_owner_email text,p_owner_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare company public.companies%rowtype; account public.sub_accounts%rowtype;
declare template public.client_package_templates%rowtype; item jsonb; work jsonb;
declare member uuid; code text; creator uuid;
begin
  if (not public.is_agency_admin() and auth.role() <> 'service_role')
    or (auth.role() = 'service_role' and not exists(select 1 from public.user_feature_access f
      where f.org_id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid
        and f.user_id is null and f.feature_key='client_accounts' and f.enabled))
    or (auth.role() <> 'service_role' and not public.client_feature_enabled('client_accounts')) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select * into company from public.companies where id=p_company and deleted_at is null and stage='client';
  if company.id is null then raise exception 'Company must be closed as a client' using errcode='22023'; end if;
  if p_owner_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(trim(p_owner_name))<1 then
    raise exception 'Owner name and email are required' using errcode='22023';
  end if;
  select * into template from public.client_package_templates where package=p_package;
  if template.package is null then raise exception 'Invalid package' using errcode='22023'; end if;
  creator:=auth.uid();
  if creator is null then
    select coalesce(t.user_id,t.auth_user_id::uuid) into creator from public.team_members t
    where t.role in ('agency_admin','owner','admin') and t.is_active is distinct from false
      and (t.user_id is not null or t.auth_user_id is not null)
    order by t.created_at limit 1;
  end if;
  if creator is null then raise exception 'Agency task creator is missing' using errcode='22023'; end if;
  select * into account from public.sub_accounts where company_id=p_company;
  if account.id is not null then
    if account.invite_email_sent_at is not null then
      return jsonb_build_object('accountId',account.id,'existing',true);
    end if;
    select id into member from public.team_members where client_account_id=account.id
      and role='client_owner' order by created_at limit 1;
    if member is null then
      insert into public.team_members(org_id,client_account_id,role,name,email,status,is_active,page_permissions)
      values(account.organization_id,account.id,'client_owner',p_owner_name,lower(p_owner_email),'invited',true,
        '["dashboard","leads","calls","pages","forms","reviews","reports","billing","settings"]'::jsonb)
      returning id into member;
    end if;
    code := encode(extensions.gen_random_bytes(16),'hex');
    insert into public.invite_codes(code_hash,email,name,role,team_member_id,client_account_id,
      org_id,expires_at,created_by)
    values(encode(extensions.digest(code,'sha256'),'hex'),lower(p_owner_email),p_owner_name,'client_owner',
      member,account.id,account.organization_id,now()+interval '7 days','client_provisioning_retry');
    return jsonb_build_object('accountId',account.id,'inviteCode',code,'ownerEmail',lower(p_owner_email),'existing',false);
  end if;
  insert into public.sub_accounts(name,slug,owner_email,owner_name,phone,industry,website,
    status,plan,package,company_id,organization_id)
  values(company.name,lower(regexp_replace(company.name,'[^a-zA-Z0-9]+','-','g'))||'-'||substr(gen_random_uuid()::text,1,8),
    lower(p_owner_email),p_owner_name,company.phone,company.industry,company.website,
    'active',p_package,p_package,p_company,'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid)
  returning * into account;
  for item in select value from jsonb_array_elements(template.onboarding_tasks) loop
    insert into public.company_tasks(company_id,client_account_id,title,kind,status,priority,due_at,created_by)
    values(p_company,account.id,item#>>'{}','task','pending','normal',now()+interval '7 days',creator);
  end loop;
  for work in select value from jsonb_array_elements(template.workflows) loop
    insert into public.automation_workflows(client_account_id,name,trigger_type,trigger_config,actions,is_active)
    values(account.id,work->>'name',work->>'trigger_type','{}'::jsonb,work->'actions',true);
  end loop;
  insert into public.team_members(org_id,client_account_id,role,name,email,status,is_active,page_permissions)
  values(account.organization_id,account.id,'client_owner',p_owner_name,lower(p_owner_email),'invited',true,
    '["dashboard","leads","calls","pages","forms","reviews","reports","billing","settings"]'::jsonb)
  returning id into member;
  code := encode(extensions.gen_random_bytes(16),'hex');
  insert into public.invite_codes(code_hash,email,name,role,team_member_id,client_account_id,
    org_id,expires_at,created_by)
  values(encode(extensions.digest(code,'sha256'),'hex'),lower(p_owner_email),p_owner_name,'client_owner',
    member,account.id,account.organization_id,now()+interval '7 days','client_provisioning');
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,
    event_type,action,target) values(auth.uid(),auth.jwt()->>'email',account.organization_id::text,
    account.id::text,'account','created',p_company::text);
  return jsonb_build_object('accountId',account.id,'inviteCode',code,'ownerEmail',lower(p_owner_email),'existing',false);
end $$;
revoke all on function public.portal_create_client(uuid,text,text,text) from public, anon;
grant execute on function public.portal_create_client(uuid,text,text,text) to authenticated;
grant execute on function public.portal_create_client(uuid,text,text,text) to service_role;

create or replace function public.portal_mark_invite_sent(p_account uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_agency_admin() and auth.role()<>'service_role' then
    raise exception 'Access denied' using errcode='42501';
  end if;
  update public.sub_accounts set invite_email_sent_at=now() where id=p_account;
end $$;
revoke all on function public.portal_mark_invite_sent(uuid) from public, anon;
grant execute on function public.portal_mark_invite_sent(uuid) to authenticated,service_role;

create or replace function public.portal_closed_companies() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_agency_admin() or not public.client_feature_enabled('client_accounts') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) into result
  from (select c.id,c.name,c.email,c.contact_name from public.companies c
    where c.stage='client' and c.deleted_at is null
      and not exists(select 1 from public.sub_accounts s where s.company_id=c.id)
    order by c.name limit 200) x;
  return result;
end $$;
revoke all on function public.portal_closed_companies() from public, anon;
grant execute on function public.portal_closed_companies() to authenticated;

create table if not exists public.client_automation_jobs (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.sub_accounts(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  kind text not null check(kind in ('lead_followup','missed_call_text','review_request','weekly_report')),
  source_id text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','processing','sent','cancelled','failed')),
  run_at timestamptz not null default now(),attempts integer not null default 0,
  last_error text,sent_at timestamptz,claimed_at timestamptz,created_at timestamptz not null default now(),
  unique(kind,source_id)
);
create index if not exists client_automation_jobs_due_idx on public.client_automation_jobs(run_at)
  where status in ('pending','failed');
create index if not exists client_automation_jobs_account_idx on public.client_automation_jobs(client_account_id);
alter table public.client_automation_jobs add column if not exists claimed_at timestamptz;
alter table public.client_automation_jobs enable row level security;
drop policy if exists client_automation_jobs_admin on public.client_automation_jobs;
create policy client_automation_jobs_admin on public.client_automation_jobs for select to authenticated
  using(public.is_agency_admin() or (public.is_agency() and public.can_access_account(client_account_id)));

create or replace function public.client_claim_jobs(p_limit integer default 20)
returns setof public.client_automation_jobs
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with selected as (
    select j.id from public.client_automation_jobs j
    where ((j.status in ('pending','failed') and j.run_at<=now())
      or (j.status='processing' and j.claimed_at<now()-interval '10 minutes'))
      and j.attempts<5
    order by j.run_at,j.created_at for update skip locked limit least(greatest(p_limit,1),50)
  )
  update public.client_automation_jobs j set status='processing',attempts=j.attempts+1,claimed_at=now()
  from selected s where j.id=s.id returning j.*;
end $$;
revoke all on function public.client_claim_jobs(integer) from public, anon, authenticated;
grant execute on function public.client_claim_jobs(integer) to service_role;

create or replace function public.client_delivery_enabled(p_account uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.sub_accounts a join public.user_feature_access f
    on f.org_id=a.organization_id and f.user_id is null and f.feature_key='delivery_automation'
    and f.enabled where a.id=p_account);
$$;

create or replace function public.client_phone_dnc(p_account uuid,p_phone text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.leads l where l.client_account_id=p_account and l.dnc=true
    and right(regexp_replace(coalesce(l.phone,''),'[^0-9]','','g'),10)=
      right(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),10))
    or exists(select 1 from public.mightycall_sms_messages m
      where m.client_account_id=p_account and lower(m.direction) in ('inbound','incoming','received')
        and upper(trim(coalesce(m.message_text,m.body,m.message,''))) ~ '^STOP(?:\s|$)'
        and right(regexp_replace(coalesce(m.from_number,m.sender,''),'[^0-9]','','g'),10)=
          right(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),10));
$$;
revoke all on function public.client_phone_dnc(uuid,text) from public, anon, authenticated;
grant execute on function public.client_phone_dnc(uuid,text) to service_role;

create or replace function public.enqueue_form_followup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.client_account_id is not null and new.lead_id is not null
    and (tg_op='INSERT' or old.lead_id is distinct from new.lead_id)
    and public.client_delivery_enabled(new.client_account_id)
    and exists(select 1 from public.automation_workflows w where w.client_account_id=new.client_account_id
      and w.trigger_type='form_submitted' and w.is_active) then
    insert into public.client_automation_jobs(client_account_id,lead_id,kind,source_id)
    values(new.client_account_id,new.lead_id,'lead_followup',new.id::text)
    on conflict(kind,source_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists form_followup_job on public.form_submissions;
create trigger form_followup_job after insert or update of lead_id on public.form_submissions
for each row execute function public.enqueue_form_followup();

create or replace function public.enqueue_missed_call() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.client_account_id is not null and new.call_status ilike 'missed'
    and lower(new.call_direction) in ('incoming','inbound')
    and new.external_call_id is not null
    and public.client_delivery_enabled(new.client_account_id)
    and exists(select 1 from public.automation_workflows w where w.client_account_id=new.client_account_id
      and w.trigger_type='missed_call' and w.is_active) then
    insert into public.client_automation_jobs(client_account_id,kind,source_id,payload)
    values(new.client_account_id,'missed_call_text','call:'||new.external_call_id,
      jsonb_build_object('callId',new.external_call_id))
    on conflict(kind,source_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists missed_call_text_job on public.mightycall_webhook_inbox;
create trigger missed_call_text_job after insert or update of client_account_id,call_status on public.mightycall_webhook_inbox
for each row execute function public.enqueue_missed_call();

create or replace function public.enqueue_review_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.client_account_id is not null and new.status='completed'
    and (tg_op='INSERT' or old.status is distinct from new.status)
    and public.client_delivery_enabled(new.client_account_id)
    and exists(select 1 from public.automation_workflows w where w.client_account_id=new.client_account_id
      and w.trigger_type='appointment_completed' and w.is_active) then
    insert into public.client_automation_jobs(client_account_id,lead_id,kind,source_id)
    values(new.client_account_id,new.lead_id,'review_request',new.id::text)
    on conflict(kind,source_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists appointment_review_job on public.booking_appointments;
create trigger appointment_review_job after insert or update of status on public.booking_appointments
for each row execute function public.enqueue_review_request();

create or replace function public.enqueue_client_weekly_reports() returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.client_automation_jobs(client_account_id,kind,source_id,run_at)
  select a.id,'weekly_report',a.id::text||':'||to_char(current_date,'IYYY-IW'),now()
  from public.sub_accounts a where a.status='active' and public.client_delivery_enabled(a.id)
  on conflict(kind,source_id) do nothing;
end $$;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='victorysync-client-weekly-reports') then
      perform cron.unschedule('victorysync-client-weekly-reports');
    end if;
    perform cron.schedule('victorysync-client-weekly-reports','0 13 * * 1',
      'select public.enqueue_client_weekly_reports()');
  end if;
exception when others then
  -- A fresh environment may not have cron configured yet.
  null;
end $$;

create or replace function public.stop_client_texts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare caller text;
begin
  if new.client_account_id is null or lower(new.direction) not in ('inbound','incoming','received') then return new; end if;
  if upper(trim(coalesce(new.message_text,new.body,new.message,''))) !~ '^STOP(?:\s|$)' then return new; end if;
  caller := regexp_replace(coalesce(new.from_number,new.sender,''),'[^0-9]','','g');
  if length(caller)<10 then return new; end if;
  update public.leads set dnc=true,updated_at=now()
  where client_account_id=new.client_account_id
    and right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),10)=right(caller,10);
  update public.client_automation_jobs set status='cancelled',last_error='Contact replied STOP'
  where client_account_id=new.client_account_id and status in ('pending','failed')
    and lead_id in (select id from public.leads where client_account_id=new.client_account_id and dnc=true
      and right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),10)=right(caller,10));
  update public.sequence_enrollments set status='stopped',stopped_reason='STOP'
  where client_account_id=new.client_account_id and status not in ('completed','stopped')
    and lead_id in (select id from public.leads where client_account_id=new.client_account_id and dnc=true
      and right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),10)=right(caller,10));
  return new;
end $$;
create or replace function public.route_client_sms() returns trigger
language plpgsql security definer set search_path = '' as $$
declare business text;
begin
  if new.client_account_id is not null then return new; end if;
  business := right(regexp_replace(coalesce(new.business_number,new.to_number,new.recipient,''),'[^0-9]','','g'),10);
  if length(business)=10 then
    select a.id into new.client_account_id from public.sub_accounts a
    where right(regexp_replace(coalesce(a.mightycall_number,''),'[^0-9]','','g'),10)=business
    order by a.created_at limit 1;
  end if;
  return new;
end $$;
drop trigger if exists client_sms_route on public.mightycall_sms_messages;
create trigger client_sms_route before insert on public.mightycall_sms_messages
for each row execute function public.route_client_sms();
drop trigger if exists client_sms_stop on public.mightycall_sms_messages;
create trigger client_sms_stop after insert or update of client_account_id on public.mightycall_sms_messages
for each row execute function public.stop_client_texts();

notify pgrst, 'reload schema';
commit;
