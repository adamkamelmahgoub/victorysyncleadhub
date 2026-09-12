-- Stop the worker and deploy Phase 1 first. Export new email history before rollback.
-- Ciphertexts remain encrypted; this rollback never restores plaintext credentials.
begin;
drop trigger outreach_cancel_suppressed_jobs on public.leads;
drop trigger outreach_verification_guard on public.leads;
drop trigger outreach_enrollment_mailbox on public.sequence_enrollments;
drop trigger outreach_mailbox_changed on public.email_accounts;
drop trigger outreach_mailbox_guard on public.email_accounts;
drop trigger outreach_domain_changed on public.sending_domains;
drop trigger outreach_domain_guard on public.sending_domains;
drop view public.outreach_mailbox_health;
drop function public.outreach_email_admin(text,jsonb,text,text);
drop function public.outreach_email_dispatch_check(uuid,uuid),public.outreach_email_enqueue(text,text,text,text,text,text,text,text,text),public.outreach_email_claim(),public.outreach_email_finish(uuid,uuid,text,text),public.outreach_email_event(text,text,uuid,text,text),public.outreach_email_unsubscribe(text),public.outreach_email_guardrails(),public.outreach_choose_mailbox(),public.outreach_enrollment_mailbox(),public.outreach_mailbox_guard(),public.outreach_mailbox_changed(),public.outreach_domain_guard(),public.outreach_domain_changed(),public.outreach_verification_guard(),public.outreach_cancel_suppressed_jobs();
drop function public.outreach_email_next_slot(timestamptz,text),public.outreach_email_window(timestamptz,text),public.outreach_mailbox_cap(public.outreach_mailbox_status,int,timestamptz,timestamptz);
alter table public.sequence_enrollments drop column assigned_mailbox_id;
drop table public.outreach_email_events,public.outreach_email_jobs,public.outreach_email_alerts;
alter table public.email_accounts drop constraint outreach_encrypted_credentials;
alter table public.email_accounts drop column sending_domain_id,drop column provider,drop column daily_cap,drop column mailbox_timezone,drop column warmup_started_at,drop column status,drop column email_engine_enabled,drop column rotation_credit,drop column next_send_after;
update public.email_accounts m set daily_limit=b.daily_limit,sent_today=b.sent_today,last_sent_reset_at=b.last_sent_reset_at from public.outreach_email_legacy_mailboxes b where m.id::text=b.mailbox_id;
drop view public.outreach_eligible_leads;
alter table public.leads drop column email_verification_status,drop column verified_at,drop column verified_email;
create view public.outreach_eligible_leads with (security_invoker=true) as
 select l.* from public.leads l where not l.dnc and l.suppressed_reason is null
 and not exists(select 1 from public.outreach_suppressions s where (s.identity_type='email' and s.identity_value=l.normalized_email) or (s.identity_type='phone' and s.identity_value=l.normalized_phone));
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant select on public.outreach_eligible_leads to service_role;end if;end $$;
drop table public.sending_domains,public.outreach_email_settings,public.outreach_email_legacy_mailboxes;
drop type public.outreach_mailbox_status,public.outreach_domain_status,public.outreach_verification_status;
commit;
