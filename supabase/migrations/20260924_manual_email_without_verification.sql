begin;
alter table public.outreach_email_jobs add column if not exists operator_verification_override boolean not null default false;

do $$ declare definition text;changed text;begin
 select pg_get_functiondef('public.outreach_email_claim_phase2()'::regprocedure) into definition;
 changed:=replace(definition,
  'l.email_verification_status<>''valid'' or l.normalized_email<>j.to_email or l.verified_email is distinct from l.normalized_email',
  '(not j.operator_verification_override and (l.email_verification_status<>''valid'' or l.verified_email is distinct from l.normalized_email)) or l.normalized_email<>j.to_email');
 if changed=definition and position('j.operator_verification_override' in definition)=0 then raise exception 'Unable to install manual verification override in email claim';end if;
 if changed<>definition then execute changed;end if;
 select pg_get_functiondef('public.outreach_email_dispatch_check_phase2(uuid,uuid)'::regprocedure) into definition;
 changed:=replace(definition,
  'l.email_verification_status=''valid'' and l.verified_email=l.normalized_email and j.to_email=l.normalized_email',
  '(j.operator_verification_override or (l.email_verification_status=''valid'' and l.verified_email=l.normalized_email)) and j.to_email=l.normalized_email');
 if changed=definition and position('j.operator_verification_override' in definition)=0 then raise exception 'Unable to install manual verification override in dispatch check';end if;
 if changed<>definition then execute changed;end if;
end $$;

create or replace function public.outreach_email_enqueue_manual(p_lead text,p_subject text,p_body text,p_mailbox text,p_token text,p_hash text,p_actor text,p_scope text default null) returns jsonb language plpgsql as $$
declare l public.leads;m public.email_accounts;j public.outreach_email_jobs;chosen text;
begin
 perform pg_advisory_xact_lock(8675309);
 select * into l from public.outreach_eligible_leads where id::text=p_lead and (p_scope is null or client_account_id::text=p_scope);
 if not found or l.normalized_email is null or not l.timezone_confirmed or l.disposition in ('meeting_booked','not_interested','wrong_number','dnc') then raise exception 'Lead must be unsuppressed and have an email and confirmed timezone';end if;
 chosen:=coalesce(p_mailbox,public.outreach_choose_mailbox());select * into m from public.email_accounts where id::text=chosen;
 if not found or m.status not in ('warming','active') or not m.email_engine_enabled then raise exception 'Mailbox is not enabled';end if;
 if length(p_subject) not between 1 and 998 or length(p_body) not between 1 and 50000 or p_subject ~ '[\r\n]' or p_body ~ '<[A-Za-z/][^>]*>' then raise exception 'A plain text subject and body are required';end if;
 insert into public.outreach_email_jobs(lead_id,mailbox_id,to_email,phone_snapshot,subject,body,not_before,unsubscribe_token,unsubscribe_hash,operator_verification_override)
 values(l.id,m.id,l.normalized_email,l.normalized_phone,p_subject,p_body,public.outreach_email_next_slot(now(),l.timezone::text),p_token,p_hash,true) returning * into j;
 insert into public.outreach_audit(lead_id,actor,reason,details) values(p_lead,p_actor,'manual_unverified_email_queued',jsonb_build_object('job_id',j.id,'mailbox_id',m.id,'verification_status',l.email_verification_status));
 return jsonb_build_object('id',j.id,'state',j.state,'not_before',j.not_before,'mailbox_id',m.id,'verification_override',true);
end $$;
revoke all on function public.outreach_email_enqueue_manual(text,text,text,text,text,text,text,text) from public;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.outreach_email_enqueue_manual(text,text,text,text,text,text,text,text) to service_role;end if;end $$;
commit;
