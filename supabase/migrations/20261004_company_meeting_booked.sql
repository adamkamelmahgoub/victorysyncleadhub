begin;

alter table public.companies
  add column if not exists meeting_at timestamptz,
  add column if not exists meeting_timezone text,
  add column if not exists meeting_booked_by uuid,
  add column if not exists meeting_booked_at timestamptz,
  add column if not exists updated_by uuid;
alter table public.companies drop constraint if exists companies_stage_check;
alter table public.companies add constraint companies_stage_check
  check (stage in ('new','contacted','engaged','qualified','meeting_booked',
    'trial_booked','trial_active','trial_completed','client','disqualified'));
alter table public.slack_notification_log add column if not exists lead_table text not null default 'leads';

create or replace function public.record_company_meeting_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
declare booking_transition boolean;
begin
  if tg_op = 'INSERT' then
    booking_transition := new.stage = 'meeting_booked';
  else
    booking_transition := new.stage = 'meeting_booked' and old.stage is distinct from 'meeting_booked';
  end if;
  if booking_transition then
    if new.meeting_at is null then
      raise exception 'Meeting date and time are required for Meeting Booked' using errcode = '23514';
    end if;
    new.meeting_booked_at := now();
    new.meeting_booked_by := coalesce(auth.uid(), new.updated_by);
  end if;
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;
drop trigger if exists record_company_meeting_booking on public.companies;
create trigger record_company_meeting_booking before insert or update on public.companies
for each row execute function public.record_company_meeting_booking();

create or replace function public.notify_slack_meeting_booked() returns trigger
language plpgsql security definer set search_path = '' as $$
declare row_data jsonb := to_jsonb(new);
declare previous_data jsonb;
declare booked boolean;
declare webhook text;
declare hub_origin text;
declare actor_name text;
declare request_number bigint;
declare lead_name text;
declare company_name text;
declare lead_email text;
declare lead_phone text;
declare lead_source text;
declare lead_path text;
declare ny_time text;
declare cairo_time text;
declare payload jsonb;
declare meeting_time timestamptz;
begin
  if tg_op = 'UPDATE' then previous_data := to_jsonb(old); end if;
  booked := coalesce(row_data->>'status', row_data->>'stage') = 'meeting_booked';
  if tg_op = 'UPDATE' then
    booked := booked and
      (coalesce(previous_data->>'status', previous_data->>'stage') is distinct from 'meeting_booked'
       or previous_data->>'meeting_booked_at' is distinct from row_data->>'meeting_booked_at');
  end if;
  if not booked then return new; end if;
  begin
    select decrypted_secret into webhook from vault.decrypted_secrets
      where name = 'victorysync_slack_meeting_webhook' limit 1;
    select decrypted_secret into hub_origin from vault.decrypted_secrets
      where name = 'victorysync_leadgen_origin' limit 1;
    if webhook is null or webhook !~ '^https://hooks.slack.com/services/' then
      insert into public.slack_notification_log(lead_table, lead_id, status, error_message)
      values(tg_table_name, row_data->>'id', 'skipped', 'Slack webhook is missing or invalid in Vault');
      return new;
    end if;
    if tg_table_name = 'companies' then
      lead_name := coalesce(nullif(row_data->>'contact_name', ''), 'N/A');
      company_name := coalesce(nullif(row_data->>'name', ''), 'N/A');
      lead_path := '/companies/';
    else
      lead_name := coalesce(nullif(btrim(concat_ws(' ', row_data->>'first_name', row_data->>'last_name')), ''), 'N/A');
      company_name := coalesce(nullif(row_data->>'company', ''), 'N/A');
      lead_path := '/leadgen/leads/';
    end if;
    lead_email := coalesce(nullif(row_data->>'email', ''), 'N/A');
    lead_phone := coalesce(nullif(row_data->>'phone', ''), 'N/A');
    lead_source := coalesce(nullif(row_data->>'source', ''), tg_table_name);
    meeting_time := nullif(row_data->>'meeting_at', '')::timestamptz;
    ny_time := case when meeting_time is null then 'N/A' else
      to_char(meeting_time at time zone 'America/New_York', 'Dy Mon FMDD, FMHH12:MI AM') || ' ET' end;
    cairo_time := case when meeting_time is null then 'N/A' else
      to_char(meeting_time at time zone 'Africa/Cairo', 'FMHH12:MI AM') || ' Cairo' end;
    select coalesce(nullif(t.name, ''), u.email, 'N/A') into actor_name
      from auth.users u left join public.team_members t on t.auth_user_id = u.id::text
      where u.id = nullif(row_data->>'meeting_booked_by', '')::uuid limit 1;
    payload := jsonb_build_object('text', 'Meeting Booked: ' || lead_name || ' at ' || ny_time || ' (' || cairo_time || ')',
      'blocks', jsonb_build_array(
        jsonb_build_object('type','header','text',jsonb_build_object('type','plain_text','text','Meeting Booked')),
        jsonb_build_object('type','section','fields',jsonb_build_array(
          jsonb_build_object('type','mrkdwn','text','*Lead:* ' || lead_name),
          jsonb_build_object('type','mrkdwn','text','*Company:* ' || company_name),
          jsonb_build_object('type','mrkdwn','text','*Email:* ' || lead_email),
          jsonb_build_object('type','mrkdwn','text','*Phone:* ' || lead_phone),
          jsonb_build_object('type','mrkdwn','text','*Meeting:* ' || ny_time || ' (' || cairo_time || ')'),
          jsonb_build_object('type','mrkdwn','text','*Booked by:* ' || coalesce(actor_name,'N/A')),
          jsonb_build_object('type','mrkdwn','text','*Source:* ' || lead_source))),
        jsonb_build_object('type','section','text',jsonb_build_object('type','mrkdwn','text',
          case when hub_origin ~ '^https://[^/]+$' then
            '<' || hub_origin || lead_path || (row_data->>'id') || '|Open in Lead Gen Hub>'
          else 'Lead Gen Hub link: N/A' end))));
    select net.http_post(url := webhook, body := payload,
      headers := '{"Content-Type":"application/json"}'::jsonb) into request_number;
    insert into public.slack_notification_log(lead_table, lead_id, request_id, status)
      values(tg_table_name, row_data->>'id', request_number, 'queued');
  exception when others then
    begin
      insert into public.slack_notification_log(lead_table, lead_id, status, error_message)
        values(tg_table_name, row_data->>'id', 'failed', left(sqlerrm, 1000));
    exception when others then null;
    end;
  end;
  return new;
end;
$$;
drop trigger if exists notify_slack_meeting_booked on public.companies;
create trigger notify_slack_meeting_booked after insert or update on public.companies
for each row execute function public.notify_slack_meeting_booked();

notify pgrst, 'reload schema';
commit;
