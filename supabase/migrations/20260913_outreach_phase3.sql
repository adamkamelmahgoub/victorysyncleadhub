begin;
-- Preserve the exact installed Phase 1/2 function definitions for rollback.
create table public.outreach_phase3_restore as
select p.proname,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('outreach_email_claim','outreach_email_dispatch_check','outreach_email_finish','outreach_call_queue','outreach_log_call');
create table public.outreach_phase3_legacy_enrollments as select id::text id,status,next_send_at from public.sequence_enrollments;
alter table public.sequence_steps add column channel text not null default 'email' check(channel in ('email','call_task'));
alter table public.sequence_enrollments add column pause_reason text,add column resume_at timestamptz,add column stopped_reason text;
-- Stop legacy schedules; never infer that an old schedule was approved for automatic sending.
update public.sequence_enrollments set status='stopped',next_send_at=null,stopped_reason='phase3_review_required' where status in ('active','paused');
insert into public.outreach_audit(lead_id,actor,reason,details)
 select en.lead_id::text,'system','legacy_sequence_stopped_for_review',jsonb_build_object('enrollment_id',en.id)
 from public.sequence_enrollments en join public.outreach_phase3_legacy_enrollments old on old.id=en.id::text where old.status in ('active','paused');
alter table public.sequence_enrollments add constraint outreach_enrollment_status_check check(status in ('active','paused','replied','stopped','completed','bounced')) not valid;
create unique index outreach_one_cadence_per_lead on public.sequence_enrollments(lead_id) where status in ('active','paused');
alter table public.email_accounts
 add column inbound_provider text not null default 'disabled' check(inbound_provider in ('disabled','imap','resend')),
 add column inbound_credentials text,
 add column inbox_configured_at timestamptz,
 add column inbox_checked_at timestamptz,
 add column inbox_cursor jsonb not null default '{}',
 add column inbox_poll_after timestamptz not null default now(),
 add column inbox_poll_token uuid,add column inbox_locked_at timestamptz,
 add constraint outreach_inbound_encrypted check(inbound_credentials is null or inbound_credentials like 'enc:v1:%');
alter table public.outreach_email_jobs add column sequence_step_number integer,add column rfc_message_id text;
create unique index outreach_one_job_per_step on public.outreach_email_jobs(enrollment_id,sequence_step_number) where sequence_step_number is not null;
alter table public.contact_tasks add column outreach_enrollment_id text,add column outreach_job_id uuid references public.outreach_email_jobs(id),
 add column outreach_step_number integer,add column outreach_status text check(outreach_status in ('pending','completed','cancelled'));
create unique index outreach_one_call_per_email on public.contact_tasks(outreach_job_id) where outreach_job_id is not null;
create unique index outreach_one_call_per_step on public.contact_tasks(outreach_enrollment_id,outreach_step_number) where outreach_step_number is not null;
create table public.outreach_inbound_messages(
 id uuid primary key default gen_random_uuid(),mailbox_id text not null,provider_id text not null,
 from_email text not null,from_domain text not null,subject text not null default '',body text not null default '',
 received_at timestamptz not null,recorded_at timestamptz not null default now(),
 is_auto_reply boolean not null default false,return_at timestamptz,
 unique(mailbox_id,provider_id)
);
create index outreach_inbound_domain on public.outreach_inbound_messages(from_domain,received_at);

create function public.outreach_sequence_guard() returns trigger language plpgsql as $$
#variable_conflict use_column
begin
 perform pg_advisory_xact_lock(8675309);
 if tg_op='UPDATE' and old.status in ('replied','stopped','completed','bounced') and new.status in ('active','paused') then raise exception 'Ended enrollments cannot be resumed; create a new enrollment';end if;
 if new.status in ('active','paused') then
  if not exists(select 1 from public.outreach_eligible_leads l where l.id=new.lead_id and l.email_verification_status='valid' and l.verified_email=l.normalized_email and l.timezone_confirmed and (l.disposition is null or l.disposition not in ('meeting_booked','not_interested','wrong_number','dnc'))) then raise exception 'Lead is not eligible for a sequence';end if;
  if exists(select 1 from public.outreach_inbound_messages i join public.leads l on l.id=new.lead_id where not i.is_auto_reply and (i.from_email=l.normalized_email or i.from_domain=split_part(l.normalized_email,'@',2))) then raise exception 'A reply from this contact or domain already ended outreach';end if;
  if new.next_send_at is null then raise exception 'An active or paused enrollment needs a next step time';end if;
  if tg_op='INSERT' and not exists(select 1 from public.email_accounts where id=new.assigned_mailbox_id and inbound_provider<>'disabled' and inbox_checked_at>=now()-interval '10 minutes') then raise exception 'A healthy monitored inbox is required';end if;
 end if;
 return new;
end $$;
create trigger outreach_sequence_guard before insert or update on public.sequence_enrollments for each row execute function public.outreach_sequence_guard();

create function public.outreach_sequence_state_changed() returns trigger language plpgsql as $$
#variable_conflict use_column
declare j record;t record;
begin
 if tg_op='INSERT' or new.status is distinct from old.status then
  insert into public.outreach_audit(lead_id,actor,reason,details) values(new.lead_id::text,coalesce(nullif(current_setting('outreach.sequence_actor',true),''),'system'),'sequence_'||new.status,jsonb_build_object('enrollment_id',new.id,'reason',coalesce(new.stopped_reason,new.pause_reason)));
 end if;
 if new.status in ('replied','stopped','completed','bounced') then
  for j in update public.outreach_email_jobs set state='cancelled',failure_reason='enrollment_'||new.status where enrollment_id=new.id::text and state='queued' returning id loop
   insert into public.outreach_audit(lead_id,actor,reason,details) values(new.lead_id::text,'system','sequence_job_cancelled',jsonb_build_object('job_id',j.id,'status',new.status));
  end loop;
  -- Completed email sequences keep their final linked call task due. Stops cancel it.
  if new.status<>'completed' then
   for t in update public.contact_tasks set outreach_status='cancelled',is_completed=true,completed_at=now() where outreach_enrollment_id=new.id::text and outreach_status='pending' returning id loop
    insert into public.outreach_audit(lead_id,actor,reason,details) values(new.lead_id::text,'system','sequence_call_cancelled',jsonb_build_object('task_id',t.id));
   end loop;
  end if;
 end if;
 return null;
end $$;
create trigger outreach_sequence_state_changed after insert or update on public.sequence_enrollments for each row execute function public.outreach_sequence_state_changed();

create function public.outreach_sequence_lead_changed() returns trigger language plpgsql as $$
#variable_conflict use_column
begin
 if new.dnc or new.suppressed_reason is not null or new.disposition in ('meeting_booked','not_interested','wrong_number','dnc') then
  update public.sequence_enrollments set status=case when new.suppressed_reason='bounced_hard' then 'bounced' else 'stopped' end,stopped_reason=coalesce(new.suppressed_reason::text,new.disposition::text,'suppressed'),resume_at=null,next_send_at=null where lead_id=new.id and status in ('active','paused');
  update public.contact_tasks set outreach_status='cancelled',is_completed=true,completed_at=now() where lead_id=new.id and outreach_status='pending';
 elsif new.normalized_email is distinct from old.normalized_email or new.email_verification_status<>'valid' then
  update public.sequence_enrollments set status='stopped',stopped_reason='email_changed_or_unverified',next_send_at=null,resume_at=null where lead_id=new.id and status in ('active','paused');
 end if;
 return null;
end $$;
create trigger outreach_sequence_lead_changed after update on public.leads for each row execute function public.outreach_sequence_lead_changed();

create function public.outreach_sequence_mailbox_changed() returns trigger language plpgsql as $$
#variable_conflict use_column
begin
 if new.status in ('paused','burned') or not new.email_engine_enabled then
  update public.sequence_enrollments set status='stopped',stopped_reason='mailbox_unavailable',next_send_at=null,resume_at=null where assigned_mailbox_id=new.id and status='paused';
 end if;
 return null;
end $$;
create trigger outreach_sequence_mailbox_changed after update on public.email_accounts for each row execute function public.outreach_sequence_mailbox_changed();

create function public.outreach_sequence_task_changed() returns trigger language plpgsql as $$
begin
 if new.outreach_enrollment_id is not null and (tg_op='INSERT' or new.outreach_status is distinct from old.outreach_status or new.due_date is distinct from old.due_date) then
  insert into public.outreach_audit(lead_id,actor,reason,details) values(new.lead_id::text,'system','sequence_call_task_changed',jsonb_build_object('task_id',new.id,'state',new.outreach_status,'due_at',new.due_date));
 end if;
 return null;
end $$;
create trigger outreach_sequence_task_changed after insert or update on public.contact_tasks for each row execute function public.outreach_sequence_task_changed();
create function public.outreach_sequence_job_changed() returns trigger language plpgsql as $$
begin
 if new.enrollment_id is not null and new.not_before is distinct from old.not_before then
  insert into public.outreach_audit(lead_id,actor,reason,details) values(new.lead_id::text,'system','sequence_email_rescheduled',jsonb_build_object('job_id',new.id,'not_before',new.not_before));
 end if;
 return null;
end $$;
create trigger outreach_sequence_job_changed after update on public.outreach_email_jobs for each row execute function public.outreach_sequence_job_changed();

create function public.outreach_sequence_template(p_template text,p_lead jsonb) returns text language plpgsql immutable as $$
declare result text:=p_template;k text;v text;
begin
 foreach k in array array['firstName','first_name','lastName','company','city','avg_job_value','missed_calls_per_week','after_hours_coverage','uses_answering_service'] loop
 v:=case k when 'firstName' then p_lead->>'first_name' when 'lastName' then p_lead->>'last_name' when 'city' then p_lead->'custom_fields'->>'city' else p_lead->>k end;
 result:=replace(result,'{{'||k||'}}',coalesce(v,''));
 end loop;
 if result ~ '\{\{[^}]+\}\}' then raise exception 'Unsupported template variable';end if;
 return result;
end $$;

create function public.outreach_sequence_advance(p_enrollment text,p_at timestamptz) returns void language plpgsql as $$
#variable_conflict use_column
declare e public.sequence_enrollments;s public.sequence_steps;
begin
 select * into e from public.sequence_enrollments where id::text=p_enrollment for update;
 if not found or e.status not in ('active','paused') then return;end if;
 select * into s from public.sequence_steps where sequence_id=e.sequence_id and step_number>e.current_step order by step_number limit 1;
 if found then
  update public.sequence_enrollments set current_step=s.step_number,next_send_at=p_at+make_interval(hours=>s.delay_days*24) where id=e.id;
  insert into public.outreach_audit(lead_id,actor,reason,details) values(e.lead_id::text,'system','sequence_step_advanced',jsonb_build_object('enrollment_id',e.id,'step',s.step_number));
 else update public.sequence_enrollments set status='completed',next_send_at=null,completed_at=p_at where id=e.id;end if;
end $$;

create function public.outreach_sequence_inbound(p_mailbox text,p_event text,p_from text,p_subject text,p_body text,p_received timestamptz,p_auto boolean,p_return timestamptz) returns jsonb language plpgsql as $$
#variable_conflict use_column
declare i public.outreach_inbound_messages;e record;return_time timestamptz;affected int:=0;logged_leads text[]:='{}';
begin
 perform pg_advisory_xact_lock(8675309);
 perform set_config('outreach.sequence_actor','system',true);
 if not exists(select 1 from public.email_accounts where id::text=p_mailbox and inbound_provider<>'disabled') then raise exception 'Inbound mailbox is not configured';end if;
 if public.outreach_email(p_from) is null or p_event is null or length(p_event)>500 or p_received is null then raise exception 'Invalid inbound message';end if;
 return_time:=case when p_return>now() then p_return else now()+interval '168 hours' end;
 insert into public.outreach_inbound_messages(mailbox_id,provider_id,from_email,from_domain,subject,body,received_at,is_auto_reply,return_at)
 values(p_mailbox,p_event,public.outreach_email(p_from),split_part(public.outreach_email(p_from),'@',2),left(coalesce(p_subject,''),998),left(coalesce(p_body,''),50000),least(p_received,now()),p_auto,case when p_auto then return_time end)
 on conflict do nothing returning * into i;
 if not found then return jsonb_build_object('duplicate',true);end if;
 for e in select en.* from public.sequence_enrollments en join public.leads l on l.id=en.lead_id where en.status in ('active','paused','completed') and (l.normalized_email=i.from_email or split_part(l.normalized_email,'@',2)=i.from_domain) loop
  affected:=affected+1;
  if p_auto then
   if e.status<>'completed' then update public.sequence_enrollments set status='paused',pause_reason='out_of_office',resume_at=greatest(coalesce(resume_at,return_time),return_time),next_send_at=greatest(next_send_at,return_time) where id=e.id;end if;
   update public.outreach_email_jobs set not_before=greatest(not_before,return_time) where enrollment_id=e.id::text and state='queued';
   update public.contact_tasks set due_date=greatest(due_date,return_time) where outreach_enrollment_id=e.id::text and outreach_status='pending';
  else update public.sequence_enrollments set status='replied',stopped_reason='domain_reply',next_send_at=null,resume_at=null where id=e.id;end if;
  if not e.lead_id::text=any(logged_leads) then
   insert into public.activities(lead_id,type,description) values(e.lead_id,'email',case when p_auto then 'Out-of-office reply: ' else 'Inbound reply: ' end||i.subject||E'\n'||left(i.body,5000));
   logged_leads:=array_append(logged_leads,e.lead_id::text);
  end if;
 end loop;
 insert into public.outreach_audit(actor,reason,details) values('system',case when p_auto then 'out_of_office_recorded' else 'reply_recorded' end,jsonb_build_object('inbound_id',i.id,'affected',affected));
 return jsonb_build_object('duplicate',false,'affected',affected);
end $$;

create function public.outreach_sequence_tick() returns integer language plpgsql as $$
#variable_conflict use_column
declare e public.sequence_enrollments;s public.sequence_steps;l public.leads;j jsonb;token text;n int:=0;t record;
begin
 perform pg_advisory_xact_lock(8675309);
 perform set_config('outreach.sequence_actor','system',true);
 if not (select engine_enabled from public.outreach_email_settings) then return 0;end if;
 -- Recheck every stop condition before automatic OOO resumption.
 update public.sequence_enrollments en set status='active',pause_reason=null,resume_at=null
 where en.status='paused' and en.pause_reason='out_of_office' and en.resume_at<=now()
 and exists(select 1 from public.outreach_eligible_leads l where l.id=en.lead_id and l.email_verification_status='valid' and (l.disposition is null or l.disposition not in ('meeting_booked','not_interested','wrong_number','dnc')))
 and exists(select 1 from public.email_accounts m where m.id=en.assigned_mailbox_id and m.status='active' and m.email_engine_enabled and m.inbox_checked_at>=now()-interval '10 minutes')
 and exists(select 1 from public.sequences q where q.id=en.sequence_id and q.status='active');
 for e in select en.* from public.sequence_enrollments en join public.sequences q on q.id=en.sequence_id join public.email_accounts m on m.id=en.assigned_mailbox_id
 where en.status='active' and q.status='active' and en.next_send_at<=now() and m.status='active' and m.email_engine_enabled and m.inbound_provider<>'disabled' and m.inbox_checked_at>=now()-interval '10 minutes'
 order by en.next_send_at,en.id limit 100 loop
  begin
  select * into s from public.sequence_steps where sequence_id=e.sequence_id and step_number=e.current_step;
  if not found then update public.sequence_enrollments set status='stopped',stopped_reason='missing_step',next_send_at=null where id=e.id;continue;end if;
  select * into l from public.outreach_eligible_leads where id=e.lead_id;
  if not found then continue;end if;
  if s.channel='call_task' then
   insert into public.contact_tasks(lead_id,title,description,due_date,priority,outreach_enrollment_id,outreach_step_number,outreach_status)
   values(l.id,'Sequence call',public.outreach_sequence_template(s.body,to_jsonb(l)),now(),'medium',e.id::text,s.step_number,'pending') on conflict do nothing;
   insert into public.outreach_audit(lead_id,actor,reason,details) values(l.id::text,'system','sequence_call_created',jsonb_build_object('enrollment_id',e.id,'step',s.step_number));
   perform public.outreach_sequence_advance(e.id::text,now());n:=n+1;
  elsif not exists(select 1 from public.outreach_email_jobs where enrollment_id=e.id::text and sequence_step_number=e.current_step) then
   token:=replace(translate(encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'base64'),'+/','-_'),'=','');
   j:=public.outreach_email_enqueue(l.id::text,public.outreach_sequence_template(s.subject,to_jsonb(l)),public.outreach_sequence_template(s.body,to_jsonb(l)),e.assigned_mailbox_id::text,e.id::text,token,encode(sha256(convert_to(token,'UTF8')),'hex'),'system');
   update public.outreach_email_jobs set sequence_step_number=e.current_step where id=(j->>'id')::uuid;n:=n+1;
  end if;
  exception when check_violation or raise_exception then
   update public.sequence_enrollments set status='paused',pause_reason='scheduling_failed',resume_at=null where id=e.id;
   insert into public.outreach_email_alerts(mailbox_id,reason) values(e.assigned_mailbox_id::text,'sequence_scheduling_failed') on conflict do nothing;
  end;
 end loop;
 return n;
end $$;

alter function public.outreach_email_claim() rename to outreach_email_claim_phase2;
create function public.outreach_email_claim() returns jsonb language plpgsql as $$
#variable_conflict use_column
declare result jsonb;
begin
 perform pg_advisory_xact_lock(8675309);
 perform public.outreach_sequence_tick();
 -- Hold paused/unmonitored work before the Phase 2 claimer can cancel or reserve it.
 update public.outreach_email_jobs j set not_before=greatest(j.not_before,now()+interval '5 minutes') from public.sequence_enrollments e,public.email_accounts m,public.sequences q
 where j.enrollment_id=e.id::text and m.id=e.assigned_mailbox_id and q.id=e.sequence_id and j.state='queued'
 and (e.status='paused' or q.status<>'active' or m.inbound_provider='disabled' or m.inbox_checked_at is null or m.inbox_checked_at<now()-interval '10 minutes');
 result:=public.outreach_email_claim_phase2();
 if result is not null then
  result:=result||jsonb_build_object('phase3',true,'thread',coalesce((select jsonb_build_object('inReplyTo',j.rfc_message_id,'references',j.rfc_message_id) from public.outreach_email_jobs j where j.enrollment_id=result->'job'->>'enrollment_id' and j.state='sent' and j.rfc_message_id is not null order by j.sent_at desc limit 1),'{}'::jsonb));
 end if;
 return result;
end $$;
alter function public.outreach_email_dispatch_check(uuid,uuid) rename to outreach_email_dispatch_check_phase2;
create function public.outreach_email_dispatch_check(p_job uuid,p_claim uuid) returns boolean language sql stable as $$
 select public.outreach_email_dispatch_check_phase2(p_job,p_claim) and not exists(
 select 1 from public.outreach_email_jobs j join public.sequence_enrollments e on e.id::text=j.enrollment_id join public.sequences q on q.id=e.sequence_id join public.email_accounts m on m.id=j.mailbox_id join public.leads l on l.id=j.lead_id
 where j.id=p_job and (e.status<>'active' or q.status<>'active' or m.inbound_provider='disabled' or m.inbox_checked_at is null or m.inbox_checked_at<now()-interval '10 minutes'
 or exists(select 1 from public.outreach_inbound_messages i where not i.is_auto_reply and (i.from_email=l.normalized_email or i.from_domain=split_part(l.normalized_email,'@',2)))))
$$;
create function public.outreach_sequence_release(p_job uuid,p_claim uuid) returns void language plpgsql as $$
#variable_conflict use_column
declare j public.outreach_email_jobs;
begin
 perform pg_advisory_xact_lock(8675309);
 select * into j from public.outreach_email_jobs where id=p_job and claim_token=p_claim and state='dispatching';if not found then return;end if;
 if j.enrollment_id is not null and exists(select 1 from public.sequence_enrollments where id::text=j.enrollment_id and status in ('active','paused')) then
  update public.outreach_email_jobs set state='queued',not_before=now()+interval '5 minutes',claim_token=null where id=j.id;
 else update public.outreach_email_jobs set state='cancelled',failure_reason='dispatch_recheck_blocked' where id=j.id;end if;
 insert into public.outreach_audit(lead_id,actor,reason,details) values(j.lead_id::text,'system','dispatch_held_after_recheck',jsonb_build_object('job_id',j.id));
end $$;
alter function public.outreach_email_finish(uuid,uuid,text,text) rename to outreach_email_finish_phase2;
create function public.outreach_email_finish(p_job uuid,p_claim uuid,p_state text,p_message_id text default null) returns void language plpgsql as $$
#variable_conflict use_column
declare j public.outreach_email_jobs;e public.sequence_enrollments;task record;
begin
 perform pg_advisory_xact_lock(8675309);
 select * into j from public.outreach_email_jobs where id=p_job and claim_token=p_claim;
 if not found or j.state not in ('dispatching','unknown') then return;end if;
 perform public.outreach_email_finish_phase2(p_job,p_claim,p_state,p_message_id);
 if j.enrollment_id is null then return;end if;
 select * into e from public.sequence_enrollments where id::text=j.enrollment_id;
 if p_state='sent' and e.status in ('active','paused') then
  if (select provider='smtp' from public.email_accounts where id=j.mailbox_id) then update public.outreach_email_jobs set rfc_message_id=p_message_id where id=j.id;end if;
  insert into public.contact_tasks(lead_id,title,description,due_date,priority,outreach_enrollment_id,outreach_job_id,outreach_status)
  values(j.lead_id,'Follow up on email',j.subject||E'\n'||j.body,greatest(now()+interval '48 hours',coalesce(e.resume_at,now())),'medium',j.enrollment_id,j.id,'pending') on conflict do nothing returning id into task;
  if found then insert into public.outreach_audit(lead_id,actor,reason,details) values(j.lead_id::text,'system','email_followup_call_created',jsonb_build_object('job_id',j.id,'task_id',task.id));end if;
  perform public.outreach_sequence_advance(j.enrollment_id,now());
 elsif p_state in ('failed','unknown') and e.status='active' then
  update public.sequence_enrollments set status='paused',pause_reason='send_'||p_state,resume_at=null where id=e.id;
 end if;
end $$;

create or replace function public.outreach_call_queue(p_timezone text default null,p_client text default null) returns jsonb language sql stable as $$
 with eligible as (
 select l.*,t.id outreach_task_id,t.description email_context,
 case when t.id is not null or l.attempt_count>0 then 'due' else 'fresh' end queue_section,
 greatest(l.next_action_at,t.due_date) queue_due_at
 from public.outreach_eligible_leads l left join lateral (
  select ct.* from public.contact_tasks ct left join public.sequence_enrollments e on e.id::text=ct.outreach_enrollment_id
  where ct.lead_id=l.id and ct.outreach_status='pending' and not ct.is_completed and ct.due_date<=now() and coalesce(e.status,'completed') in ('active','completed') order by ct.due_date,ct.id limit 1
 ) t on true
 where l.timezone_confirmed and l.timezone<>'Etc/UTC' and l.normalized_phone is not null and (l.disposition is null or l.disposition not in ('wrong_number','not_interested','dnc','meeting_booked'))
 and l.next_action_at<=now()
 and (t.id is not null or l.attempt_count>0 or not exists(select 1 from public.sequence_enrollments ce where ce.lead_id=l.id and (ce.status in ('active','paused') or ce.status='completed' and exists(select 1 from public.contact_tasks ct where ct.outreach_enrollment_id=ce.id::text and ct.outreach_status='pending'))))
 and (p_timezone is null or l.timezone::text=p_timezone) and (p_client is null or l.client_account_id::text=p_client) and public.outreach_call_window(now(),l.timezone)
 ),due as(select * from eligible where queue_section='due' order by queue_due_at,id limit 100),fresh as(select * from eligible where queue_section='fresh' order by created_at,id limit 100)
 select jsonb_build_object('due',coalesce((select jsonb_agg(due order by queue_due_at,id) from due),'[]'::jsonb),'fresh',coalesce((select jsonb_agg(fresh order by created_at,id) from fresh),'[]'::jsonb),'needsTimezone',(select count(*) from public.outreach_eligible_leads where not timezone_confirmed and (p_client is null or client_account_id::text=p_client)),'asOf',now())
$$;
alter function public.outreach_log_call(text,public.outreach_disposition,timestamptz,text,uuid,text,text) rename to outreach_log_call_phase1;
create function public.outreach_log_call(p_lead_id text,p_disposition public.outreach_disposition,p_next_action_at timestamptz,p_notes text,p_request_id uuid,p_actor text,p_client text default null) returns jsonb language plpgsql as $$
#variable_conflict use_column
declare result jsonb;t record;
begin
 perform pg_advisory_xact_lock(8675309);
 if exists(select 1 from public.outreach_audit where reason='call_logged' and lead_id=p_lead_id and details->>'request_id'=p_request_id::text) then return public.outreach_log_call_phase1(p_lead_id,p_disposition,p_next_action_at,p_notes,p_request_id,p_actor,p_client);end if;
 result:=public.outreach_log_call_phase1(p_lead_id,p_disposition,p_next_action_at,p_notes,p_request_id,p_actor,p_client);
 for t in update public.contact_tasks set outreach_status='completed',is_completed=true,completed_at=now() where lead_id::text=p_lead_id and outreach_status='pending' and due_date<=now() returning id loop
  insert into public.outreach_audit(lead_id,actor,reason,details) values(p_lead_id,'system','sequence_call_completed',jsonb_build_object('task_id',t.id,'request_id',p_request_id));
 end loop;
 return result;
end $$;

-- Seed a draft, editable four-email cadence. Delays are relative to the previous step.
create table public.outreach_phase3_seed(sequence_id text primary key);
do $$ declare s public.sequences;begin
 insert into public.sequences(name,status) values('Victory Sync - missed-call follow-up','draft') returning * into s;
 insert into public.outreach_phase3_seed values(s.id::text);
 insert into public.sequence_steps(sequence_id,step_number,channel,delay_days,subject,body) values
 (s.id,1,'email',0,'Quick question for {{company}}',E'Hi {{firstName}},\n\nHow does {{company}} handle calls when the team is on a job? We help home service teams follow up on missed calls. Is that something you are looking at?\n\nVictory Sync'),
 (s.id,2,'email',3,'Quick question for {{company}}',E'Hi {{firstName}},\n\nFollowing up on my note about missed calls. Who handles after-hours inquiries at {{company}}?\n\nVictory Sync'),
 (s.id,3,'email',4,'Quick question for {{company}}',E'Hi {{firstName}},\n\nWould a short conversation about your call follow-up process be useful? Happy to work around the schedule at {{company}}.\n\nVictory Sync'),
 (s.id,4,'email',5,'Quick question for {{company}}',E'Hi {{firstName}},\n\nOne last note from me. If missed-call follow-up is a priority for {{company}}, reply and we can compare notes.\n\nVictory Sync');
end $$;
insert into public.outreach_audit(actor,reason,details) values('system','sequence_engine_installed','{}');
-- Secure the core migration before committing, even if the admin migration is applied later.
do $$ declare t text;f record;r text;begin
 foreach t in array array['outreach_phase3_restore','outreach_phase3_legacy_enrollments','outreach_phase3_seed','outreach_inbound_messages'] loop
  execute format('alter table public.%I enable row level security',t);
  if exists(select 1 from pg_roles where rolname='service_role') then execute format('grant select,insert,update,delete on public.%I to service_role',t);end if;
 end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'outreach_sequence_%' or p.proname in ('outreach_email_claim','outreach_email_dispatch_check','outreach_email_finish','outreach_log_call')) loop
  execute format('revoke all on function %s from public',f.sig);
  foreach r in array array['anon','authenticated'] loop if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on function %s from %I',f.sig,r);end if;end loop;
  if exists(select 1 from pg_roles where rolname='service_role') then execute format('grant execute on function %s to service_role',f.sig);end if;
 end loop;
end $$;
commit;
