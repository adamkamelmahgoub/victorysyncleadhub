begin;

create or replace function public.ensure_client_pipeline() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pipe_id uuid;
begin
  if exists(select 1 from public.pipelines where client_account_id=new.id) then return new; end if;
  insert into public.pipelines(name,description,is_default,client_account_id)
  values('Client jobs','Default client lead pipeline',true,new.id) returning id into pipe_id;
  insert into public.pipeline_stages(pipeline_id,client_account_id,name,key,color,position)
  values(pipe_id,new.id,'New','new','#3B82F6',0),
    (pipe_id,new.id,'Contacted','contacted','#06B6D4',1),
    (pipe_id,new.id,'Quoted','quoted','#F59E0B',2),
    (pipe_id,new.id,'Booked','booked','#8B5CF6',3),
    (pipe_id,new.id,'Won','won','#16A34A',4),
    (pipe_id,new.id,'Lost','lost','#64748B',5);
  return new;
end $$;
drop trigger if exists ensure_client_pipeline_trigger on public.sub_accounts;
create trigger ensure_client_pipeline_trigger after insert on public.sub_accounts
for each row execute function public.ensure_client_pipeline();
do $$ declare a record; pipe_id uuid; begin
  for a in select id from public.sub_accounts s where not exists
    (select 1 from public.pipelines p where p.client_account_id=s.id) loop
    insert into public.pipelines(name,description,is_default,client_account_id)
    values('Client jobs','Default client lead pipeline',true,a.id) returning id into pipe_id;
    insert into public.pipeline_stages(pipeline_id,client_account_id,name,key,color,position)
    values(pipe_id,a.id,'New','new','#3B82F6',0),
      (pipe_id,a.id,'Contacted','contacted','#06B6D4',1),
      (pipe_id,a.id,'Quoted','quoted','#F59E0B',2),
      (pipe_id,a.id,'Booked','booked','#8B5CF6',3),
      (pipe_id,a.id,'Won','won','#16A34A',4),
      (pipe_id,a.id,'Lost','lost','#64748B',5);
  end loop;
end $$;

create or replace function public.log_client_lead_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare stage_name text; delay_hours integer;
begin
  if new.client_account_id is null then return new; end if;
  if tg_op='INSERT' then
    insert into public.client_lead_events(client_account_id,lead_id,event_type,body)
    values(new.client_account_id,new.id,'created',coalesce(new.source,'New lead'));
    return new;
  end if;
  if new.pipeline_stage_id is distinct from old.pipeline_stage_id then
    select name into stage_name from public.pipeline_stages where id=new.pipeline_stage_id;
    insert into public.client_lead_events(client_account_id,lead_id,event_type,body,metadata,actor_id)
    values(new.client_account_id,new.id,'stage_changed',stage_name,
      jsonb_build_object('previous_stage_id',old.pipeline_stage_id,'stage_id',new.pipeline_stage_id),auth.uid());
    if lower(coalesce(stage_name,''))='won' and public.client_delivery_enabled(new.client_account_id) then
      select greatest(0,least(168,coalesce((settings->>'review_delay_hours')::integer,2))) into delay_hours
      from public.sub_accounts where id=new.client_account_id;
      insert into public.client_automation_jobs(client_account_id,lead_id,kind,source_id,run_at)
      values(new.client_account_id,new.id,'review_request','lead:'||new.id::text,now()+make_interval(hours=>delay_hours))
      on conflict(kind,source_id) do nothing;
    end if;
  end if;
  if new.notes is distinct from old.notes and new.notes is not null then
    insert into public.client_lead_events(client_account_id,lead_id,event_type,body,actor_id)
    values(new.client_account_id,new.id,'note',new.notes,auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists client_lead_change_trigger on public.leads;
create trigger client_lead_change_trigger after insert or update of pipeline_stage_id,notes on public.leads
for each row execute function public.log_client_lead_change();

create or replace function public.portal_request_review(p_account uuid,p_name text,p_phone text,p_lead uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request_id uuid; delay_hours integer; matched_lead uuid;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('reviews')
    or public.auth_role() not in ('agency_admin','agency_staff','client_owner')
    or length(trim(p_name))<1 or p_phone !~ '^\+1[0-9]{10}$'
    or not public.client_delivery_enabled(p_account) then
    raise exception 'Review request is unavailable' using errcode='42501';
  end if;
  select id into matched_lead from public.leads where client_account_id=p_account
    and (p_lead is null or id=p_lead) and coalesce(dnc,false)=false
    and right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),10)=right(p_phone,10)
    and (opt_in_source in ('form','call') or source in ('form','call','missed_call'))
    order by created_at desc limit 1;
  if matched_lead is null then raise exception 'An opted-in lead with this phone is required' using errcode='22023'; end if;
  if public.client_phone_dnc(p_account,p_phone) then raise exception 'Contact opted out' using errcode='22023'; end if;
  select greatest(0,least(168,coalesce((settings->>'review_delay_hours')::integer,2))) into delay_hours
  from public.sub_accounts where id=p_account;
  insert into public.review_requests(client_account_id,lead_id,contact_name,contact_phone,channel,platform,status)
  values(p_account,matched_lead,trim(p_name),p_phone,'sms','google','pending') returning id into request_id;
  insert into public.client_automation_jobs(client_account_id,lead_id,kind,source_id,run_at)
  values(p_account,matched_lead,'review_request','request:'||request_id::text,now()+make_interval(hours=>delay_hours));
  return request_id;
end $$;
revoke all on function public.portal_request_review(uuid,text,text,uuid) from public, anon;
grant execute on function public.portal_request_review(uuid,text,text,uuid) to authenticated;

create or replace function public.portal_update_call(p_account uuid,p_call uuid,p_outcome text,p_summary text,p_booked boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_access_account(p_account) or public.auth_role() not in ('agency_admin','agency_staff')
    or p_outcome not in ('booked','message_taken','spam','existing_customer','other')
    or length(p_summary)>5000 then raise exception 'Access denied' using errcode='42501'; end if;
  update public.client_call_details set outcome=p_outcome,summary=p_summary,booked=p_booked,updated_at=now()
  where id=p_call and client_account_id=p_account;
  if not found then raise exception 'Call unavailable' using errcode='02000'; end if;
end $$;
revoke all on function public.portal_update_call(uuid,uuid,text,text,boolean) from public, anon;
grant execute on function public.portal_update_call(uuid,uuid,text,text,boolean) to authenticated;

create or replace function public.portal_set_job_value(p_account uuid,p_lead uuid,p_value numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_access_account(p_account) or public.auth_role() not in ('agency_admin','agency_staff','client_owner')
    or p_value<0 or p_value>100000000 then raise exception 'Access denied' using errcode='42501'; end if;
  update public.leads set custom_fields=jsonb_set(coalesce(custom_fields,'{}'::jsonb),'{job_value}',to_jsonb(p_value),true)
  where id=p_lead and client_account_id=p_account;
  if not found then raise exception 'Lead unavailable' using errcode='02000'; end if;
  insert into public.client_lead_events(client_account_id,lead_id,event_type,body,actor_id)
  values(p_account,p_lead,'job_value',p_value::text,auth.uid());
end $$;
revoke all on function public.portal_set_job_value(uuid,uuid,numeric) from public, anon;
grant execute on function public.portal_set_job_value(uuid,uuid,numeric) to authenticated;

create or replace function public.enqueue_form_followup() returns trigger
language plpgsql security definer set search_path = '' as $$
declare workflow public.automation_workflows%rowtype; action jsonb; job_kind text; job_source text; delay_days integer;
begin
  if new.client_account_id is null or new.lead_id is null or not public.client_delivery_enabled(new.client_account_id)
    or not (tg_op='INSERT' or old.lead_id is distinct from new.lead_id) then return new; end if;
  for workflow in select * from public.automation_workflows where client_account_id=new.client_account_id
    and trigger_type='form_submitted' and is_active loop
    if jsonb_typeof(workflow.actions)<>'array' then continue; end if;
    for action in select value from jsonb_array_elements(workflow.actions) loop
      job_kind:=case action->>'type'
        when 'sms_followup' then 'lead_followup'
        when 'email_followup' then 'lead_email'
        when 'sms_nudge' then 'lead_nudge'
        when 'owner_alert' then 'owner_alert'
        when 'agent_call_task' then 'agent_call_task' end;
      if job_kind is null then continue; end if;
      delay_days:=case when job_kind='lead_nudge' then greatest(1,least(30,coalesce((action->>'day')::integer,1))) else 0 end;
      job_source:=case when job_kind='owner_alert' then 'form:'||new.id::text
        when job_kind='lead_nudge' then new.id::text||':day'||delay_days::text else new.id::text end;
      insert into public.client_automation_jobs(client_account_id,lead_id,workflow_id,kind,source_id,run_at)
      values(new.client_account_id,new.lead_id,workflow.id,job_kind,job_source,now()+make_interval(days=>delay_days))
      on conflict(kind,source_id) do nothing;
    end loop;
  end loop;
  return new;
end $$;

update public.client_package_templates t set workflows=(
  select jsonb_agg(case when w.value->>'trigger_type'='form_submitted' then
    jsonb_set(w.value,'{actions}',
      '[{"type":"sms_followup"},{"type":"email_followup"},{"type":"sms_nudge","day":1},{"type":"sms_nudge","day":3},{"type":"owner_alert"}]'::jsonb
      || case when t.package='domination' then '[{"type":"agent_call_task"}]'::jsonb else '[]'::jsonb end)
    else w.value end)
  from jsonb_array_elements(t.workflows) w(value)
) where t.package in ('starter','scale','domination','revive');

insert into public.automation_workflows(client_account_id,name,trigger_type,trigger_config,actions,is_active)
select a.id,w.value->>'name',w.value->>'trigger_type','{}'::jsonb,w.value->'actions',true
from public.sub_accounts a join public.client_package_templates t on t.package=coalesce(a.package,a.plan)
cross join lateral jsonb_array_elements(t.workflows) w(value)
where not exists(select 1 from public.automation_workflows e where e.client_account_id=a.id
  and e.trigger_type=w.value->>'trigger_type');

create or replace function public.enqueue_missed_call() returns trigger
language plpgsql security definer set search_path = '' as $$
declare workflow public.automation_workflows%rowtype;
begin
  if new.client_account_id is not null and new.call_status ilike 'missed'
    and lower(new.call_direction) in ('incoming','inbound') and new.external_call_id is not null
    and public.client_delivery_enabled(new.client_account_id) then
    for workflow in select * from public.automation_workflows where client_account_id=new.client_account_id
      and trigger_type='missed_call' and is_active loop
      if workflow.actions @> '[{"type":"sms_text_back"}]'::jsonb then
        insert into public.client_automation_jobs(client_account_id,workflow_id,kind,source_id,run_at)
        values(new.client_account_id,workflow.id,'missed_call_text','call:'||new.external_call_id,now())
        on conflict(kind,source_id) do nothing;
      end if;
      insert into public.client_automation_jobs(client_account_id,workflow_id,kind,source_id,run_at)
      values(new.client_account_id,workflow.id,'owner_alert','call:'||new.external_call_id,now())
      on conflict(kind,source_id) do nothing;
    end loop;
  end if;
  return new;
end $$;

create or replace function public.stop_client_texts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare caller text; message_text text;
begin
  if new.client_account_id is null or lower(new.direction) not in ('inbound','incoming','received') then return new; end if;
  message_text:=upper(trim(coalesce(new.message_text,new.body,new.message,'')));
  if message_text !~ '^(STOP|UNSUBSCRIBE|CANCEL|END|QUIT)(\s|$)' then return new; end if;
  caller:=regexp_replace(coalesce(new.from_number,new.sender,''),'[^0-9]','','g');
  if length(caller)<10 then return new; end if;
  update public.leads set dnc=true,updated_at=now() where client_account_id=new.client_account_id
    and right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),10)=right(caller,10);
  update public.client_automation_jobs set status='cancelled',last_error='Contact opted out'
  where client_account_id=new.client_account_id and status in ('pending','failed')
    and lead_id in (select id from public.leads where client_account_id=new.client_account_id and dnc=true
      and right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),10)=right(caller,10));
  update public.sequence_enrollments set status='stopped',stopped_reason='STOP'
  where client_account_id=new.client_account_id and status not in ('completed','stopped')
    and lead_id in (select id from public.leads where client_account_id=new.client_account_id and dnc=true
      and right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),10)=right(caller,10));
  if not exists(select 1 from public.client_automation_jobs j where j.client_account_id=new.client_account_id
    and j.kind='stop_confirmation' and right(regexp_replace(coalesce(j.payload->>'phone',''),'[^0-9]','','g'),10)=right(caller,10)) then
    insert into public.client_automation_jobs(client_account_id,kind,source_id,payload)
    values(new.client_account_id,'stop_confirmation','sms:'||new.id::text,jsonb_build_object('phone',caller))
    on conflict(kind,source_id) do nothing;
  end if;
  return new;
end $$;

create or replace function public.client_phone_dnc(p_account uuid,p_phone text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.leads l where l.client_account_id=p_account and l.dnc=true
    and right(regexp_replace(coalesce(l.phone,''),'[^0-9]','','g'),10)=
      right(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),10))
    or exists(select 1 from public.mightycall_sms_messages m
      where m.client_account_id=p_account and lower(m.direction) in ('inbound','incoming','received')
        and upper(trim(coalesce(m.message_text,m.body,m.message,''))) ~ '^(STOP|UNSUBSCRIBE|CANCEL|END|QUIT)(\s|$)'
        and right(regexp_replace(coalesce(m.from_number,m.sender,''),'[^0-9]','','g'),10)=
          right(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),10));
$$;
revoke all on function public.client_phone_dnc(uuid,text) from public, anon, authenticated;
grant execute on function public.client_phone_dnc(uuid,text) to service_role;

create or replace function public.client_lead_replied(p_account uuid,p_lead uuid,p_since timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.leads l where l.id=p_lead and l.client_account_id=p_account
    and l.first_reply_at>=p_since)
  or exists(select 1 from public.mightycall_sms_messages m join public.leads l on l.id=p_lead
    where m.client_account_id=p_account and l.client_account_id=p_account
      and lower(m.direction) in ('inbound','incoming','received') and m.created_at>=p_since
      and right(regexp_replace(coalesce(m.from_number,m.sender,''),'[^0-9]','','g'),10)=
        right(regexp_replace(coalesce(l.phone,''),'[^0-9]','','g'),10));
$$;
revoke all on function public.client_lead_replied(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.client_lead_replied(uuid,uuid,timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
