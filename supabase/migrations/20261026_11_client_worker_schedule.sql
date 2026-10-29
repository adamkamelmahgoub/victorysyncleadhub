begin;

create or replace function public.client_delivery_poll() returns void
language plpgsql security definer set search_path = '' as $$
declare worker_secret text;
begin
  select decrypted_secret into worker_secret from vault.decrypted_secrets
  where name='victorysync_client_delivery_worker' order by created_at desc limit 1;
  if worker_secret is null or length(worker_secret)<32 then return; end if;
  perform net.http_post(
    url:='https://app.victorysync.com/api/client-delivery-worker',
    body:='{"limit":10}'::jsonb,
    headers:=jsonb_build_object('Authorization','Bearer '||worker_secret,'Content-Type','application/json'),
    timeout_milliseconds:=55000
  );
end $$;
revoke all on function public.client_delivery_poll() from public, anon, authenticated;

do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron')
    and exists(select 1 from pg_extension where extname='pg_net') then
    if exists(select 1 from cron.job where jobname='victorysync-client-delivery-minute') then
      perform cron.unschedule('victorysync-client-delivery-minute');
    end if;
    perform cron.schedule('victorysync-client-delivery-minute','* * * * *',
      'select public.client_delivery_poll()');
  end if;
exception when others then null;
end $$;

commit;
