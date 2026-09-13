begin;
alter table public.email_accounts add column smtp_monitoring_mode text not null default 'webhook' check(smtp_monitoring_mode in ('webhook','inbox'));
create table public.outreach_delivery_reports(mailbox_id text not null,event_id text not null,matched integer not null,created_at timestamptz not null default now(),primary key(mailbox_id,event_id));
create table public.outreach_verification_config(singleton boolean primary key default true check(singleton),encrypted_credentials text not null check(encrypted_credentials like 'enc:v1:%'));

create function public.outreach_email_inbox_report(p_mailbox text,p_event text,p_report jsonb) returns jsonb language plpgsql as $$
declare recipient jsonb; job public.outreach_email_jobs; matched int:=0;
begin
 perform pg_advisory_xact_lock(8675309);
 if not exists(select 1 from public.email_accounts where id::text=p_mailbox and provider='smtp' and inbound_provider='imap') then raise exception 'SMTP receiving inbox required';end if;
 if exists(select 1 from public.outreach_delivery_reports where mailbox_id=p_mailbox and event_id=p_event) then return jsonb_build_object('duplicate',true);end if;
 for recipient in select * from jsonb_array_elements(p_report->'recipients') loop
  if recipient->>'action'<>'failed' or recipient->>'status'!~'^5\.[0-9]{1,3}\.[0-9]{1,3}$' then continue;end if;
  for job in select j.* from public.outreach_email_jobs j join public.email_accounts m on m.id=j.mailbox_id
   where j.mailbox_id::text=p_mailbox and j.dispatched_at is not null and j.to_email=lower(recipient->>'recipient')
   and exists(select 1 from jsonb_array_elements_text(p_report->'messageIds') x where x=j.provider_message_id or x=j.rfc_message_id or x='<'||j.id::text||'@'||split_part(m.from_email,'@',2)||'>') loop
   perform public.outreach_email_event('smtp','imap:'||p_mailbox||':'||p_event||':'||job.id::text,job.id,null,'hard_bounce');matched:=matched+1;
  end loop;
 end loop;
 insert into public.outreach_delivery_reports values(p_mailbox,p_event,matched,now());
 insert into public.outreach_audit(actor,reason,details) values('system','delivery_report_processed',jsonb_build_object('mailbox_id',p_mailbox,'event_id',p_event,'matched',matched));
 return jsonb_build_object('matched',matched);
end $$;

create function public.outreach_email_smtp_admin(p_action text,p_data jsonb default '{}',p_actor text default 'operator') returns jsonb language plpgsql as $$
declare mailbox public.email_accounts; result jsonb;
begin
 perform pg_advisory_xact_lock(8675309);
 perform set_config('outreach.email_actor',p_actor,true);
 if p_action='status' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'smtp_host',smtp_host,'smtp_port',smtp_port,'smtp_user',smtp_user,'monitoring_mode',smtp_monitoring_mode,'inbox_provider',inbound_provider,'inbox_checked_at',inbox_checked_at)) from public.email_accounts),'[]'::jsonb);
 end if;
 if p_action='verification_status' then return jsonb_build_object('configured',exists(select 1 from public.outreach_verification_config));end if;
 if p_action='verification_secret' then return (select to_jsonb(encrypted_credentials) from public.outreach_verification_config);end if;
 if p_action='verification_key' then
  insert into public.outreach_verification_config values(true,p_data->>'credentials') on conflict(singleton) do update set encrypted_credentials=excluded.encrypted_credentials;
  insert into public.outreach_audit(actor,reason,details) values(p_actor,'verification_provider_configured','{}');return jsonb_build_object('configured',true);
 end if;
 select * into mailbox from public.email_accounts where id::text=p_data->>'id' for update;
 if not found or mailbox.provider<>'smtp' then raise exception 'SMTP mailbox not found';end if;
 if p_action='inbox_claim' then
  if mailbox.inbound_provider='disabled' or (mailbox.inbox_locked_at is not null and mailbox.inbox_locked_at>now()-interval '2 minutes') then return null;end if;
  update public.email_accounts set inbox_poll_token=gen_random_uuid(),inbox_locked_at=now() where id=mailbox.id returning to_jsonb(email_accounts.*) into result;return result;
 elsif p_action='release' then
  update public.outreach_email_jobs set state='queued',not_before=now()+interval '1 minute',claim_token=null where id::text=p_data->>'job' and mailbox_id=mailbox.id and claim_token::text=p_data->>'claim' and state='dispatching';
  insert into public.outreach_audit(actor,reason,details) values('system','smtp_dispatch_held_inbox_unavailable',jsonb_build_object('job_id',p_data->>'job'));
 elsif p_action='monitor' then
  if mailbox.inbound_provider<>'imap' or mailbox.inbox_checked_at is null or mailbox.inbox_checked_at<now()-interval '10 minutes' then raise exception 'Check the receiving inbox before enabling bounce monitoring';end if;
  update public.email_accounts set smtp_monitoring_mode='inbox' where id=mailbox.id;
  insert into public.outreach_audit(actor,reason,details) values(p_actor,'smtp_inbox_monitoring_enabled',jsonb_build_object('mailbox_id',mailbox.id,'complaints','unavailable'));
 elsif p_action='connection' then
  if coalesce(p_data->>'host','')!~'^[a-zA-Z0-9.-]+$' or (p_data->>'port')::int not in (465,587) or coalesce(p_data->>'user','')='' or coalesce(p_data->>'credentials','') not like 'enc:v1:%' then raise exception 'Valid encrypted SMTP connection required';end if;
  update public.email_accounts set smtp_host=p_data->>'host',smtp_port=(p_data->>'port')::int,smtp_user=p_data->>'user',smtp_password=p_data->>'credentials',email_engine_enabled=false where id=mailbox.id;
  insert into public.outreach_audit(actor,reason,details) values(p_actor,'smtp_connection_updated',jsonb_build_object('mailbox_id',mailbox.id));
 else raise exception 'Unsupported SMTP operation';end if;
 return jsonb_build_object('id',mailbox.id,'saved',true);
end $$;

alter function public.outreach_email_dispatch_check(uuid,uuid) rename to outreach_email_dispatch_check_phase3;
create function public.outreach_email_dispatch_check(p_job uuid,p_claim uuid) returns boolean language sql stable as $$
 select public.outreach_email_dispatch_check_phase3(p_job,p_claim) and not exists(
  select 1 from public.outreach_email_jobs j join public.email_accounts m on m.id=j.mailbox_id join public.leads l on l.id=j.lead_id
  where j.id=p_job and m.smtp_monitoring_mode='inbox' and (m.inbound_provider<>'imap' or m.inbox_checked_at is null or m.inbox_checked_at<now()-interval '10 minutes'
   or exists(select 1 from public.outreach_inbound_messages i where not i.is_auto_reply and i.from_domain=split_part(l.normalized_email,'@',2))))
$$;
alter function public.outreach_email_claim() rename to outreach_email_claim_phase3;
create function public.outreach_email_claim() returns jsonb language plpgsql as $$
declare held record;
begin
 perform pg_advisory_xact_lock(8675309);
 for held in update public.outreach_email_jobs j set not_before=now()+interval '1 minute' from public.email_accounts m
 where j.mailbox_id=m.id and j.state='queued' and j.not_before<=now() and m.smtp_monitoring_mode='inbox' and (m.inbound_provider<>'imap' or m.inbox_checked_at is null or m.inbox_checked_at<now()-interval '10 minutes') returning j.id,j.lead_id loop
  insert into public.outreach_audit(lead_id,actor,reason,details) values(held.lead_id::text,'system','smtp_queue_held_inbox_unavailable',jsonb_build_object('job_id',held.id));
 end loop;
 return public.outreach_email_claim_phase3();
end $$;

alter table public.outreach_delivery_reports enable row level security;
revoke all on public.outreach_delivery_reports from public;
alter table public.outreach_verification_config enable row level security;
revoke all on public.outreach_verification_config from public;
do $$ declare f text;r text;begin
 foreach r in array array['anon','authenticated'] loop if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on public.outreach_delivery_reports,public.outreach_verification_config from %I',r);end if;end loop;
 if exists(select 1 from pg_roles where rolname='service_role') then grant all on public.outreach_delivery_reports,public.outreach_verification_config to service_role;end if;
 foreach f in array array['outreach_email_inbox_report(text,text,jsonb)','outreach_email_smtp_admin(text,jsonb,text)','outreach_email_dispatch_check(uuid,uuid)','outreach_email_claim()'] loop
  execute 'revoke all on function public.'||f||' from public';
  foreach r in array array['anon','authenticated'] loop if exists(select 1 from pg_roles where rolname=r) then execute 'revoke all on function public.'||f||' from '||quote_ident(r);end if;end loop;
  if exists(select 1 from pg_roles where rolname='service_role') then execute 'grant execute on function public.'||f||' to service_role';end if;
 end loop;
end $$;
commit;
