begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

alter table public.pipeline_stages add column if not exists key text;
create unique index if not exists pipeline_stages_pipeline_key_unique
  on public.pipeline_stages (pipeline_id, key) where key is not null;

update public.pipeline_stages set key = 'meeting_booked'
where id in (select distinct on (candidate.pipeline_id) candidate.id
  from public.pipeline_stages candidate
  where lower(btrim(candidate.name)) = 'meeting booked' and candidate.key is null
    and not exists (select 1 from public.pipeline_stages s
      where s.pipeline_id = candidate.pipeline_id and s.key = 'meeting_booked')
  order by candidate.pipeline_id, candidate.position, candidate.id);

insert into public.pipeline_stages (pipeline_id, key, name, color, position)
select p.id, 'meeting_booked', 'Meeting Booked', '#16a34a',
  coalesce((select max(s.position) + 1 from public.pipeline_stages s where s.pipeline_id = p.id), 0)
from public.pipelines p
where not exists (select 1 from public.pipeline_stages s
  where s.pipeline_id = p.id and s.key = 'meeting_booked');

create or replace function public.seed_meeting_booked_stage() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pipeline_stages (pipeline_id, key, name, color, position)
  values (new.id, 'meeting_booked', 'Meeting Booked', '#16a34a', 1)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists seed_meeting_booked_stage on public.pipelines;
create trigger seed_meeting_booked_stage after insert on public.pipelines
for each row execute function public.seed_meeting_booked_stage();

alter table public.leads
  add column if not exists meeting_at timestamptz,
  add column if not exists meeting_timezone text,
  add column if not exists meeting_booked_by uuid,
  add column if not exists meeting_booked_at timestamptz,
  add column if not exists updated_by uuid;

create table if not exists public.slack_notification_log (
  id bigint generated always as identity primary key,
  lead_id text not null,
  event_type text not null default 'meeting_booked',
  request_id bigint,
  status text not null check (status in ('queued', 'delivered', 'failed', 'skipped')),
  http_status integer,
  error_message text,
  created_at timestamptz not null default now(),
  checked_at timestamptz
);
create index if not exists slack_notification_log_request_idx
  on public.slack_notification_log (request_id) where status = 'queued';
alter table public.slack_notification_log enable row level security;
revoke all on public.slack_notification_log from anon, authenticated;

create or replace function public.record_meeting_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare is_meeting_stage boolean;
declare was_meeting_stage boolean := false;
declare booking_transition boolean;
declare status_entered boolean;
declare selected_pipeline uuid;
declare booked_stage uuid;
begin
  if tg_op = 'INSERT' then
    status_entered := true;
  else
    status_entered := old.status is distinct from 'meeting_booked';
    if new.disposition = 'meeting_booked'
       and old.disposition is distinct from new.disposition then
      new.meeting_at := coalesce(new.meeting_at, new.next_action_at);
      new.meeting_timezone := coalesce(new.meeting_timezone, new.timezone::text);
      new.status := 'meeting_booked';
    end if;
    if old.status = 'meeting_booked'
       and new.status is distinct from 'meeting_booked'
       and new.pipeline_stage_id is not distinct from old.pipeline_stage_id then
      new.pipeline_stage_id := null;
    end if;
  end if;
  if new.pipeline_stage_id is not null then
    select s.key = 'meeting_booked' into is_meeting_stage
    from public.pipeline_stages s where s.id = new.pipeline_stage_id;
  end if;
  if tg_op = 'UPDATE' then
    if old.pipeline_stage_id is not null then
      select s.key = 'meeting_booked' into was_meeting_stage
      from public.pipeline_stages s where s.id = old.pipeline_stage_id;
    end if;
  end if;
  if coalesce(is_meeting_stage, false) then new.status := 'meeting_booked'; end if;
  if new.status = 'meeting_booked' and not coalesce(is_meeting_stage, false)
     and status_entered then
    select pipeline_id into selected_pipeline from public.pipeline_stages
      where id = new.pipeline_stage_id;
    select id into booked_stage from public.pipeline_stages
      where key = 'meeting_booked'
        and pipeline_id = coalesce(selected_pipeline,
          (select id from public.pipelines order by is_default desc, created_at limit 1))
      limit 1;
    if booked_stage is not null then new.pipeline_stage_id := booked_stage; end if;
  end if;
  if tg_op = 'INSERT' then
    booking_transition := new.status = 'meeting_booked';
  else
    booking_transition := new.status = 'meeting_booked' and
      (old.status is distinct from 'meeting_booked' or
       (coalesce(is_meeting_stage, false) and not coalesce(was_meeting_stage, false)));
  end if;
  if booking_transition then
    if new.meeting_at is null then
      raise exception 'Meeting date and time are required for Meeting Booked' using errcode = '23514';
    end if;
    new.meeting_booked_at := now();
    new.meeting_booked_by := coalesce(auth.uid(),
      case when current_setting('outreach.booking_actor', true) ~ '^[0-9a-fA-F-]{36}$'
        then current_setting('outreach.booking_actor', true)::uuid end, new.updated_by);
  end if;
  if auth.uid() is not null then new.updated_by := auth.uid();
  elsif booking_transition then new.updated_by := coalesce(new.meeting_booked_by, new.updated_by); end if;
  return new;
end;
$$;
drop trigger if exists record_meeting_booking on public.leads;
create trigger record_meeting_booking before insert or update on public.leads
for each row execute function public.record_meeting_booking();

create or replace function public.notify_slack_meeting_booked() returns trigger
language plpgsql security definer set search_path = '' as $$
declare webhook text;
declare hub_origin text;
declare actor_name text;
declare request_number bigint;
declare lead_name text;
declare ny_time text;
declare cairo_time text;
declare slack_text text;
declare payload jsonb;
declare booking_transition boolean;
begin
  if tg_op = 'INSERT' then
    booking_transition := new.status = 'meeting_booked';
  else
    booking_transition := new.status = 'meeting_booked' and
      (old.status is distinct from new.status or old.meeting_booked_at is distinct from new.meeting_booked_at);
  end if;
  if not booking_transition then return new; end if;
  begin
    select decrypted_secret into webhook from vault.decrypted_secrets
    where name = 'victorysync_slack_meeting_webhook' limit 1;
    select decrypted_secret into hub_origin from vault.decrypted_secrets
    where name = 'victorysync_leadgen_origin' limit 1;
    if webhook is null or webhook !~ '^https://hooks.slack.com/services/' then
      insert into public.slack_notification_log (lead_id, status, error_message)
      values (new.id::text, 'skipped', 'Slack webhook is missing or invalid in Vault');
      return new;
    end if;
    select coalesce(nullif(t.name, ''), u.email, 'N/A') into actor_name
    from auth.users u left join public.team_members t on t.auth_user_id = u.id::text
    where u.id = new.meeting_booked_by limit 1;
    lead_name := coalesce(nullif(btrim(concat_ws(' ', new.first_name, new.last_name)), ''), 'N/A');
    ny_time := case when new.meeting_at is null then 'N/A' else
      to_char(new.meeting_at at time zone 'America/New_York', 'Dy Mon FMDD, FMHH12:MI AM') || ' ET' end;
    cairo_time := case when new.meeting_at is null then 'N/A' else
      to_char(new.meeting_at at time zone 'Africa/Cairo', 'FMHH12:MI AM') || ' Cairo' end;
    slack_text := 'Meeting Booked: ' || lead_name || ' at ' || ny_time || ' (' || cairo_time || ')';
    payload := pg_catalog.jsonb_build_object(
      'text', slack_text,
      'blocks', pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('type','header','text',pg_catalog.jsonb_build_object('type','plain_text','text','Meeting Booked')),
        pg_catalog.jsonb_build_object('type','section','fields',pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('type','mrkdwn','text','*Lead:* ' || lead_name),
          pg_catalog.jsonb_build_object('type','mrkdwn','text','*Company:* ' || coalesce(nullif(new.company,''),'N/A')),
          pg_catalog.jsonb_build_object('type','mrkdwn','text','*Email:* ' || coalesce(nullif(new.email,''),'N/A')),
          pg_catalog.jsonb_build_object('type','mrkdwn','text','*Phone:* ' || coalesce(nullif(new.phone,''),'N/A')),
          pg_catalog.jsonb_build_object('type','mrkdwn','text','*Meeting:* ' || ny_time || ' (' || cairo_time || ')'),
          pg_catalog.jsonb_build_object('type','mrkdwn','text','*Booked by:* ' || coalesce(actor_name,'N/A')),
          pg_catalog.jsonb_build_object('type','mrkdwn','text','*Source:* ' || coalesce(nullif(new.source,''),'N/A')))),
        pg_catalog.jsonb_build_object('type','section','text',pg_catalog.jsonb_build_object(
          'type','mrkdwn','text',case when hub_origin ~ '^https://[^/]+$'
            then '<' || hub_origin || '/leadgen/leads/' || new.id::text || '|Open lead in Lead Gen Hub>'
            else 'Lead Gen Hub link: N/A' end))));
    select net.http_post(url := webhook, body := payload,
      headers := '{"Content-Type":"application/json"}'::jsonb) into request_number;
    insert into public.slack_notification_log (lead_id, request_id, status)
    values (new.id::text, request_number, 'queued');
  exception when others then
    begin
      insert into public.slack_notification_log (lead_id, status, error_message)
      values (new.id::text, 'failed', left(sqlerrm, 1000));
    exception when others then null;
    end;
  end;
  return new;
end;
$$;
drop trigger if exists trg_meeting_booked on public.leads;
drop trigger if exists notify_slack_meeting_booked on public.leads;
create trigger notify_slack_meeting_booked after insert or update on public.leads
for each row execute function public.notify_slack_meeting_booked();

create or replace function public.reconcile_slack_notification_log() returns integer
language plpgsql security definer set search_path = '' as $$
declare changed integer;
declare timed_out integer;
begin
  update public.slack_notification_log l set
    status = case when r.status_code between 200 and 299 and r.error_msg is null
      then 'delivered' else 'failed' end,
    http_status = r.status_code,
    error_message = left(coalesce(r.error_msg, case when r.status_code not between 200 and 299 then r.content end), 1000),
    checked_at = now()
  from net._http_response r where l.status = 'queued' and l.request_id = r.id;
  get diagnostics changed = row_count;
  update public.slack_notification_log set status = 'failed',
    error_message = 'No pg_net response was recorded within ten minutes', checked_at = now()
  where status = 'queued' and created_at < now() - interval '10 minutes';
  get diagnostics timed_out = row_count;
  return changed + timed_out;
end;
$$;
revoke all on function public.reconcile_slack_notification_log() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'victorysync-slack-response-check') then
    perform cron.schedule('victorysync-slack-response-check', '* * * * *',
      'select public.reconcile_slack_notification_log()');
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
