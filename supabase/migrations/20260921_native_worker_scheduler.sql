begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create or replace function public.outreach_schedule_native_workers(p_origin text,p_secret text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare secret_id uuid;job record;command text;
begin
 if p_origin !~ '^https://[a-zA-Z0-9.-]+$' then raise exception 'Worker origin must be a public HTTPS origin without a path';end if;
 if length(p_secret)<32 then raise exception 'Worker secret must contain at least 32 characters';end if;
 select id into secret_id from vault.secrets where name='victorysync_native_worker_token';
 if secret_id is null then secret_id:=vault.create_secret(p_secret,'victorysync_native_worker_token','Victory Sync native scheduler bearer token');else perform vault.update_secret(secret_id,p_secret);end if;
 for job in select jobid from cron.job where jobname in ('victorysync-workflows','victorysync-email-send','victorysync-email-inbox') loop perform cron.unschedule(job.jobid);end loop;
 command:=format($cmd$select net.http_post(url:=%L,headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='victorysync_native_worker_token'),'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=120000)$cmd$,p_origin||'/api/workflows/process');
 perform cron.schedule('victorysync-workflows','*/2 * * * *',command);
 command:=format($cmd$select net.http_post(url:=%L,headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='victorysync_native_worker_token'),'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=120000)$cmd$,p_origin||'/api/email/process');
 perform cron.schedule('victorysync-email-send','*/2 * * * *',command);
 command:=format($cmd$select net.http_post(url:=%L,headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='victorysync_native_worker_token'),'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=120000)$cmd$,p_origin||'/api/email/poll');
 perform cron.schedule('victorysync-email-inbox','*/5 * * * *',command);
 insert into public.outreach_audit(actor,reason,details) values('system','native_worker_scheduler_configured',jsonb_build_object('origin',p_origin,'jobs',3));
 return jsonb_build_object('configured',true,'jobs',3);
end $$;
revoke all on function public.outreach_schedule_native_workers(text,text) from public,anon,authenticated;
grant execute on function public.outreach_schedule_native_workers(text,text) to service_role;
commit;
