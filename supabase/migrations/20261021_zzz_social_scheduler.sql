begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $schedule$
declare v_job record;
begin
  if not exists (select 1 from vault.decrypted_secrets where name='victorysync_leadgen_origin'
    and decrypted_secret ~ '^https://[a-zA-Z0-9.-]+$') then
    raise exception 'Configure victorysync_leadgen_origin in Vault before scheduling social workers';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name='victorysync_native_worker_token'
    and length(decrypted_secret)>=32) then
    raise exception 'Configure victorysync_native_worker_token in Vault before scheduling social workers';
  end if;
  for v_job in select jobid from cron.job where jobname in ('victorysync-social-worker','victorysync-social-daily') loop
    perform cron.unschedule(v_job.jobid);
  end loop;
  perform cron.schedule('victorysync-social-worker','*/5 * * * *',$command$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='victorysync_leadgen_origin') || '/api/social-worker',
      headers := jsonb_build_object('Authorization','Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name='victorysync_native_worker_token'),
        'Content-Type','application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000);
  $command$);
  perform cron.schedule('victorysync-social-daily','0 5 * * *',$command$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='victorysync_leadgen_origin') || '/api/social-daily',
      headers := jsonb_build_object('Authorization','Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name='victorysync_native_worker_token'),
        'Content-Type','application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000);
  $command$);
end;
$schedule$;

commit;
