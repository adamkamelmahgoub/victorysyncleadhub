begin;

-- Sequence enrollment is an operator-approved outreach action. Keep suppression,
-- terminal-disposition, mailbox, reply, and delivery guardrails, but do not make
-- third-party address verification a prerequisite.
create or replace function public.outreach_enrollment_mailbox() returns trigger language plpgsql as $$
declare chosen text;
begin
 if tg_op='UPDATE' and old.assigned_mailbox_id is not null and new.assigned_mailbox_id is distinct from old.assigned_mailbox_id then raise exception 'Sequence mailbox assignment is permanent'; end if;
 if new.status='active' then
  if not exists(select 1 from public.outreach_eligible_leads where id=new.lead_id and normalized_email is not null and (disposition is null or disposition not in ('meeting_booked','not_interested','wrong_number','dnc'))) then raise exception 'Only unsuppressed leads with email addresses can enroll'; end if;
  if new.assigned_mailbox_id is null then
   chosen:=public.outreach_choose_mailbox(); select id into new.assigned_mailbox_id from public.email_accounts where id::text=chosen;
   insert into public.outreach_audit(lead_id,actor,reason,details) values(new.lead_id::text,'system','sequence_mailbox_assigned',jsonb_build_object('mailbox_id',chosen));
  end if;
  if not exists(select 1 from public.email_accounts where id=new.assigned_mailbox_id and status='active' and email_engine_enabled) then raise exception 'Sequence requires an active mailbox'; end if;
 end if;
 return new;
end $$;

create or replace function public.outreach_sequence_guard() returns trigger language plpgsql as $$
#variable_conflict use_column
begin
 perform pg_advisory_xact_lock(8675309);
 if tg_op='UPDATE' and old.status in ('replied','stopped','completed','bounced') and new.status in ('active','paused') then raise exception 'Ended enrollments cannot be resumed; create a new enrollment';end if;
 if new.status in ('active','paused') then
  if not exists(select 1 from public.outreach_eligible_leads l where l.id=new.lead_id and l.normalized_email is not null and (l.disposition is null or l.disposition not in ('meeting_booked','not_interested','wrong_number','dnc'))) then raise exception 'Lead is not eligible for a sequence';end if;
  if exists(select 1 from public.outreach_inbound_messages i join public.leads l on l.id=new.lead_id where not i.is_auto_reply and (i.from_email=l.normalized_email or i.from_domain=split_part(l.normalized_email,'@',2))) then raise exception 'A reply from this contact or domain already ended outreach';end if;
  if new.next_send_at is null then raise exception 'An active or paused enrollment needs a next step time';end if;
  if tg_op='INSERT' and not exists(select 1 from public.email_accounts where id=new.assigned_mailbox_id and inbound_provider<>'disabled' and inbox_checked_at>=now()-interval '10 minutes') then raise exception 'A healthy monitored inbox is required';end if;
 end if;
 return new;
end $$;

create or replace function public.outreach_sequence_lead_changed() returns trigger language plpgsql as $$
#variable_conflict use_column
begin
 if new.dnc or new.suppressed_reason is not null or new.disposition in ('meeting_booked','not_interested','wrong_number','dnc') then
  update public.sequence_enrollments set status=case when new.suppressed_reason='bounced_hard' then 'bounced' else 'stopped' end,stopped_reason=coalesce(new.suppressed_reason::text,new.disposition::text,'suppressed'),resume_at=null,next_send_at=null where lead_id=new.id and status in ('active','paused');
  update public.contact_tasks set outreach_status='cancelled',is_completed=true,completed_at=now() where lead_id=new.id and outreach_status='pending';
 elsif new.normalized_email is distinct from old.normalized_email then
  update public.sequence_enrollments set status='stopped',stopped_reason='email_changed',next_send_at=null,resume_at=null where lead_id=new.id and status in ('active','paused');
 end if;
 return null;
end $$;

create or replace function public.outreach_email_enqueue(p_lead text,p_subject text,p_body text,p_mailbox text,p_enrollment text,p_token text,p_hash text,p_actor text,p_scope text default null) returns jsonb language plpgsql as $$
declare l public.leads;m public.email_accounts;j public.outreach_email_jobs;chosen text;
begin
 perform pg_advisory_xact_lock(8675309);
 select * into l from public.outreach_eligible_leads where id::text=p_lead and (p_scope is null or client_account_id::text=p_scope);
 if not found or l.normalized_email is null or l.disposition in ('meeting_booked','not_interested','wrong_number','dnc') then raise exception 'Lead must be unsuppressed and have an email address'; end if;
 if p_enrollment is not null then
  select assigned_mailbox_id::text into chosen from public.sequence_enrollments where id::text=p_enrollment and lead_id=l.id and status='active';
  if chosen is null then raise exception 'Active enrollment with assigned mailbox required'; end if;
  if p_mailbox is not null and chosen<>p_mailbox then raise exception 'Cannot change sequence mailbox'; end if;
 else chosen:=coalesce(p_mailbox,public.outreach_choose_mailbox()); end if;
 select * into m from public.email_accounts where id::text=chosen;
 if not found or m.status not in ('warming','active') or not m.email_engine_enabled then raise exception 'Mailbox is not enabled'; end if;
 if length(p_subject) not between 1 and 998 or length(p_body) not between 1 and 50000 or p_subject ~ '[\r\n]' or p_body ~ '<[A-Za-z/][^>]*>' then raise exception 'A plain text subject and body are required'; end if;
 insert into public.outreach_email_jobs(lead_id,mailbox_id,enrollment_id,to_email,phone_snapshot,subject,body,not_before,unsubscribe_token,unsubscribe_hash,operator_verification_override)
 values(l.id,m.id,p_enrollment,l.normalized_email,l.normalized_phone,p_subject,p_body,public.outreach_email_next_slot(now(),l.timezone::text),p_token,p_hash,true) returning * into j;
 insert into public.outreach_audit(lead_id,actor,reason,details) values(p_lead,p_actor,'email_queued',jsonb_build_object('job_id',j.id,'mailbox_id',m.id,'verification_override',true));
 return jsonb_build_object('id',j.id,'state',j.state,'notBefore',j.not_before,'mailboxId',m.id);
end $$;

create or replace function public.outreach_cancel_suppressed_jobs() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare j record;
begin
 if new.dnc or new.suppressed_reason is not null or new.disposition in ('meeting_booked','not_interested','wrong_number','dnc') then
  for j in update public.outreach_email_jobs set state='cancelled',failure_reason='lead_ineligible' where lead_id=new.id and state='queued' returning id loop
   insert into public.outreach_audit(lead_id,actor,reason,details) values(new.id::text,'system','email_cancelled_lead_ineligible',jsonb_build_object('job_id',j.id));
  end loop;
 end if;
 return null;
end $$;

do $$ declare definition text;changed text;begin
 select pg_get_functiondef('public.outreach_email_claim_phase2()'::regprocedure) into definition;
 changed:=replace(definition,
  '(not j.operator_verification_override and (l.email_verification_status<>''valid'' or l.verified_email is distinct from l.normalized_email)) or l.normalized_email<>j.to_email or not l.timezone_confirmed or l.disposition in',
  'l.normalized_email<>j.to_email or l.disposition in');
 if changed=definition and position('email_verification_status' in definition)>0 then raise exception 'Unable to remove verification from email claim';end if;
 if changed<>definition then execute changed;end if;

 select pg_get_functiondef('public.outreach_email_dispatch_check_phase2(uuid,uuid)'::regprocedure) into definition;
 changed:=replace(definition,
  '(j.operator_verification_override or (l.email_verification_status=''valid'' and l.verified_email=l.normalized_email)) and j.to_email=l.normalized_email',
  'j.to_email=l.normalized_email');
 changed:=replace(changed,'and l.timezone_confirmed and public.outreach_email_window','and public.outreach_email_window');
 if position('email_verification_status' in changed)>0 then raise exception 'Unable to remove verification from dispatch check';end if;
 if changed<>definition then execute changed;end if;

 select pg_get_functiondef('public.outreach_sequence_tick()'::regprocedure) into definition;
 changed:=replace(definition,
  'l.email_verification_status=''valid''',
  'l.normalized_email is not null');
 if position('email_verification_status' in changed)>0 then raise exception 'Unable to remove verification from sequence scheduler';end if;
 if changed<>definition then execute changed;end if;
end $$;

commit;
