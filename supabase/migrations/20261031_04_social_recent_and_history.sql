begin;

alter table public.social_unipile_sync_state
  add column if not exists history_next_sync_at timestamptz not null default now();
create index if not exists social_unipile_history_due_idx
  on public.social_unipile_sync_state(history_next_sync_at)
  where not initial_sync_complete;

do $$ begin
  if exists(select 1 from pg_namespace where nspname='cron') and
    not exists(select 1 from cron.job where jobname='victorysync-social-history') then
    perform cron.schedule('victorysync-social-history','*/30 * * * *',$command$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name='victorysync_leadgen_origin') || '/api/social-history',
        headers := jsonb_build_object('Authorization','Bearer ' ||
          (select decrypted_secret from vault.decrypted_secrets where name='victorysync_native_worker_token'),
          'Content-Type','application/json'),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000);
    $command$);
  end if;
end $$;

-- Rollback: unschedule victorysync-social-history; keep history_next_sync_at for safe rollback.
commit;
