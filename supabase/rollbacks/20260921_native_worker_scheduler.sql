begin;
do $$declare job record;begin for job in select jobid from cron.job where jobname in ('victorysync-workflows','victorysync-email-send','victorysync-email-inbox') loop perform cron.unschedule(job.jobid);end loop;end$$;
delete from vault.secrets where name='victorysync_native_worker_token';
drop function if exists public.outreach_schedule_native_workers(text,text);
commit;
