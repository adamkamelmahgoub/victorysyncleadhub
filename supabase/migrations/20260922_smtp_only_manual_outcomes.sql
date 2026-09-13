begin;

do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.email_accounts'::regclass and contype='c' and pg_get_constraintdef(oid) like '%smtp_monitoring_mode%' loop
  execute format('alter table public.email_accounts drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.email_accounts add constraint outreach_smtp_monitoring_mode_check check(smtp_monitoring_mode in ('webhook','inbox','manual'));

do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.email_accounts'::regclass and contype='c' and pg_get_constraintdef(oid) like '%inbound_provider%' loop
  execute format('alter table public.email_accounts drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.email_accounts add constraint outreach_inbound_provider_check check(inbound_provider in ('disabled','imap','resend','manual'));

alter table public.sequence_enrollments
 add column manual_email_outcome text check(manual_email_outcome in ('no_reply','positive_reply','reply','not_interested','hard_bounce','unsubscribed')),
 add column manual_email_outcome_at timestamptz;

create function public.outreach_email_manual_mode(p_mailbox text,p_actor text default 'operator') returns jsonb language plpgsql as $$
declare m public.email_accounts;
begin
 perform pg_advisory_xact_lock(8675309);
 select * into m from public.email_accounts where id::text=p_mailbox for update;
 if not found or m.provider<>'smtp' then raise exception 'SMTP mailbox not found';end if;
 if coalesce(m.smtp_host,'')='' or coalesce(m.smtp_user,'')='' or coalesce(m.smtp_password,'') not like 'enc:v1:%' then raise exception 'Verify SMTP before choosing SMTP-only mode';end if;
 update public.email_accounts set smtp_monitoring_mode='manual',inbound_provider='manual',inbound_credentials=null,
  inbox_checked_at='infinity'::timestamptz,inbox_poll_after='infinity'::timestamptz,inbox_poll_token=null,inbox_locked_at=null,email_engine_enabled=false
 where id=m.id;
 insert into public.outreach_audit(actor,reason,details) values(p_actor,'smtp_manual_outcomes_enabled',jsonb_build_object('mailbox_id',m.id));
 return jsonb_build_object('id',m.id,'mode','manual','saved',true);
end $$;

create function public.outreach_sequence_manual_outcome(p_enrollment text,p_outcome text,p_actor text default 'operator',p_scope text default null) returns jsonb language plpgsql as $$
declare e public.sequence_enrollments;l public.leads;
begin
 perform pg_advisory_xact_lock(8675309);
 if p_outcome not in ('no_reply','positive_reply','reply','not_interested','hard_bounce','unsubscribed') then raise exception 'Invalid email outcome';end if;
 select en.* into e from public.sequence_enrollments en join public.leads x on x.id=en.lead_id
 where en.id::text=p_enrollment and (p_scope is null or x.client_account_id::text=p_scope) for update of en;
 if not found then raise exception 'Enrollment not found';end if;
 select * into l from public.leads where id=e.lead_id;
 perform set_config('outreach.sequence_actor',p_actor,true);
 update public.sequence_enrollments set manual_email_outcome=p_outcome,manual_email_outcome_at=now(),
  status=case when p_outcome in ('positive_reply','reply') then 'replied' when p_outcome in ('not_interested','hard_bounce','unsubscribed') then case when p_outcome='hard_bounce' then 'bounced' else 'stopped' end else status end,
  stopped_reason=case when p_outcome='no_reply' then stopped_reason else 'manual_email_'||p_outcome end,
  next_send_at=case when p_outcome='no_reply' then next_send_at else null end,resume_at=case when p_outcome='no_reply' then resume_at else null end
 where id=e.id returning * into e;
 if p_outcome='hard_bounce' then
  update public.leads set email_verification_status='invalid',verified_at=now(),verified_email=normalized_email where id=l.id;
  insert into public.outreach_suppressions(identity_type,identity_value,reason) select 'email',l.normalized_email,'bounced_hard' where l.normalized_email is not null on conflict do nothing;
 elsif p_outcome='unsubscribed' then
  insert into public.outreach_suppressions(identity_type,identity_value,reason) select 'email',l.normalized_email,'unsubscribed' where l.normalized_email is not null on conflict do nothing;
 elsif p_outcome='not_interested' then
  update public.sequence_enrollments set status='stopped',stopped_reason='manual_email_not_interested',next_send_at=null,resume_at=null where id=e.id;
 end if;
 insert into public.activities(lead_id,type,description) values(l.id,'email','Manual email outcome: '||replace(p_outcome,'_',' '));
 insert into public.outreach_audit(lead_id,actor,reason,details) values(l.id::text,p_actor,'manual_email_outcome',jsonb_build_object('enrollment_id',e.id,'outcome',p_outcome));
 return to_jsonb(e);
end $$;

do $$ declare r text;begin
 foreach r in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=r) then
   execute format('revoke all on function public.outreach_email_manual_mode(text,text) from %I',r);
   execute format('revoke all on function public.outreach_sequence_manual_outcome(text,text,text,text) from %I',r);
  end if;
 end loop;
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.outreach_email_manual_mode(text,text) to service_role;
  grant execute on function public.outreach_sequence_manual_outcome(text,text,text,text) to service_role;
 end if;
end $$;
commit;
