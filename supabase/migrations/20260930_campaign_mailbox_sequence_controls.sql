begin;

alter table public.email_accounts add column if not exists label text,add column if not exists warmup_daily_cap integer,add column if not exists archived_at timestamptz;
alter table public.email_accounts drop constraint if exists email_accounts_warmup_daily_cap_check;
alter table public.email_accounts add constraint email_accounts_warmup_daily_cap_check check(warmup_daily_cap is null or warmup_daily_cap between 1 and 10000);
alter table public.sequences add column if not exists label text;
alter table public.sequence_steps drop constraint if exists sequence_steps_channel_check;
alter table public.sequence_steps add constraint sequence_steps_channel_check check(channel in ('email','manual_email','call_task','linkedin_task','action_item'));

create or replace view public.outreach_mailbox_health with (security_invoker=true) as
 select m.id,m.from_name,m.from_email,m.provider,m.sending_domain_id,m.status,m.daily_cap,m.mailbox_timezone,m.warmup_started_at,m.email_engine_enabled,m.created_at,
 least(public.outreach_mailbox_cap(m.status,m.daily_cap,m.warmup_started_at,now()),coalesce(m.warmup_daily_cap,2147483647)) effective_cap,
 (select count(*)::int from public.outreach_email_jobs j where j.mailbox_id=m.id and j.dispatched_at is not null and j.mailbox_day=(now() at time zone m.mailbox_timezone)::date) sent_today,
 coalesce((select count(*) filter(where exists(select 1 from public.outreach_email_events e where e.job_id=j.id and e.type='hard_bounce'))::numeric/nullif(count(*),0) from public.outreach_email_jobs j where j.mailbox_id=m.id and j.dispatched_at>=now()-interval '168 hours'),0) bounce_rate_7d,
 coalesce((select count(*) filter(where exists(select 1 from public.outreach_email_events e where e.job_id=j.id and e.type='complaint'))::numeric/nullif(count(*),0) from public.outreach_email_jobs j where j.mailbox_id=m.id and j.dispatched_at>=now()-interval '168 hours'),0) complaint_rate_7d,
 m.label,m.warmup_daily_cap,m.archived_at
 from public.email_accounts m where m.archived_at is null;

create or replace function public.outreach_mailbox_manage(p_action text,p_id text,p_data jsonb default '{}',p_actor text default 'operator') returns jsonb language plpgsql as $$
declare m public.email_accounts;cancelled int:=0;
begin
 perform pg_advisory_xact_lock(8675309);
 if p_action='update' then
  update public.email_accounts set label=case when p_data?'label' then nullif(trim(p_data->>'label'),'') else label end,daily_cap=case when p_data?'dailyCap' then greatest(1,least((p_data->>'dailyCap')::int,10000)) else daily_cap end,warmup_daily_cap=case when p_data?'warmupDailyCap' then greatest(1,least((p_data->>'warmupDailyCap')::int,10000)) else warmup_daily_cap end where id::text=p_id and archived_at is null returning * into m;
 elsif p_action='delete' then
  update public.email_accounts set archived_at=now(),email_engine_enabled=false,status='paused' where id::text=p_id and archived_at is null returning * into m;
  update public.outreach_email_jobs set state='cancelled',failure_reason='mailbox_deleted' where mailbox_id=m.id and state='queued';get diagnostics cancelled=row_count;
  update public.sequence_enrollments set status='stopped',stopped_reason='mailbox_deleted',next_send_at=null where assigned_mailbox_id=m.id and status in ('active','paused');
 else raise exception 'Unsupported mailbox action';end if;
 if not found then raise exception 'Mailbox not found';end if;
 insert into public.outreach_audit(actor,reason,details) values(p_actor,'mailbox_'||p_action,jsonb_build_object('mailbox_id',m.id,'label',m.label,'daily_cap',m.daily_cap,'warmup_daily_cap',m.warmup_daily_cap,'cancelled_jobs',cancelled));
 return jsonb_build_object('id',m.id,'deleted',p_action='delete','cancelledJobs',cancelled);
end $$;

do $$ declare definition text;changed text;begin
 select pg_get_functiondef('public.outreach_campaign_launch(text,text,text)'::regprocedure) into definition;
 changed:=replace(definition,'coalesce(l.city,'''')','coalesce(l.custom_fields->>''city'','''')');
 if changed<>definition then execute changed;
 elsif position('l.custom_fields ->> ''city''' in definition)=0 and position('l.custom_fields->>''city''' in definition)=0 then raise exception 'Campaign city compatibility patch could not be verified';end if;
 select pg_get_functiondef('public.outreach_email_claim_phase2()'::regprocedure) into definition;
 changed:=replace(definition,'cap:=public.outreach_mailbox_cap(m.status,m.daily_cap,m.warmup_started_at,now());','cap:=least(public.outreach_mailbox_cap(m.status,m.daily_cap,m.warmup_started_at,now()),coalesce(m.warmup_daily_cap,2147483647));');
 if changed<>definition then execute changed;end if;
 select pg_get_functiondef('public.outreach_sequence_tick()'::regprocedure) into definition;
 changed:=replace(definition,'if s.channel=''call_task'' then','if s.channel<>''email'' then');
 changed:=replace(changed,'''Sequence call'',public.outreach_sequence_template(s.body,to_jsonb(l))','initcap(replace(s.channel,''_'','' '')),public.outreach_sequence_template(s.body,to_jsonb(l))');
 if changed<>definition then execute changed;end if;
end $$;

revoke all on function public.outreach_mailbox_manage(text,text,jsonb,text) from public;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.outreach_mailbox_manage(text,text,jsonb,text) to service_role;end if;end $$;
commit;
