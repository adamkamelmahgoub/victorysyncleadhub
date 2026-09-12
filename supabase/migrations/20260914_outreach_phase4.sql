begin;
alter table public.sending_domains add column allow_primary_sending boolean not null default false,
 add column deleted_at timestamptz, add column spf_host text;
create table public.outreach_phase4_restore(name text primary key, definition text not null);
-- Keep the exact installed functions so rollback works with either supported ID schema.
do $$ declare r record; definition text; begin
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('outreach_mailbox_guard','outreach_domain_changed','outreach_choose_mailbox','outreach_email_claim_phase2','outreach_email_dispatch_check_phase2','outreach_sequence_choose_mailbox','outreach_email_admin') loop
  definition:=pg_get_functiondef(r.oid);
  insert into public.outreach_phase4_restore values(r.proname,definition);
  definition:=replace(definition,'not d.is_primary','(not d.is_primary or d.allow_primary_sending) and d.deleted_at is null');
  definition:=replace(definition,'d.is_primary or d.status=''burned''','(d.is_primary and not d.allow_primary_sending) or d.deleted_at is not null or d.status=''burned''');
  definition:=replace(definition,'new.is_primary or new.status=''burned''','(new.is_primary and not new.allow_primary_sending) or new.deleted_at is not null or new.status=''burned''');
  definition:=replace(definition,'from public.sending_domains x),','from public.sending_domains x where deleted_at is null),');
  definition:=replace(definition,'case when new.is_primary then ''primary_domain_blocked'' else ''domain_burned'' end','case when new.deleted_at is not null then ''domain_deleted'' when new.is_primary and not new.allow_primary_sending then ''primary_domain_blocked'' else ''domain_burned'' end');
  execute definition;
 end loop;
 if (select count(*) from public.outreach_phase4_restore)<>7 then raise exception 'Apply both Phase 3 migrations before Phase 4';end if;
end $$;
create function public.outreach_email_domain_admin(p_action text,p_data jsonb,p_actor text default 'operator') returns jsonb language plpgsql as $$
declare d public.sending_domains; result jsonb;
begin
 perform pg_advisory_xact_lock(8675309);
 perform set_config('outreach.email_actor',p_actor,true);
 select * into d from public.sending_domains where id::text=p_data->>'id' for update;
 if not found then raise exception 'Domain not found';end if;
 if p_action='delete' then
  -- Archive to preserve mailbox identity, send caps, audit and unsubscribe history.
  update public.sending_domains set deleted_at=coalesce(deleted_at,now()) where id=d.id returning to_jsonb(sending_domains.*) into result;
 elsif p_action='update' then
  if d.deleted_at is not null then raise exception 'Domain is deleted';end if;
  if p_data?'dkimSelector' and (p_data->>'dkimSelector')!~'^[a-zA-Z0-9_-]+$' then raise exception 'Invalid DKIM selector';end if;
  if p_data?'spfHost' and lower(p_data->>'spfHost')<>d.domain and (lower(p_data->>'spfHost') not like '%.'||d.domain or (p_data->>'spfHost')!~'^[a-zA-Z0-9.-]+$') then raise exception 'SPF host must belong to this domain';end if;
  if (p_data?'dkimSelector' and p_data->>'dkimSelector'<>d.dkim_selector) or (p_data?'spfHost' and lower(p_data->>'spfHost')<>coalesce(d.spf_host,d.domain)) then
   perform set_config('outreach.email_actor','system',true);
   update public.email_accounts set email_engine_enabled=false,status=case when status='burned' then status else 'paused'::public.outreach_mailbox_status end where sending_domain_id=d.id;
   update public.sending_domains set spf_verified=false,dkim_verified=false,dmarc_verified=false,verified_at=null where id=d.id;
   perform set_config('outreach.email_actor',p_actor,true);
  end if;
  update public.sending_domains set allow_primary_sending=coalesce((p_data->>'allowPrimarySending')::boolean,allow_primary_sending),
   dkim_selector=coalesce(p_data->>'dkimSelector',dkim_selector),spf_host=coalesce(lower(p_data->>'spfHost'),spf_host) where id=d.id returning to_jsonb(sending_domains.*) into result;
 else raise exception 'Unsupported domain action';end if;
 insert into public.outreach_audit(actor,reason,details) values(p_actor,'domain_'||p_action,jsonb_build_object('domain_id',d.id,'allow_primary_sending',result->'allow_primary_sending'));
 return result;
end $$;

create table public.outreach_call_outcomes(
 call_id bigint primary key references public.outreach_audit(id),
 connected boolean not null, conversation boolean not null,
 meeting_held_at timestamptz, updated_at timestamptz not null default now(),
 check(not conversation or connected)
);
alter table public.outreach_inbound_messages add column positive_reply boolean;
create index outreach_calls_week on public.outreach_audit(created_at) where reason='call_logged';
create index outreach_sent_week on public.outreach_email_jobs(sent_at) where state='sent';
create function public.outreach_email_metrics(p_action text,p_data jsonb default '{}',p_actor text default 'operator',p_scope text default null) returns jsonb language plpgsql as $$
declare start_at timestamptz; end_at timestamptz; result jsonb; call_audit public.outreach_audit;
begin
 if p_action='call_outcome' then
  perform pg_advisory_xact_lock(8675309);
  select x.* into call_audit from public.outreach_audit x join public.leads l on l.id::text=x.lead_id where x.id=(p_data->>'id')::bigint and x.reason='call_logged' and (p_scope is null or l.client_account_id::text=p_scope);
  if not found then raise exception 'Call not found';end if;
  if nullif(p_data->>'meetingHeldAt','') is not null and (call_audit.details->'result'->>'disposition'<>'meeting_booked' or (p_data->>'meetingHeldAt')::timestamptz<call_audit.created_at or (p_data->>'meetingHeldAt')::timestamptz>now()) then raise exception 'Held time must follow a booked meeting and cannot be in the future';end if;
  insert into public.outreach_call_outcomes(call_id,connected,conversation,meeting_held_at) values(call_audit.id,(p_data->>'connected')::boolean,(p_data->>'conversation')::boolean,nullif(p_data->>'meetingHeldAt','')::timestamptz)
   on conflict(call_id) do update set connected=excluded.connected,conversation=excluded.conversation,meeting_held_at=excluded.meeting_held_at,updated_at=now();
  insert into public.outreach_audit(lead_id,actor,reason,details) values(call_audit.lead_id,p_actor,'call_outcome_classified',p_data);
  return '{}'::jsonb;
 elsif p_action='reply_outcome' then
  update public.outreach_inbound_messages i set positive_reply=(p_data->>'positive')::boolean where i.id::text=p_data->>'id' and not i.is_auto_reply and
   (p_scope is null or exists(select 1 from public.outreach_email_jobs j join public.leads l on l.id=j.lead_id where l.client_account_id::text=p_scope and j.mailbox_id::text=i.mailbox_id and split_part(j.to_email,'@',2)=i.from_domain));
  if not found then raise exception 'Reply not found';end if;
  insert into public.outreach_audit(actor,reason,details) values(p_actor,'reply_outcome_classified',p_data);
  return '{}'::jsonb;
 elsif p_action<>'report' then raise exception 'Unsupported metrics action';end if;
 start_at:=((p_data->>'week')::date)::timestamp at time zone 'UTC';end_at:=start_at+interval '168 hours';
 if start_at is null then raise exception 'Week start required';end if;
 with calls as (
  select a.*,o.connected,o.conversation,o.meeting_held_at from public.outreach_audit a join public.leads l on l.id::text=a.lead_id left join public.outreach_call_outcomes o on o.call_id=a.id
  where a.reason='call_logged' and (p_scope is null or l.client_account_id::text=p_scope)
 ), sent as (
  select j.*,m.from_email from public.outreach_email_jobs j join public.email_accounts m on m.id=j.mailbox_id join public.leads l on l.id=j.lead_id
  where j.state='sent' and j.sent_at>=start_at and j.sent_at<end_at and (p_scope is null or l.client_account_id::text=p_scope)
 ), email_rows as (
  select case when grouping(s.mailbox_id)=1 then 'Overall' else max(s.from_email) end mailbox, count(*) sent,
   count(*) filter(where exists(select 1 from public.outreach_email_events e where e.job_id=s.id and e.type='delivered')) delivered,
   count(*) filter(where exists(select 1 from public.outreach_email_events e where e.job_id=s.id and e.type='hard_bounce'))::numeric/nullif(count(*),0) bounce_rate,
   count(distinct s.to_email) filter(where exists(select 1 from public.outreach_inbound_messages i where not i.is_auto_reply and i.mailbox_id=s.mailbox_id::text and i.from_domain=split_part(s.to_email,'@',2) and i.received_at>=s.sent_at))::numeric/nullif(count(distinct s.to_email),0) reply_rate,
   count(distinct s.to_email) filter(where exists(select 1 from public.outreach_inbound_messages i where not i.is_auto_reply and i.positive_reply and i.mailbox_id=s.mailbox_id::text and i.from_domain=split_part(s.to_email,'@',2) and i.received_at>=s.sent_at))::numeric/nullif(count(distinct s.to_email),0) positive_reply_rate,
   null::numeric open_rate from sent s group by grouping sets((),(s.mailbox_id))
  union all
  select m.from_email,0,0,null::numeric,null::numeric,null::numeric,null::numeric from public.email_accounts m
  where p_scope is null and not exists(select 1 from sent s where s.mailbox_id=m.id)
 )
 select jsonb_build_object('week',start_at,'calls',(select jsonb_build_object(
  'dials',count(*) filter(where created_at>=start_at and created_at<end_at),
  'connects',count(*) filter(where created_at>=start_at and created_at<end_at and connected),
  'conversations',count(*) filter(where created_at>=start_at and created_at<end_at and conversation),
  'meetingsBooked',count(*) filter(where created_at>=start_at and created_at<end_at and details->'result'->>'disposition'='meeting_booked'),
  'meetingsHeld',count(*) filter(where meeting_held_at>=start_at and meeting_held_at<end_at),
  'unclassified',count(*) filter(where created_at>=start_at and created_at<end_at and connected is null)) from calls),
 'email',coalesce((select jsonb_agg(e order by mailbox) from email_rows e),'[]'::jsonb),
 'callReview',coalesce((select jsonb_agg(x order by created_at desc) from (select id,lead_id,created_at,details->'result'->>'disposition' disposition,connected,conversation,meeting_held_at from calls where created_at>=start_at and created_at<end_at order by created_at desc limit 500) x),'[]'::jsonb),
 'replyReview',coalesce((select jsonb_agg(x order by received_at desc) from (select i.id,i.from_email,i.subject,i.body,i.received_at,i.positive_reply from public.outreach_inbound_messages i where not i.is_auto_reply and i.received_at>=start_at and i.received_at<end_at and
  exists(select 1 from public.outreach_email_jobs j join public.leads l on l.id=j.lead_id where j.mailbox_id::text=i.mailbox_id and split_part(j.to_email,'@',2)=i.from_domain and j.sent_at<=i.received_at and (p_scope is null or l.client_account_id::text=p_scope)) order by i.received_at desc limit 500) x),'[]'::jsonb)) into result;
 return result;
end $$;
do $$ declare t text; f text; r text; begin
 foreach t in array array['outreach_phase4_restore','outreach_call_outcomes'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public',t);
  foreach r in array array['anon','authenticated'] loop if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on public.%I from %I',t,r);end if;end loop;
  if exists(select 1 from pg_roles where rolname='service_role') then execute format('grant all on public.%I to service_role',t);end if;
 end loop;
 foreach f in array array['outreach_email_domain_admin(text,jsonb,text)','outreach_email_metrics(text,jsonb,text,text)'] loop
  execute 'revoke all on function public.'||f||' from public';
  foreach r in array array['anon','authenticated'] loop if exists(select 1 from pg_roles where rolname=r) then execute 'revoke all on function public.'||f||' from '||quote_ident(r);end if;end loop;
  if exists(select 1 from pg_roles where rolname='service_role') then execute 'grant execute on function public.'||f||' to service_role';end if;
 end loop;
end $$;
commit;
