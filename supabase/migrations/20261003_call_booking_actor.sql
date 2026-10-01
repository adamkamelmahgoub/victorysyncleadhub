begin;

create or replace function public.outreach_log_call(
  p_lead_id text, p_disposition public.outreach_disposition,
  p_next_action_at timestamptz, p_notes text, p_request_id uuid,
  p_actor text, p_client text default null
) returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare l public.leads; result jsonb; auto_close boolean;
begin
  perform pg_advisory_xact_lock(8675309);
  select * into l from public.leads where id::text = p_lead_id
    and (p_client is null or client_account_id::text = p_client) for update;
  if not found then raise exception 'Lead not found' using errcode = 'P0002'; end if;
  select details->'result' into result from public.outreach_audit
    where lead_id = p_lead_id and reason = 'call_logged'
      and details->>'request_id' = p_request_id::text;
  if result is not null then return result; end if;
  if p_request_id is null or p_disposition is null or nullif(trim(p_actor), '') is null then
    raise exception 'Disposition, actor and request ID are required' using errcode = '23514';
  end if;
  if not exists(select 1 from public.outreach_eligible_leads where id = l.id) then
    raise exception 'Lead is suppressed' using errcode = '23514';
  end if;
  if p_disposition not in ('wrong_number','not_interested','dnc')
     and (p_next_action_at is null or p_next_action_at <= now()) then
    raise exception 'A future next action is required' using errcode = '23514';
  end if;
  auto_close := l.attempt_count + 1 >= 6
    and coalesce(l.first_attempt_at, now()) <= now() - interval '240 hours'
    and p_disposition in ('no_answer','voicemail','gatekeeper');
  perform set_config('outreach.logging_call', 'yes', true);
  perform set_config('outreach.booking_actor', p_actor, true);
  update public.leads set attempt_count = attempt_count + 1,
    first_attempt_at = coalesce(first_attempt_at, now()),
    disposition = case when auto_close then 'not_interested'::public.outreach_disposition else p_disposition end,
    next_action_at = case when auto_close or p_disposition in ('wrong_number','not_interested','dnc')
      then null else p_next_action_at end,
    revisit_at = case when auto_close then now() + interval '2160 hours' else revisit_at end,
    updated_at = now()
  where id = l.id returning to_jsonb(leads.*) into result;
  insert into public.activities(lead_id, type, description)
  values (l.id, 'call', p_disposition::text ||
    case when nullif(trim(p_notes), '') is not null then ': ' || p_notes else '' end);
  perform set_config('outreach.logging_call', '', true);
  perform set_config('outreach.booking_actor', '', true);
  insert into public.outreach_audit(lead_id, actor, reason, details)
  values (p_lead_id, p_actor, 'call_logged',
    jsonb_build_object('request_id', p_request_id, 'result', result));
  if auto_close then
    insert into public.outreach_audit(lead_id, actor, reason, details)
    values (p_lead_id, 'system', 'attempt_policy_exhausted',
      jsonb_build_object('attempt_count', l.attempt_count + 1, 'revisit_at', result->'revisit_at'));
  end if;
  return result;
end;
$$;

commit;
