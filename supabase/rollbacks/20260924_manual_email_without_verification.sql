begin;
update public.outreach_email_jobs set state='cancelled',failure_reason='verification_override_rollback' where operator_verification_override and state='queued';
drop function if exists public.outreach_email_enqueue_manual(text,text,text,text,text,text,text,text);
-- Restore the Phase 4 definitions that were captured before this override.
do $$ declare saved_definition text;begin
 select r.definition into saved_definition from public.outreach_phase4_restore r where name='outreach_email_claim_phase2';if saved_definition is not null then execute saved_definition;end if;
 select r.definition into saved_definition from public.outreach_phase4_restore r where name='outreach_email_dispatch_check_phase2';if saved_definition is not null then execute saved_definition;end if;
end $$;
alter table public.outreach_email_jobs drop column if exists operator_verification_override;
commit;
