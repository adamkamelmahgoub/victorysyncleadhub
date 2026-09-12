begin;

create type public.outreach_disposition as enum ('no_answer','voicemail','gatekeeper','wrong_number','not_interested','callback_scheduled','meeting_booked','dnc');
create type public.outreach_suppression_reason as enum ('dnc','unsubscribed','bounced_hard','manual_exclude');
create type public.outreach_timezone as enum ('Etc/UTC','America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','America/Adak','Pacific/Honolulu','America/Detroit','America/Indiana/Indianapolis','America/Indiana/Knox','America/Indiana/Tell_City','America/Indiana/Marengo','America/Indiana/Petersburg','America/Indiana/Vevay','America/Indiana/Vincennes','America/Indiana/Winamac','America/Kentucky/Louisville','America/Kentucky/Monticello','America/Menominee','America/North_Dakota/Beulah','America/North_Dakota/Center','America/North_Dakota/New_Salem');

-- Preserve original values so rollback does not invent legacy dispositions.
create table public.outreach_legacy_leads as select id::text as lead_id, disposition, contact_attempts from public.leads;
create table public.outreach_audit (
  id bigint generated always as identity primary key,
  lead_id text, actor text not null, reason text not null,
  details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.outreach_suppressions (
  identity_type text not null check (identity_type in ('email','phone')),
  identity_value text not null check (identity_value <> ''),
  reason public.outreach_suppression_reason not null,
  created_at timestamptz not null default now(),
  primary key (identity_type, identity_value)
);
alter table public.outreach_audit enable row level security;
alter table public.outreach_suppressions enable row level security;
alter table public.outreach_legacy_leads enable row level security;

create function public.outreach_email(value text) returns text language sql immutable as $$
  select nullif(lower(trim(value)), '')
$$;
create function public.outreach_phone(value text) returns text language sql immutable as $$
  select case when length(n) = 10 then '+1' || n when length(n) = 11 and left(n,1) = '1' then '+' || n else null end
  from (select regexp_replace(regexp_replace(coalesce(value,''), '\s*(ext\.?|extension|x|#)\s*[0-9]+\s*$', '', 'i'), '[^0-9]', '', 'g') n) s
$$;
-- Only unambiguous states and known metro area codes are inferred. Others need operator review.
create function public.outreach_derive_timezone(fields jsonb, phone text) returns public.outreach_timezone language sql immutable as $$
 select (case
 when nullif(trim(fields->>'timezone'),'') is not null then trim(fields->>'timezone')
 when upper(trim(coalesce(fields->>'state',''))) in ('CA','CALIFORNIA','WA','WASHINGTON') then 'America/Los_Angeles'
 when upper(trim(coalesce(fields->>'state',''))) in ('CO','COLORADO','UT','UTAH','WY','WYOMING','MT','MONTANA','NM','NEW MEXICO') then 'America/Denver'
 when upper(trim(coalesce(fields->>'state',''))) in ('AL','ALABAMA','AR','ARKANSAS','IL','ILLINOIS','IA','IOWA','LA','LOUISIANA','MN','MINNESOTA','MS','MISSISSIPPI','MO','MISSOURI','OK','OKLAHOMA','WI','WISCONSIN') then 'America/Chicago'
 when upper(trim(coalesce(fields->>'state',''))) in ('CT','CONNECTICUT','DE','DELAWARE','DC','DISTRICT OF COLUMBIA','GA','GEORGIA','ME','MAINE','MD','MARYLAND','MA','MASSACHUSETTS','NH','NEW HAMPSHIRE','NJ','NEW JERSEY','NY','NEW YORK','NC','NORTH CAROLINA','OH','OHIO','PA','PENNSYLVANIA','RI','RHODE ISLAND','SC','SOUTH CAROLINA','VT','VERMONT','VA','VIRGINIA','WV','WEST VIRGINIA') then 'America/New_York'
 when upper(trim(coalesce(fields->>'state',''))) in ('HI','HAWAII') then 'Pacific/Honolulu'
 when substring(public.outreach_phone(phone) from 3 for 3) in ('212','332','646','718','917','929','305','786','813','656','407','689','321') then 'America/New_York'
 when substring(public.outreach_phone(phone) from 3 for 3) in ('214','469','972','945','713','281','832','346','312','872','773') then 'America/Chicago'
 when substring(public.outreach_phone(phone) from 3 for 3) in ('303','720','983') then 'America/Denver'
 when substring(public.outreach_phone(phone) from 3 for 3) in ('602','480','623') then 'America/Phoenix'
 when substring(public.outreach_phone(phone) from 3 for 3) in ('213','323','310','424','415','628','206','564') then 'America/Los_Angeles'
 else 'Etc/UTC' end)::public.outreach_timezone
$$;

alter table public.leads
 add column timezone public.outreach_timezone not null default 'Etc/UTC',
 add column timezone_confirmed boolean not null default false,
 add column next_action_at timestamptz default now(),
 add column attempt_count integer not null default 0 check (attempt_count >= 0),
 add column first_attempt_at timestamptz,
 add column revisit_at timestamptz,
 add column dnc boolean not null default false,
 add column suppressed_reason public.outreach_suppression_reason,
 add column normalized_email text generated always as (public.outreach_email(email)) stored,
 add column normalized_phone text generated always as (public.outreach_phone(phone)) stored,
 add column avg_job_value numeric(14,2) check (avg_job_value >= 0),
 add column missed_calls_per_week integer check (missed_calls_per_week >= 0),
 add column after_hours_coverage text,
 add column uses_answering_service boolean;

update public.leads set
 timezone = public.outreach_derive_timezone(custom_fields,phone),
 timezone_confirmed = public.outreach_derive_timezone(custom_fields,phone) <> 'Etc/UTC',
 attempt_count = greatest(contact_attempts,0),
 first_attempt_at = case when contact_attempts > 0 then coalesce((select min(a.created_at) from public.activities a where a.lead_id = leads.id and a.type = 'call'), created_at) end,
 suppressed_reason = case when disposition is not null and disposition <> '' and lower(replace(trim(disposition),' ','_')) not in ('no_answer','voicemail','gatekeeper','wrong_number','not_interested','callback_scheduled','meeting_booked','dnc') then 'manual_exclude'::public.outreach_suppression_reason end,
 disposition = case when lower(replace(trim(disposition),' ','_')) in ('no_answer','voicemail','gatekeeper','wrong_number','not_interested','callback_scheduled','meeting_booked','dnc') then lower(replace(trim(disposition),' ','_')) else null end;
-- Legacy attempted records with no recognized outcome need review, not a fabricated dial.
update public.leads set suppressed_reason = 'manual_exclude' where attempt_count > 0 and disposition is null;
update public.leads set dnc = true, suppressed_reason = 'dnc' where disposition = 'dnc';
update public.leads set next_action_at = null where disposition in ('wrong_number','not_interested','dnc');
alter table public.leads alter column disposition type public.outreach_disposition using disposition::public.outreach_disposition;
alter table public.leads add constraint outreach_next_action check (disposition in ('wrong_number','not_interested','dnc') or next_action_at is not null);
-- SQL CHECK treats NULL as unknown; explicitly cover fresh leads too.
alter table public.leads add constraint outreach_fresh_next_action check (disposition is not null or next_action_at is not null);
alter table public.leads add constraint outreach_attempt_history check (attempt_count = 0 or first_attempt_at is not null);
create index outreach_dnc_idx on public.leads(dnc);
create index outreach_email_idx on public.leads(normalized_email);
create index outreach_phone_idx on public.leads(normalized_phone);
create index outreach_due_idx on public.leads(next_action_at, id) where dnc = false and suppressed_reason is null;

insert into public.outreach_suppressions(identity_type,identity_value,reason)
 select 'email',normalized_email,suppressed_reason from public.leads where suppressed_reason is not null and normalized_email is not null
 on conflict do nothing;
insert into public.outreach_suppressions(identity_type,identity_value,reason)
 select 'phone',normalized_phone,suppressed_reason from public.leads where suppressed_reason is not null and normalized_phone is not null
 on conflict do nothing;
insert into public.outreach_audit(lead_id,actor,reason,details)
 select id::text,'system','phase1_backfill',jsonb_build_object('legacy',b,'timezone',timezone,'suppressed_reason',suppressed_reason)
 from public.leads l join public.outreach_legacy_leads b on b.lead_id = l.id::text;

-- Serialize lead and suppression writes before row locks; imports cannot race a suppression.
create function public.outreach_write_lock() returns trigger language plpgsql as $$
begin perform pg_advisory_xact_lock(8675309); return null; end $$;
create trigger outreach_lead_lock before insert or update or delete on public.leads for each statement execute function public.outreach_write_lock();
create trigger outreach_suppression_lock before insert or update or delete on public.outreach_suppressions for each statement execute function public.outreach_write_lock();

create function public.outreach_lead_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare found_reason public.outreach_suppression_reason;
begin
 if tg_op = 'INSERT' and new.contact_attempts > 0 and new.attempt_count = 0 then
   new.attempt_count := new.contact_attempts;
   new.first_attempt_at := coalesce(new.first_attempt_at,new.created_at);
   if new.disposition is null then raise exception 'Historical attempts require a fixed disposition' using errcode='23514'; end if;
 end if;
 if tg_op = 'UPDATE' then
   if old.dnc and not new.dnc or old.suppressed_reason is not null and new.suppressed_reason is distinct from old.suppressed_reason then
     raise exception 'Suppression is permanent' using errcode = '23514';
   end if;
   if (new.attempt_count is distinct from old.attempt_count or new.contact_attempts is distinct from old.contact_attempts or new.first_attempt_at is distinct from old.first_attempt_at or new.disposition is distinct from old.disposition)
      and coalesce(current_setting('outreach.logging_call',true),'') <> 'yes' then
     raise exception 'Use atomic call logging to change disposition or attempts' using errcode = '23514';
   end if;
 end if;
 if new.timezone = 'Etc/UTC' then
   new.timezone := public.outreach_derive_timezone(new.custom_fields,new.phone);
   new.timezone_confirmed := new.timezone <> 'Etc/UTC';
 end if;
 if new.disposition = 'dnc' then new.dnc := true; end if;
 if new.dnc then new.suppressed_reason := coalesce(new.suppressed_reason,'dnc'); end if;
 select reason into found_reason from public.outreach_suppressions
 where (identity_type='email' and identity_value=public.outreach_email(new.email))
    or (identity_type='phone' and identity_value=public.outreach_phone(new.phone))
 order by (reason='dnc') desc, created_at limit 1;
 if found_reason is not null then
   new.suppressed_reason := coalesce(new.suppressed_reason,found_reason);
   new.dnc := new.dnc or found_reason = 'dnc';
 end if;
 if new.attempt_count > 0 and new.disposition is null and new.suppressed_reason is null then
   raise exception 'Attempted lead requires a disposition' using errcode='23514';
 end if;
 new.contact_attempts := new.attempt_count;
 return new;
end $$;
create trigger outreach_lead_guard before insert or update on public.leads for each row execute function public.outreach_lead_guard();

create function public.outreach_lead_audit() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if new.suppressed_reason is not null then
   insert into public.outreach_suppressions(identity_type,identity_value,reason)
   select 'email',new.normalized_email,new.suppressed_reason where new.normalized_email is not null on conflict do nothing;
   insert into public.outreach_suppressions(identity_type,identity_value,reason)
   select 'phone',new.normalized_phone,new.suppressed_reason where new.normalized_phone is not null on conflict do nothing;
 end if;
 if tg_op = 'INSERT' or row(new.timezone,new.timezone_confirmed,new.suppressed_reason,new.dnc) is distinct from row(old.timezone,old.timezone_confirmed,old.suppressed_reason,old.dnc) then
   insert into public.outreach_audit(lead_id,actor,reason,details) values(new.id::text,'system','outreach_state_enforced',jsonb_build_object('timezone',new.timezone,'suppressed_reason',new.suppressed_reason,'dnc',new.dnc));
 end if;
 return null;
end $$;
create trigger outreach_lead_audit after insert or update on public.leads for each row execute function public.outreach_lead_audit();
create function public.outreach_suppression_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if tg_op <> 'INSERT' then raise exception 'Suppression registry is append only'; end if;
 new.identity_value := case when new.identity_type='email' then public.outreach_email(new.identity_value) else public.outreach_phone(new.identity_value) end;
 return new;
end $$;
create trigger outreach_suppression_guard before insert or update or delete on public.outreach_suppressions for each row execute function public.outreach_suppression_guard();
create function public.outreach_suppression_apply() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
 update public.leads set suppressed_reason=coalesce(suppressed_reason,new.reason), dnc=dnc or new.reason='dnc'
 where ((new.identity_type='email' and normalized_email=new.identity_value) or (new.identity_type='phone' and normalized_phone=new.identity_value))
 and (suppressed_reason is null or (new.reason='dnc' and not dnc));
 insert into public.outreach_audit(actor,reason,details) values('system','suppression_registered',jsonb_build_object('identity_type',new.identity_type,'reason',new.reason));
 return null;
end $$;
create trigger outreach_suppression_apply after insert on public.outreach_suppressions for each row execute function public.outreach_suppression_apply();

create view public.outreach_eligible_leads with (security_invoker=true) as
 select l.* from public.leads l where not l.dnc and l.suppressed_reason is null
 and not exists (select 1 from public.outreach_suppressions s where (s.identity_type='email' and s.identity_value=l.normalized_email) or (s.identity_type='phone' and s.identity_value=l.normalized_phone));

create function public.outreach_call_window(p_at timestamptz, p_timezone public.outreach_timezone) returns boolean language sql stable as $$
 select (p_at at time zone p_timezone::text)::time >= time '07:00' and (p_at at time zone p_timezone::text)::time < time '18:00'
$$;
create function public.outreach_call_queue(p_timezone text default null, p_client text default null) returns jsonb language sql stable as $$
 with eligible as (
 select l.*,case when attempt_count=0 then 'fresh' else 'due' end queue_section from public.outreach_eligible_leads l
 where timezone_confirmed and timezone <> 'Etc/UTC' and normalized_phone is not null
 and (disposition is null or disposition not in ('wrong_number','not_interested','dnc','meeting_booked'))
 and next_action_at <= now() and (p_timezone is null or timezone::text=p_timezone)
 and (p_client is null or client_account_id::text=p_client)
 and public.outreach_call_window(now(),timezone)
 ), due as (select * from eligible where queue_section='due' order by next_action_at,id limit 100),
 fresh as (select * from eligible where queue_section='fresh' order by created_at,id limit 100)
 select jsonb_build_object('due',coalesce((select jsonb_agg(due order by next_action_at,id) from due),'[]'::jsonb),'fresh',coalesce((select jsonb_agg(fresh order by created_at,id) from fresh),'[]'::jsonb),
 'needsTimezone', (select count(*) from public.outreach_eligible_leads where not timezone_confirmed and (p_client is null or client_account_id::text=p_client)), 'asOf',now())
$$;

create function public.outreach_log_call(p_lead_id text, p_disposition public.outreach_disposition, p_next_action_at timestamptz, p_notes text, p_request_id uuid, p_actor text, p_client text default null) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare l public.leads; result jsonb; auto_close boolean; previous_actor text;
begin
 perform pg_advisory_xact_lock(8675309);
 select * into l from public.leads where id::text=p_lead_id and (p_client is null or client_account_id::text=p_client) for update;
 if not found then raise exception 'Lead not found' using errcode='P0002'; end if;
 select details->'result' into result from public.outreach_audit where lead_id=p_lead_id and reason='call_logged' and details->>'request_id'=p_request_id::text;
 if result is not null then return result; end if;
 if p_request_id is null or p_disposition is null or nullif(trim(p_actor),'') is null then raise exception 'Disposition, actor and request ID are required' using errcode='23514'; end if;
 if not exists(select 1 from public.outreach_eligible_leads where id=l.id) then raise exception 'Lead is suppressed' using errcode='23514'; end if;
 if p_disposition not in ('wrong_number','not_interested','dnc') and (p_next_action_at is null or p_next_action_at <= now()) then
   raise exception 'A future next action is required' using errcode='23514';
 end if;
 auto_close := l.attempt_count+1 >= 6 and coalesce(l.first_attempt_at,now()) <= now()-interval '240 hours'
   and p_disposition in ('no_answer','voicemail','gatekeeper');
 perform set_config('outreach.logging_call','yes',true);
 update public.leads set attempt_count=attempt_count+1, first_attempt_at=coalesce(first_attempt_at,now()),
 disposition=case when auto_close then 'not_interested'::public.outreach_disposition else p_disposition end,
 next_action_at=case when auto_close or p_disposition in ('wrong_number','not_interested','dnc') then null else p_next_action_at end,
 revisit_at=case when auto_close then now()+interval '2160 hours' else revisit_at end,
 updated_at=now() where id=l.id returning to_jsonb(leads.*) into result;
 insert into public.activities(lead_id,type,description) values(l.id,'call',p_disposition::text || case when nullif(trim(p_notes),'') is not null then ': ' || p_notes else '' end);
 perform set_config('outreach.logging_call','',true);
 insert into public.outreach_audit(lead_id,actor,reason,details) values(p_lead_id,p_actor,'call_logged',jsonb_build_object('request_id',p_request_id,'result',result));
 if auto_close then insert into public.outreach_audit(lead_id,actor,reason,details) values(p_lead_id,'system','attempt_policy_exhausted',jsonb_build_object('attempt_count',l.attempt_count+1,'revisit_at',result->'revisit_at')); end if;
 return result;
end $$;
create unique index outreach_call_request_idx on public.outreach_audit ((details->>'request_id')) where reason='call_logged';

create function public.outreach_activity_guard() returns trigger language plpgsql as $$
begin
 if (new.type='call' or (tg_op='UPDATE' and old.type='call')) and coalesce(current_setting('outreach.logging_call',true),'') <> 'yes' then
 raise exception 'Log calls through the call queue so next action and attempts are saved together' using errcode='23514'; end if;
 return new;
end $$;
create trigger outreach_activity_guard before insert or update on public.activities for each row execute function public.outreach_activity_guard();

-- Existing email enrollment/queue paths must also respect suppression in Phase 1.
create function public.outreach_email_queue_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status in ('active','queued','pending','sending') and not exists(select 1 from public.outreach_eligible_leads where id=new.lead_id and (disposition is null or disposition not in ('meeting_booked','not_interested','wrong_number','dnc'))) then
   raise exception 'Lead is not eligible for outreach' using errcode='23514';
 end if;
 return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['sequence_enrollments','email_logs','campaign_leads'] loop
   if to_regclass('public.'||t) is not null then execute format('create trigger outreach_email_queue_guard before insert or update on public.%I for each row execute function public.outreach_email_queue_guard()',t); end if;
 end loop;
end $$;
create function public.outreach_stop_email() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare t text; changed record;
begin
 if new.dnc or new.suppressed_reason is not null or new.disposition in ('meeting_booked','not_interested','wrong_number','dnc') then
   foreach t in array array['sequence_enrollments','email_logs','campaign_leads'] loop
     if to_regclass('public.'||t) is not null then
       for changed in execute format('update public.%I as target set status=''stopped'' where lead_id=$1 and status in (''active'',''queued'',''pending'',''sending'') returning to_jsonb(target) as record',t) using new.id loop
         insert into public.outreach_audit(lead_id,actor,reason,details) values(new.id::text,'system','call_or_suppression_stopped_email',jsonb_build_object('table',t,'record',changed.record));
       end loop;
     end if;
   end loop;
 end if;
 return null;
end $$;
create trigger outreach_stop_email after insert or update on public.leads for each row execute function public.outreach_stop_email();
-- Apply registry matches and stop legacy queued work during rollout.
do $$ declare l record; begin
 for l in select id from public.leads loop
   update public.leads set dnc=dnc where id=l.id;
 end loop;
end $$;

-- RPCs are server-only; the two API adapters retain the existing account scope.
revoke all on function public.outreach_call_queue(text,text), public.outreach_log_call(text,public.outreach_disposition,timestamptz,text,uuid,text,text) from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then
   revoke all on function public.outreach_call_queue(text,text),public.outreach_log_call(text,public.outreach_disposition,timestamptz,text,uuid,text,text) from anon;
 end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then
   revoke all on function public.outreach_call_queue(text,text),public.outreach_log_call(text,public.outreach_disposition,timestamptz,text,uuid,text,text) from authenticated;
 end if;
 if exists(select 1 from pg_roles where rolname='service_role') then
   grant select,insert,update on public.outreach_audit,public.outreach_suppressions to service_role;
   grant usage,select on sequence public.outreach_audit_id_seq to service_role;
   grant select on public.outreach_eligible_leads to service_role;
   grant execute on function public.outreach_call_queue(text,text),public.outreach_log_call(text,public.outreach_disposition,timestamptz,text,uuid,text,text) to service_role;
 end if;
end $$;
commit;
