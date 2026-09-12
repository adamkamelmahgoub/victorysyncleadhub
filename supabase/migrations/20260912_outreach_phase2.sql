begin;
-- Run scripts/src/encrypt-mailbox-credentials.ts first if legacy secrets exist.
do $$ begin
 if exists(select 1 from public.email_accounts where smtp_password <> '' and smtp_password not like 'enc:v1:%') then
 raise exception 'Encrypt legacy mailbox credentials with the migration script before applying Phase 2'; end if;
end $$;
create type public.outreach_mailbox_status as enum ('warming','active','paused','burned');
create type public.outreach_domain_status as enum ('warming','active','burned');
create type public.outreach_verification_status as enum ('valid','risky','invalid','unverified');
create table public.sending_domains(
 id uuid primary key default gen_random_uuid(), domain text not null unique check(domain=lower(domain) and domain ~ '^[a-z0-9][a-z0-9.-]+\.[a-z]+$'),
 is_primary boolean not null default false, spf_verified boolean not null default false,
 dkim_verified boolean not null default false,dmarc_verified boolean not null default false,
 dkim_selector text not null default 'default',status public.outreach_domain_status not null default 'warming',
 verified_at timestamptz,created_at timestamptz not null default now()
);
create table public.outreach_email_settings(
 id boolean primary key default true check(id),engine_enabled boolean not null default false,
 global_daily_cap integer not null default 100 check(global_daily_cap between 1 and 100000),
 reset_timezone text not null default 'UTC',primary_domains text[] not null default '{}',direct_link_domains text[] not null default '{}',
 check(not engine_enabled or cardinality(primary_domains)>0)
);
insert into public.outreach_email_settings default values;
create table public.outreach_email_legacy_mailboxes as select id::text mailbox_id,daily_limit,sent_today,last_sent_reset_at from public.email_accounts;
insert into public.sending_domains(domain)
 select distinct lower(split_part(from_email,'@',2)) from public.email_accounts where from_email ~ '^[^@]+@[a-zA-Z0-9.-]+\.[a-zA-Z]+$' on conflict do nothing;
alter table public.email_accounts
 add column sending_domain_id uuid references public.sending_domains(id),
 add column provider text not null default 'smtp' check(provider in ('smtp','resend')),
 add column daily_cap integer not null default 30 check(daily_cap between 1 and 10000),
 add column mailbox_timezone text not null default 'America/New_York',
 add column warmup_started_at timestamptz not null default now(),
 add column status public.outreach_mailbox_status not null default 'warming',
 add column email_engine_enabled boolean not null default false,
 add column rotation_credit numeric not null default 0,
 add column next_send_after timestamptz not null default now(),
 add constraint outreach_encrypted_credentials check(smtp_password like 'enc:v1:%' or (smtp_password='' and not email_engine_enabled));
update public.email_accounts set status='paused',daily_limit=30,daily_cap=30;
update public.email_accounts m set sending_domain_id=d.id from public.sending_domains d where d.domain=lower(split_part(m.from_email,'@',2));
alter table public.leads add column email_verification_status public.outreach_verification_status not null default 'unverified',add column verified_at timestamptz,add column verified_email text;
create or replace view public.outreach_eligible_leads with (security_invoker=true) as
 select l.* from public.leads l where not l.dnc and l.suppressed_reason is null
 and not exists(select 1 from public.outreach_suppressions s where (s.identity_type='email' and s.identity_value=l.normalized_email) or (s.identity_type='phone' and s.identity_value=l.normalized_phone));
do $$ declare lt text; mt text; begin
 select format_type(atttypid,atttypmod) into lt from pg_attribute where attrelid='public.leads'::regclass and attname='id';
 select format_type(atttypid,atttypmod) into mt from pg_attribute where attrelid='public.email_accounts'::regclass and attname='id';
 execute format('alter table public.sequence_enrollments add column assigned_mailbox_id %s references public.email_accounts(id)',mt);
 execute format('create table public.outreach_email_jobs(
 id uuid primary key default gen_random_uuid(),lead_id %s references public.leads(id) on delete set null,
 mailbox_id %s not null references public.email_accounts(id),enrollment_id text,
 to_email text not null,phone_snapshot text,subject text not null,body text not null,
 state text not null default ''queued'' check(state in (''queued'',''dispatching'',''sent'',''failed'',''unknown'',''cancelled'')),
 not_before timestamptz not null,dispatched_at timestamptz,sent_at timestamptz,
 mailbox_day date,global_day date,provider_message_id text,claim_token uuid,
 unsubscribe_hash text not null unique,unsubscribe_token text not null,
 failure_reason text,created_at timestamptz not null default now())',lt,mt);
end $$;
create index outreach_email_due_idx on public.outreach_email_jobs(not_before) where state='queued';
create index outreach_email_budget_idx on public.outreach_email_jobs(mailbox_id,mailbox_day) where dispatched_at is not null;
create index outreach_email_global_budget_idx on public.outreach_email_jobs(global_day) where dispatched_at is not null;
create unique index outreach_email_message_idx on public.outreach_email_jobs(provider_message_id) where provider_message_id is not null;
create table public.outreach_email_events(
 provider text not null,event_id text not null,job_id uuid not null references public.outreach_email_jobs(id),
 type text not null check(type in ('delivered','hard_bounce','complaint')),received_at timestamptz not null default now(),primary key(provider,event_id)
);
create table public.outreach_email_alerts(
 id bigint generated always as identity primary key,mailbox_id text,reason text not null,
 created_at timestamptz not null default now(),acknowledged_at timestamptz
);
create unique index outreach_email_alert_open_idx on public.outreach_email_alerts(mailbox_id,reason) where acknowledged_at is null;

create function public.outreach_mailbox_cap(p_status public.outreach_mailbox_status,p_cap int,p_started timestamptz,p_at timestamptz) returns int language sql immutable as $$
 select case when p_status in ('paused','burned') or p_started>p_at then 0 when p_status='active' then p_cap
 when p_at<p_started+interval '168 hours' then least(5,p_cap) when p_at<p_started+interval '336 hours' then least(15,p_cap)
 when p_at<p_started+interval '504 hours' then least(25,p_cap) else p_cap end
$$;
create function public.outreach_email_window(p_at timestamptz,p_timezone text) returns boolean language sql stable as $$
 select extract(isodow from p_at at time zone p_timezone) between 1 and 5
 and (p_at at time zone p_timezone)::time>=time '08:00' and (p_at at time zone p_timezone)::time<time '17:00'
$$;
create function public.outreach_email_next_slot(p_after timestamptz,p_timezone text) returns timestamptz language plpgsql volatile as $$
declare local_day date; candidate timestamptz; i int;
begin
 local_day:=(p_after at time zone p_timezone)::date;
 for i in 0..8 loop
  candidate:=greatest(p_after,((local_day+i)+time '08:00') at time zone p_timezone)+make_interval(secs=>15+floor(random()*885)::int);
  if public.outreach_email_window(candidate,p_timezone) then return candidate; end if;
 end loop;
 raise exception 'Unable to schedule email window';
end $$;
create function public.outreach_mailbox_guard() returns trigger language plpgsql as $$
declare d public.sending_domains;
begin
 if not exists(select 1 from pg_timezone_names where name=new.mailbox_timezone) then raise exception 'Invalid mailbox timezone'; end if;
 if tg_op='INSERT' then new.warmup_started_at:=now();
 elsif new.warmup_started_at is distinct from old.warmup_started_at then raise exception 'Warmup start cannot be overridden'; end if;
 if tg_op='UPDATE' and (new.from_email<>old.from_email or new.sending_domain_id is distinct from old.sending_domain_id or new.mailbox_timezone<>old.mailbox_timezone or new.provider<>old.provider) then raise exception 'Mailbox identity, provider and reset timezone are immutable; create a new mailbox'; end if;
 if tg_op='UPDATE' and old.status='burned' and new.status<>'burned' then raise exception 'Burned mailboxes cannot be resumed'; end if;
 if new.status='active' and now()<new.warmup_started_at+interval '504 hours' then raise exception 'Warmup ramp cannot be skipped'; end if;
 select * into d from public.sending_domains where id=new.sending_domain_id;
 if not found or lower(split_part(new.from_email,'@',2))<>d.domain then raise exception 'Mailbox must match its sending domain'; end if;
 if (d.is_primary or d.status='burned') and (new.status in ('active','warming') or new.email_engine_enabled) then raise exception 'Primary or burned domains cannot send'; end if;
 if new.email_engine_enabled and (not d.spf_verified or not d.dkim_verified or not d.dmarc_verified or new.smtp_password='') then raise exception 'Verify DNS and configure encrypted credentials before enabling mailbox'; end if;
 new.daily_limit:=new.daily_cap;
 return new;
end $$;
create trigger outreach_mailbox_guard before insert or update on public.email_accounts for each row execute function public.outreach_mailbox_guard();
create function public.outreach_domain_guard() returns trigger language plpgsql as $$
begin
 if tg_op='UPDATE' and (old.is_primary and not new.is_primary or old.domain<>new.domain or old.status='burned' and new.status<>'burned') then raise exception 'Primary designation, domain identity and burned state cannot be cleared'; end if;
 if exists(select 1 from public.outreach_email_settings s,unnest(s.primary_domains) p where new.domain=p or new.domain like '%.'||p) then new.is_primary:=true; end if;
 return new;
end $$;
create trigger outreach_domain_guard before insert or update on public.sending_domains for each row execute function public.outreach_domain_guard();
create function public.outreach_verification_guard() returns trigger language plpgsql as $$
begin
 if tg_op='INSERT' or public.outreach_email(new.email) is distinct from public.outreach_email(old.email) then
 if tg_op='UPDATE' and old.email_verification_status<>'unverified' then
 insert into public.outreach_audit(lead_id,actor,reason,details) values(new.id::text,'system','email_verification_reset','{}');
 end if;
 new.email_verification_status:='unverified';new.verified_at:=null;new.verified_email:=null;
 end if;
 if new.email_verification_status='valid' and (new.verified_at is null or new.verified_email is distinct from public.outreach_email(new.email)) then raise exception 'Verification must match the current email'; end if;
 return new;
end $$;
create trigger outreach_verification_guard before insert or update on public.leads for each row execute function public.outreach_verification_guard();

create function public.outreach_mailbox_changed() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare r record;
begin
 if tg_op='INSERT' or row(new.status,new.email_engine_enabled,new.daily_cap) is distinct from row(old.status,old.email_engine_enabled,old.daily_cap) then
 insert into public.outreach_audit(actor,reason,details) values(coalesce(nullif(current_setting('outreach.email_actor',true),''),'system'),'mailbox_state_changed',jsonb_build_object('mailbox_id',new.id,'status',new.status,'enabled',new.email_engine_enabled,'daily_cap',new.daily_cap)); end if;
 if new.status in ('paused','burned') or not new.email_engine_enabled then
  for r in update public.outreach_email_jobs set state='cancelled',failure_reason='mailbox_unavailable' where mailbox_id=new.id and state='queued' returning id,lead_id loop
    insert into public.outreach_audit(lead_id,actor,reason,details) values(r.lead_id::text,'system','email_cancelled_mailbox_unavailable',jsonb_build_object('job_id',r.id));
  end loop;
  for r in update public.sequence_enrollments set status='stopped' where assigned_mailbox_id=new.id and status='active' returning id,lead_id loop
    insert into public.outreach_audit(lead_id,actor,reason,details) values(r.lead_id::text,'system','sequence_stopped_mailbox_unavailable',jsonb_build_object('enrollment_id',r.id));
  end loop;
 end if;
 if new.status='burned' then perform set_config('outreach.email_actor','system',true);update public.sending_domains set status='burned' where id=new.sending_domain_id and status<>'burned'; end if;
 return null;
end $$;
create trigger outreach_mailbox_changed after insert or update on public.email_accounts for each row execute function public.outreach_mailbox_changed();
create function public.outreach_domain_changed() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.outreach_audit(actor,reason,details) values(coalesce(nullif(current_setting('outreach.email_actor',true),''),'system'),'sending_domain_changed',jsonb_build_object('domain_id',new.id,'status',new.status,'is_primary',new.is_primary));
 if new.is_primary or new.status='burned' then
  perform set_config('outreach.email_actor','system',true);
  update public.email_accounts set status=case when status='burned' then status else 'paused'::public.outreach_mailbox_status end,email_engine_enabled=false where sending_domain_id=new.id and (status not in ('paused','burned') or email_engine_enabled);
  insert into public.outreach_email_alerts(mailbox_id,reason) select id::text,case when new.is_primary then 'primary_domain_blocked' else 'domain_burned' end from public.email_accounts where sending_domain_id=new.id on conflict do nothing;
 end if;
 return null;
end $$;
create trigger outreach_domain_changed after insert or update on public.sending_domains for each row execute function public.outreach_domain_changed();
create view public.outreach_mailbox_health with (security_invoker=true) as
 select m.id,m.from_name,m.from_email,m.provider,m.sending_domain_id,m.status,m.daily_cap,m.mailbox_timezone,m.warmup_started_at,m.email_engine_enabled,m.created_at,
 public.outreach_mailbox_cap(m.status,m.daily_cap,m.warmup_started_at,now()) as effective_cap,
 (select count(*)::int from public.outreach_email_jobs j where j.mailbox_id=m.id and j.dispatched_at is not null and j.mailbox_day=(now() at time zone m.mailbox_timezone)::date) as sent_today,
 coalesce((select count(*) filter(where exists(select 1 from public.outreach_email_events e where e.job_id=j.id and e.type='hard_bounce'))::numeric/nullif(count(*),0) from public.outreach_email_jobs j where j.mailbox_id=m.id and j.dispatched_at>=now()-interval '168 hours'),0) as bounce_rate_7d,
 coalesce((select count(*) filter(where exists(select 1 from public.outreach_email_events e where e.job_id=j.id and e.type='complaint'))::numeric/nullif(count(*),0) from public.outreach_email_jobs j where j.mailbox_id=m.id and j.dispatched_at>=now()-interval '168 hours'),0) as complaint_rate_7d
 from public.email_accounts m;
create function public.outreach_email_guardrails() returns void language plpgsql as $$
declare m record; reason text; j record;
begin
 perform pg_advisory_xact_lock(8675309);
 perform set_config('outreach.email_actor','system',true);
 update public.email_accounts set status='active' where status='warming' and warmup_started_at<=now()-interval '504 hours';
 for m in select * from public.outreach_mailbox_health where status in ('active','warming') loop
 reason:=case when m.complaint_rate_7d>0.001 then 'spam_complaint_rate_exceeded' when m.bounce_rate_7d>0.03 then 'hard_bounce_rate_exceeded' end;
 if reason is not null then
  update public.email_accounts set status='paused' where id=m.id;
  insert into public.outreach_email_alerts(mailbox_id,reason) values(m.id::text,reason) on conflict do nothing;
  insert into public.outreach_audit(actor,reason,details) values('system',reason,jsonb_build_object('mailbox_id',m.id,'bounce_rate_7d',m.bounce_rate_7d,'complaint_rate_7d',m.complaint_rate_7d));
 end if;
 end loop;
 for j in update public.outreach_email_jobs set state='unknown',failure_reason='dispatch_outcome_unknown' where state='dispatching' and dispatched_at<now()-interval '15 minutes' returning id,lead_id,mailbox_id loop
  insert into public.outreach_email_alerts(mailbox_id,reason) values(j.mailbox_id::text,'dispatch_outcome_unknown') on conflict do nothing;
  insert into public.outreach_audit(lead_id,actor,reason,details) values(j.lead_id::text,'system','dispatch_outcome_unknown',jsonb_build_object('job_id',j.id));
 end loop;
end $$;
create function public.outreach_choose_mailbox() returns text language plpgsql as $$
declare chosen text; total numeric;
begin
 perform pg_advisory_xact_lock(8675309);
 perform public.outreach_email_guardrails();
 select sum(greatest(h.effective_cap-h.sent_today,0)) into total from public.outreach_mailbox_health h join public.sending_domains d on d.id=h.sending_domain_id where h.status='active' and h.email_engine_enabled and not d.is_primary and d.status<>'burned' and d.spf_verified and d.dkim_verified and d.dmarc_verified;
 if coalesce(total,0)=0 then raise exception 'No active mailbox capacity available'; end if;
 update public.email_accounts m set rotation_credit=m.rotation_credit+(h.effective_cap-h.sent_today) from public.outreach_mailbox_health h join public.sending_domains d on d.id=h.sending_domain_id where m.id=h.id and h.status='active' and h.email_engine_enabled and h.effective_cap>h.sent_today and not d.is_primary and d.status<>'burned' and d.spf_verified and d.dkim_verified and d.dmarc_verified;
 select m.id::text into chosen from public.email_accounts m join public.outreach_mailbox_health h on h.id=m.id join public.sending_domains d on d.id=m.sending_domain_id where m.status='active' and m.email_engine_enabled and h.effective_cap>h.sent_today and not d.is_primary and d.status<>'burned' and d.spf_verified and d.dkim_verified and d.dmarc_verified order by m.rotation_credit desc,m.id limit 1;
 update public.email_accounts set rotation_credit=rotation_credit-total where id::text=chosen;
 return chosen;
end $$;
create function public.outreach_enrollment_mailbox() returns trigger language plpgsql as $$
declare chosen text;
begin
 if tg_op='UPDATE' and old.assigned_mailbox_id is not null and new.assigned_mailbox_id is distinct from old.assigned_mailbox_id then raise exception 'Sequence mailbox assignment is permanent'; end if;
 if new.status='active' then
  if not exists(select 1 from public.outreach_eligible_leads where id=new.lead_id and email_verification_status='valid' and verified_email=normalized_email) then raise exception 'Only verified eligible leads can enroll'; end if;
  if new.assigned_mailbox_id is null then
   chosen:=public.outreach_choose_mailbox(); select id into new.assigned_mailbox_id from public.email_accounts where id::text=chosen;
   insert into public.outreach_audit(lead_id,actor,reason,details) values(new.lead_id::text,'system','sequence_mailbox_assigned',jsonb_build_object('mailbox_id',chosen));
  end if;
  if not exists(select 1 from public.email_accounts where id=new.assigned_mailbox_id and status='active' and email_engine_enabled) then raise exception 'Sequence requires an active mailbox'; end if;
 end if;
 return new;
end $$;
create trigger outreach_enrollment_mailbox before insert or update on public.sequence_enrollments for each row execute function public.outreach_enrollment_mailbox();

create function public.outreach_email_enqueue(p_lead text,p_subject text,p_body text,p_mailbox text,p_enrollment text,p_token text,p_hash text,p_actor text,p_scope text default null) returns jsonb language plpgsql as $$
declare l public.leads;m public.email_accounts;j public.outreach_email_jobs;chosen text;
begin
 perform pg_advisory_xact_lock(8675309);
 select * into l from public.outreach_eligible_leads where id::text=p_lead and (p_scope is null or client_account_id::text=p_scope);
 if not found or l.email_verification_status<>'valid' or l.verified_email is distinct from l.normalized_email or not l.timezone_confirmed or l.disposition in ('meeting_booked','not_interested','wrong_number','dnc') then raise exception 'Lead must be verified, unsuppressed and have a confirmed timezone'; end if;
 if p_enrollment is not null then
  select assigned_mailbox_id::text into chosen from public.sequence_enrollments where id::text=p_enrollment and lead_id=l.id and status='active';
  if chosen is null then raise exception 'Active enrollment with assigned mailbox required'; end if;
  if p_mailbox is not null and chosen<>p_mailbox then raise exception 'Cannot change sequence mailbox'; end if;
 else chosen:=coalesce(p_mailbox,public.outreach_choose_mailbox()); end if;
 select * into m from public.email_accounts where id::text=chosen;
 if not found or m.status not in ('warming','active') or not m.email_engine_enabled then raise exception 'Mailbox is not enabled'; end if;
 if length(p_subject) not between 1 and 998 or length(p_body) not between 1 and 50000 or p_subject ~ '[\r\n]' or p_body ~ '<[A-Za-z/][^>]*>' then raise exception 'A plain text subject and body are required'; end if;
 insert into public.outreach_email_jobs(lead_id,mailbox_id,enrollment_id,to_email,phone_snapshot,subject,body,not_before,unsubscribe_token,unsubscribe_hash)
 values(l.id,m.id,p_enrollment,l.normalized_email,l.normalized_phone,p_subject,p_body,public.outreach_email_next_slot(now(),l.timezone::text),p_token,p_hash) returning * into j;
 insert into public.outreach_audit(lead_id,actor,reason,details) values(p_lead,p_actor,'email_queued',jsonb_build_object('job_id',j.id,'mailbox_id',m.id));
 return jsonb_build_object('id',j.id,'state',j.state,'notBefore',j.not_before,'mailboxId',m.id);
end $$;
create function public.outreach_email_claim() returns jsonb language plpgsql as $$
declare s public.outreach_email_settings;j public.outreach_email_jobs;l public.leads;m public.email_accounts;d public.sending_domains;used int;cap int;enrollment_ok boolean;
begin
 perform pg_advisory_xact_lock(8675309);
 perform public.outreach_email_guardrails();
 select * into s from public.outreach_email_settings;
 if not s.engine_enabled then return null; end if;
 for j in select * from public.outreach_email_jobs where state='queued' and not_before<=now() order by not_before,id limit 100 loop
  select * into l from public.outreach_eligible_leads where id=j.lead_id;
  enrollment_ok:=j.enrollment_id is null or exists(select 1 from public.sequence_enrollments where id::text=j.enrollment_id and status='active' and assigned_mailbox_id=j.mailbox_id);
  if not found or not enrollment_ok or l.email_verification_status<>'valid' or l.normalized_email<>j.to_email or l.verified_email is distinct from l.normalized_email or not l.timezone_confirmed or l.disposition in ('meeting_booked','not_interested','wrong_number','dnc') then
    update public.outreach_email_jobs set state='cancelled',failure_reason='lead_ineligible' where id=j.id;
    insert into public.outreach_audit(lead_id,actor,reason,details) values(j.lead_id::text,'system','email_cancelled_lead_ineligible',jsonb_build_object('job_id',j.id)); continue;
  end if;
  if not public.outreach_email_window(now(),l.timezone::text) then update public.outreach_email_jobs set not_before=public.outreach_email_next_slot(now(),l.timezone::text) where id=j.id;
    insert into public.outreach_audit(lead_id,actor,reason,details) values(l.id::text,'system','email_held_for_window',jsonb_build_object('job_id',j.id));continue;end if;
  select * into m from public.email_accounts where id=j.mailbox_id for update;
  select * into d from public.sending_domains where id=m.sending_domain_id;
  if m.status not in ('active','warming') or not m.email_engine_enabled or d.is_primary or d.status='burned' or not(d.spf_verified and d.dkim_verified and d.dmarc_verified) or m.next_send_after>now() then continue;end if;
  cap:=public.outreach_mailbox_cap(m.status,m.daily_cap,m.warmup_started_at,now());
  select count(*) into used from public.outreach_email_jobs where mailbox_id=m.id and dispatched_at is not null and mailbox_day=(now() at time zone m.mailbox_timezone)::date;
  if used>=cap then continue;end if;
  if (select count(*) from public.outreach_email_jobs where dispatched_at is not null and global_day=(now() at time zone s.reset_timezone)::date)>=s.global_daily_cap then return null;end if;
  update public.outreach_email_jobs set state='dispatching',dispatched_at=now(),mailbox_day=(now() at time zone m.mailbox_timezone)::date,global_day=(now() at time zone s.reset_timezone)::date,claim_token=gen_random_uuid() where id=j.id returning * into j;
  update public.email_accounts set sent_today=used+1,last_sent_reset_at=now(),next_send_after=now()+make_interval(secs=>45+floor(random()*90)::int) where id=m.id;
  insert into public.outreach_audit(lead_id,actor,reason,details) values(l.id::text,'system','email_capacity_reserved',jsonb_build_object('job_id',j.id,'mailbox_id',m.id));
  return jsonb_build_object('job',to_jsonb(j),'mailbox',to_jsonb(m),'domain',d.domain,'directLinkDomains',s.direct_link_domains);
 end loop;
 return null;
end $$;
create function public.outreach_email_finish(p_job uuid,p_claim uuid,p_state text,p_message_id text default null) returns void language plpgsql as $$
declare j public.outreach_email_jobs;
begin
 perform pg_advisory_xact_lock(8675309);
 if p_state not in ('sent','failed','unknown') then raise exception 'Invalid dispatch outcome';end if;
 select * into j from public.outreach_email_jobs where id=p_job and claim_token=p_claim for update;
 if not found then raise exception 'Unknown email claim';end if;
 if j.state not in ('dispatching','unknown') then return;end if;
 update public.outreach_email_jobs set state=p_state,provider_message_id=coalesce(p_message_id,provider_message_id),sent_at=case when p_state='sent' then now() else sent_at end,failure_reason=case when p_state<>'sent' then 'provider_'||p_state end where id=j.id;
 insert into public.outreach_audit(lead_id,actor,reason,details) values(j.lead_id::text,'system','email_'||p_state,jsonb_build_object('job_id',j.id));
 if p_state='sent' and j.lead_id is not null then insert into public.activities(lead_id,type,description) values(j.lead_id,'email','Email sent: '||j.subject);end if;
 if p_state='unknown' then insert into public.outreach_email_alerts(mailbox_id,reason) values(j.mailbox_id::text,'dispatch_outcome_unknown') on conflict do nothing;end if;
 perform public.outreach_email_guardrails();
end $$;
create function public.outreach_email_dispatch_check(p_job uuid,p_claim uuid) returns boolean language sql stable as $$
 select exists(select 1 from public.outreach_email_jobs j join public.outreach_eligible_leads l on l.id=j.lead_id
 join public.email_accounts m on m.id=j.mailbox_id join public.sending_domains d on d.id=m.sending_domain_id cross join public.outreach_email_settings s
 where j.id=p_job and j.claim_token=p_claim and j.state='dispatching' and s.engine_enabled and m.email_engine_enabled and m.status in ('warming','active')
 and not d.is_primary and d.status<>'burned' and d.spf_verified and d.dkim_verified and d.dmarc_verified
 and j.mailbox_day=(now() at time zone m.mailbox_timezone)::date and j.global_day=(now() at time zone s.reset_timezone)::date
 and l.email_verification_status='valid' and l.verified_email=l.normalized_email and j.to_email=l.normalized_email
 and l.timezone_confirmed and public.outreach_email_window(now(),l.timezone::text)
 and (l.disposition is null or l.disposition not in ('meeting_booked','not_interested','wrong_number','dnc'))
 and (j.enrollment_id is null or exists(select 1 from public.sequence_enrollments e where e.id::text=j.enrollment_id and e.status='active' and e.assigned_mailbox_id=j.mailbox_id)))
$$;
create function public.outreach_email_event(p_provider text,p_event text,p_job uuid,p_message text,p_type text) returns void language plpgsql as $$
declare j public.outreach_email_jobs;added int;
begin
 perform pg_advisory_xact_lock(8675309);
 select * into j from public.outreach_email_jobs where id=p_job or (p_message is not null and provider_message_id=p_message) limit 1;
 if not found or j.dispatched_at is null or not exists(select 1 from public.email_accounts where id=j.mailbox_id and provider=p_provider) then raise exception 'Email event has no matching dispatch';end if;
 insert into public.outreach_email_events(provider,event_id,job_id,type) values(p_provider,p_event,j.id,p_type) on conflict do nothing;
 get diagnostics added=row_count;if added=0 then return;end if;
 if p_type='hard_bounce' then
  update public.leads set email_verification_status='invalid',verified_at=now(),verified_email=normalized_email where normalized_email=j.to_email;
  insert into public.outreach_suppressions(identity_type,identity_value,reason) values('email',j.to_email,'bounced_hard') on conflict do nothing;
 elsif p_type='complaint' then
  insert into public.outreach_suppressions(identity_type,identity_value,reason) values('email',j.to_email,'unsubscribed') on conflict do nothing;
 end if;
 insert into public.outreach_audit(lead_id,actor,reason,details) values(j.lead_id::text,'system','email_event_'||p_type,jsonb_build_object('job_id',j.id,'event_id',p_event));
 perform public.outreach_email_guardrails();
end $$;
create function public.outreach_email_unsubscribe(p_hash text) returns boolean language plpgsql as $$
declare j public.outreach_email_jobs;
begin
 perform pg_advisory_xact_lock(8675309);
 select * into j from public.outreach_email_jobs where unsubscribe_hash=p_hash;
 if not found then return false;end if;
 insert into public.outreach_suppressions(identity_type,identity_value,reason) values('email',j.to_email,'unsubscribed') on conflict do nothing;
 if j.phone_snapshot is not null then insert into public.outreach_suppressions(identity_type,identity_value,reason) values('phone',j.phone_snapshot,'unsubscribed') on conflict do nothing;end if;
 return true;
end $$;
create function public.outreach_cancel_suppressed_jobs() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare j record;
begin
 if new.dnc or new.suppressed_reason is not null or new.disposition in ('meeting_booked','not_interested','wrong_number','dnc') or new.email_verification_status<>'valid' then
  for j in update public.outreach_email_jobs set state='cancelled',failure_reason='lead_ineligible' where lead_id=new.id and state='queued' returning id loop
   insert into public.outreach_audit(lead_id,actor,reason,details) values(new.id::text,'system','email_cancelled_lead_ineligible',jsonb_build_object('job_id',j.id));
  end loop;
 end if;
 return null;
end $$;
create trigger outreach_cancel_suppressed_jobs after update on public.leads for each row execute function public.outreach_cancel_suppressed_jobs();

-- All new data and RPCs are server-only. APIs return explicit safe mailbox fields.
do $$ declare t text;f record;r text; begin
 foreach t in array array['sending_domains','outreach_email_settings','outreach_email_legacy_mailboxes','outreach_email_jobs','outreach_email_events','outreach_email_alerts'] loop
  execute format('alter table public.%I enable row level security',t);
  if exists(select 1 from pg_roles where rolname='service_role') then execute format('grant select,insert,update,delete on public.%I to service_role',t);end if;
 end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'outreach_email_%' or p.proname in ('outreach_choose_mailbox','outreach_mailbox_cap')) loop
  execute format('revoke all on function %s from public',f.sig);
  foreach r in array array['anon','authenticated'] loop if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on function %s from %I',f.sig,r);end if;end loop;
  if exists(select 1 from pg_roles where rolname='service_role') then execute format('grant execute on function %s to service_role',f.sig);end if;
 end loop;
 if exists(select 1 from pg_roles where rolname='service_role') then grant select on public.outreach_mailbox_health to service_role;grant usage,select on sequence public.outreach_email_alerts_id_seq to service_role;end if;
end $$;
insert into public.outreach_audit(actor,reason,details) values('system','email_engine_installed_dark','{}');
commit;
