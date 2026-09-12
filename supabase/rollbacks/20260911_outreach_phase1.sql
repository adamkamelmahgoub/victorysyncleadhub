-- Export outreach_audit and outreach_suppressions before rollback. This reverses
-- the schema but removes Phase 1 protection; never run while outreach is active.
begin;
drop trigger outreach_stop_email on public.leads;
drop trigger outreach_lead_audit on public.leads;
drop trigger outreach_lead_guard on public.leads;
drop trigger outreach_lead_lock on public.leads;
drop trigger outreach_activity_guard on public.activities;
do $$ declare t text; begin
 foreach t in array array['sequence_enrollments','email_logs','campaign_leads'] loop
 if to_regclass('public.'||t) is not null then execute format('drop trigger outreach_email_queue_guard on public.%I',t); end if;
 end loop;
end $$;
drop function public.outreach_stop_email(),public.outreach_email_queue_guard();
drop function public.outreach_call_queue(text,text),public.outreach_log_call(text,public.outreach_disposition,timestamptz,text,uuid,text,text);
drop view public.outreach_eligible_leads;
drop function public.outreach_call_window(timestamptz,public.outreach_timezone);
drop function public.outreach_activity_guard(),public.outreach_lead_guard(),public.outreach_lead_audit();
drop table public.outreach_suppressions;
drop function public.outreach_suppression_guard(),public.outreach_suppression_apply(),public.outreach_write_lock();
alter table public.leads drop constraint outreach_next_action,drop constraint outreach_fresh_next_action,drop constraint outreach_attempt_history;
alter table public.leads alter column disposition type text using disposition::text;
update public.leads l set disposition=b.disposition,contact_attempts=b.contact_attempts from public.outreach_legacy_leads b where l.id::text=b.lead_id;
alter table public.leads drop column timezone,drop column timezone_confirmed,drop column next_action_at,drop column attempt_count,drop column first_attempt_at,drop column revisit_at,drop column dnc,drop column suppressed_reason,drop column normalized_email,drop column normalized_phone,drop column avg_job_value,drop column missed_calls_per_week,drop column after_hours_coverage,drop column uses_answering_service;
drop function public.outreach_derive_timezone(jsonb,text),public.outreach_email(text),public.outreach_phone(text);
drop table public.outreach_audit,public.outreach_legacy_leads;
drop type public.outreach_disposition,public.outreach_suppression_reason,public.outreach_timezone;
commit;
