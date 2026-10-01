-- Read-only deployment diagnostics. Run before sending a test notification.
select extname from pg_extension where extname in ('pg_net', 'pg_cron') order by extname;

select event_object_table, trigger_name, action_timing, event_manipulation,
  action_statement from information_schema.triggers
where event_object_schema = 'public'
  and event_object_table in ('leads', 'pipeline_stages', 'pipelines')
  and (trigger_name ilike '%meeting%' or action_statement ilike '%slack%')
order by event_object_table, trigger_name, event_manipulation;

select table_name, column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name in ('leads', 'pipeline_stages')
  and column_name in ('status', 'disposition', 'pipeline_stage_id', 'key',
    'meeting_at', 'meeting_timezone', 'meeting_booked_by', 'meeting_booked_at')
order by table_name, column_name;

select source, status, disposition::text, count(*) from public.leads
where status = 'meeting_booked' or disposition::text = 'meeting_booked'
group by source, status, disposition order by source, status;

select p.name as pipeline, s.key, s.name as stage from public.pipeline_stages s
join public.pipelines p on p.id = s.pipeline_id
where s.key = 'meeting_booked' or lower(s.name) = 'meeting booked'
order by p.name;

select name from vault.secrets where name in
  ('victorysync_slack_meeting_webhook', 'victorysync_leadgen_origin');

select id, status_code, left(error_msg, 250) as error_message,
  left(content, 250) as response_body, created
from net._http_response order by id desc limit 20;

select lead_id, status, http_status, error_message, created_at
from public.slack_notification_log order by id desc limit 20;

select jobname, schedule, command from cron.job
where jobname = 'victorysync-slack-response-check';

-- A transaction verifies INSERT and UPDATE for each source without retaining
-- synthetic leads or sending a webhook. The pg_net queue rolls back too.
begin;
create temporary table meeting_test_results(source text, operation text, lead_id text, logged boolean);
do $$
declare source_name text; test_id uuid;
begin
  foreach source_name in array array['cold_call', 'cold_email', 'inbound', 'referral', 'manual'] loop
    insert into public.leads(first_name, last_name, email, phone, source, status, meeting_at)
    values ('Meeting', 'Test', 'meeting-test-' || replace(gen_random_uuid()::text, '-', '') || '@invalid.test',
      '', source_name, 'meeting_booked', now() + interval '1 day') returning id into test_id;
    insert into meeting_test_results
    select source_name, 'INSERT', test_id::text,
      exists(select 1 from public.slack_notification_log where lead_id = test_id::text);
    update public.leads set status = 'contacted' where id = test_id;
    update public.leads set status = 'meeting_booked', meeting_at = now() + interval '2 days'
      where id = test_id;
    insert into meeting_test_results
    select source_name, 'UPDATE', test_id::text,
      (select count(*) = 2 from public.slack_notification_log where lead_id = test_id::text);
  end loop;
  insert into public.companies(name, contact_name, source, stage, meeting_at)
    values ('Meeting Test Company', 'Meeting Test', 'company_crm',
      'meeting_booked', now() + interval '1 day') returning id into test_id;
  insert into meeting_test_results
    select 'company_crm', 'INSERT', test_id::text,
      exists(select 1 from public.slack_notification_log
        where lead_table = 'companies' and lead_id = test_id::text);
  update public.companies set stage = 'contacted' where id = test_id;
  update public.companies set stage = 'meeting_booked', meeting_at = now() + interval '2 days'
    where id = test_id;
  insert into meeting_test_results
    select 'company_crm', 'UPDATE', test_id::text,
      (select count(*) = 2 from public.slack_notification_log
        where lead_table = 'companies' and lead_id = test_id::text);
end $$;
select source, operation, logged from meeting_test_results order by source, operation;
rollback;
