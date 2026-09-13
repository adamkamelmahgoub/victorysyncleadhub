begin;
create table if not exists public.outreach_workflow_runs(
 id uuid primary key default gen_random_uuid(),workflow_id uuid not null references public.automation_workflows(id) on delete cascade,
 lead_id text not null,event_key text not null,status text not null default 'queued' check(status in ('queued','running','waiting','completed','failed','stopped')),
 current_step integer not null default 0,next_step_at timestamptz not null default now(),context jsonb not null default '{}',
 lease uuid,lease_until timestamptz,last_error text,created_at timestamptz not null default now(),completed_at timestamptz,
 unique(workflow_id,event_key)
);
create index if not exists outreach_workflow_due on public.outreach_workflow_runs(next_step_at,created_at) where status in ('queued','waiting');
create table if not exists public.outreach_workflow_logs(
 id bigint generated always as identity primary key,run_id uuid not null references public.outreach_workflow_runs(id) on delete cascade,
 step_number integer,node_type text not null,status text not null,details jsonb not null default '{}',created_at timestamptz not null default now(),
 unique(run_id,step_number)
);
alter table public.outreach_workflow_runs enable row level security;
alter table public.outreach_workflow_logs enable row level security;
revoke all on public.outreach_workflow_runs,public.outreach_workflow_logs from public,anon,authenticated;
grant all on public.outreach_workflow_runs,public.outreach_workflow_logs to service_role;

create or replace function public.outreach_workflow_start(p_trigger text,p_lead text,p_event text,p_payload jsonb default '{}') returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare workflow record;added integer:=0;matches boolean;
begin
 if not exists(select 1 from public.leads where id::text=p_lead) then return 0;end if;
 for workflow in select * from public.automation_workflows where is_active and trigger_type=p_trigger loop
  matches:=true;
  if p_trigger='tag_added' and coalesce(workflow.trigger_config->>'tag','')<>'' then matches:=p_payload->>'tag'=workflow.trigger_config->>'tag';end if;
  if p_trigger='disposition_changed' and coalesce(workflow.trigger_config->>'disposition','')<>'' then matches:=p_payload->>'disposition'=workflow.trigger_config->>'disposition';end if;
  if p_trigger='status_changed' and coalesce(workflow.trigger_config->>'status','')<>'' then matches:=p_payload->>'status'=workflow.trigger_config->>'status';end if;
  if p_trigger='opportunity_stage_changed' and coalesce(workflow.trigger_config->>'stageId','')<>'' then matches:=p_payload->>'stageId'=workflow.trigger_config->>'stageId';end if;
  if matches then
   insert into public.outreach_workflow_runs(workflow_id,lead_id,event_key,context) values(workflow.id,p_lead,p_event,p_payload) on conflict do nothing;
   if found then added:=added+1;update public.automation_workflows set enrolled_count=enrolled_count+1 where id=workflow.id;end if;
  end if;
 end loop;
 return added;
end $$;

create or replace function public.outreach_workflow_lead_trigger() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare old_tag text;new_tag text;event text:=gen_random_uuid()::text;
begin
 if tg_op='INSERT' then perform public.outreach_workflow_start('contact_created',new.id::text,event,to_jsonb(new));return new;end if;
 if new.tags is distinct from old.tags then
  foreach new_tag in array coalesce(new.tags,array[]::text[]) loop
   if not new_tag=any(coalesce(old.tags,array[]::text[])) then perform public.outreach_workflow_start('tag_added',new.id::text,event||':tag:'||new_tag,jsonb_build_object('tag',new_tag));end if;
  end loop;
 end if;
 if new.status is distinct from old.status then perform public.outreach_workflow_start('status_changed',new.id::text,event||':status',jsonb_build_object('status',new.status,'previous',old.status));end if;
 if new.pipeline_stage_id is distinct from old.pipeline_stage_id then perform public.outreach_workflow_start('opportunity_stage_changed',new.id::text,event||':stage',jsonb_build_object('stageId',new.pipeline_stage_id,'previous',old.pipeline_stage_id));end if;
 if new.disposition is distinct from old.disposition then perform public.outreach_workflow_start('disposition_changed',new.id::text,event||':disposition',jsonb_build_object('disposition',new.disposition,'previous',old.disposition));end if;
 return new;
end $$;
drop trigger if exists outreach_native_workflow_lead on public.leads;
create trigger outreach_native_workflow_lead after insert or update on public.leads for each row execute function public.outreach_workflow_lead_trigger();

create or replace function public.outreach_workflow_activity_trigger() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.reason='call_logged' then perform public.outreach_workflow_start('call_logged',new.lead_id,new.id::text,new.details);end if;
 return new;
end $$;
drop trigger if exists outreach_native_workflow_activity on public.outreach_audit;
create trigger outreach_native_workflow_activity after insert on public.outreach_audit for each row execute function public.outreach_workflow_activity_trigger();

create or replace function public.outreach_workflow_reply_trigger() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare lead record;
begin
 if new.is_auto_reply then return new;end if;
 for lead in select id from public.leads where normalized_email=new.from_email loop
  perform public.outreach_workflow_start('email_replied',lead.id::text,new.id::text,jsonb_build_object('fromEmail',new.from_email,'subject',new.subject));
 end loop;
 return new;
end $$;
drop trigger if exists outreach_native_workflow_reply on public.outreach_inbound_messages;
create trigger outreach_native_workflow_reply after insert on public.outreach_inbound_messages for each row execute function public.outreach_workflow_reply_trigger();

create or replace function public.outreach_workflow_admin(p_action text,p_data jsonb default '{}',p_actor text default 'operator') returns jsonb language plpgsql as $$
declare run public.outreach_workflow_runs;workflow public.automation_workflows;lead public.leads;node jsonb;result jsonb;seconds integer;sequence_id text;
begin
 perform pg_advisory_xact_lock(8675310);
 if p_action='status' then
  return jsonb_build_object('queued',(select count(*) from public.outreach_workflow_runs where status in ('queued','waiting')),'running',(select count(*) from public.outreach_workflow_runs where status='running'),'failed',(select count(*) from public.outreach_workflow_runs where status='failed'),'recent',coalesce((select jsonb_agg(x) from (select r.id,r.status,r.current_step,r.last_error,r.created_at,w.name workflow_name from public.outreach_workflow_runs r join public.automation_workflows w on w.id=r.workflow_id order by r.created_at desc limit 25)x),'[]'::jsonb));
 elsif p_action='manual' then
  select * into workflow from public.automation_workflows where id::text=p_data->>'workflowId';
  if not found or not workflow.is_active then raise exception 'Workflow must be active';end if;
  if not exists(select 1 from public.leads where id::text=p_data->>'leadId') then raise exception 'Contact not found';end if;
  insert into public.outreach_workflow_runs(workflow_id,lead_id,event_key,context) values(workflow.id,p_data->>'leadId',coalesce(nullif(p_data->>'eventKey',''),'manual:'||gen_random_uuid()),jsonb_build_object('manual',true)) returning to_jsonb(outreach_workflow_runs.*) into result;
  update public.automation_workflows set enrolled_count=enrolled_count+1 where id=workflow.id;return result;
 elsif p_action='claim' then
  loop
   select * into run from public.outreach_workflow_runs where status in ('queued','waiting') and next_step_at<=now() and (lease_until is null or lease_until<now()) order by next_step_at,created_at limit 1 for update skip locked;
   if not found then return null;end if;
   select * into workflow from public.automation_workflows where id=run.workflow_id;
   if not found or not workflow.is_active then update public.outreach_workflow_runs set status='stopped',completed_at=now() where id=run.id;continue;end if;
   node:=workflow.actions->run.current_step;
   if node is null then
    update public.outreach_workflow_runs set status='completed',completed_at=now(),lease=null,lease_until=null where id=run.id;
    update public.automation_workflows set completed_count=completed_count+1 where id=workflow.id;continue;
   end if;
   update public.outreach_workflow_runs set status='running',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id=run.id returning * into run;
   select to_jsonb(l) into result from public.leads l where id::text=run.lead_id;
   return jsonb_build_object('run',to_jsonb(run),'node',node,'lead',result,'workflow',jsonb_build_object('id',workflow.id,'name',workflow.name));
  end loop;
 elsif p_action='finish' then
  select * into run from public.outreach_workflow_runs where id::text=p_data->>'runId' and lease::text=p_data->>'lease' and status='running' for update;
  if not found then raise exception 'Workflow claim expired';end if;
  node:=p_data->'node';seconds:=greatest(0,least(coalesce((p_data->>'waitSeconds')::integer,0),31536000));
  insert into public.outreach_workflow_logs(run_id,step_number,node_type,status,details) values(run.id,run.current_step,node->>'type','completed',coalesce(p_data->'result','{}')) on conflict do nothing;
  update public.outreach_workflow_runs set current_step=current_step+1,status=case when seconds>0 then 'waiting' else 'queued' end,next_step_at=now()+make_interval(secs=>seconds),lease=null,lease_until=null where id=run.id returning to_jsonb(outreach_workflow_runs.*) into result;return result;
 elsif p_action='fail' then
  update public.outreach_workflow_runs set status='failed',last_error=left(coalesce(p_data->>'error','Workflow node failed'),500),lease=null,lease_until=null where id::text=p_data->>'runId' and lease::text=p_data->>'lease' returning to_jsonb(outreach_workflow_runs.*) into result;
  insert into public.outreach_audit(lead_id,actor,reason,details) select lead_id,'system','workflow_failed',jsonb_build_object('run_id',id,'error',last_error) from public.outreach_workflow_runs where id::text=p_data->>'runId';return result;
 elsif p_action='db_node' then
  select * into run from public.outreach_workflow_runs where id::text=p_data->>'runId' and lease::text=p_data->>'lease' and status='running';if not found then raise exception 'Workflow claim expired';end if;
  select * into lead from public.leads where id::text=run.lead_id for update;node:=p_data->'node';
  case node->>'type'
   when 'add_tag' then update public.leads set tags=array(select distinct x from unnest(coalesce(tags,array[]::text[])||array[node->'config'->>'tag'])x) where id=lead.id;
   when 'remove_tag' then update public.leads set tags=array_remove(tags,node->'config'->>'tag') where id=lead.id;
   when 'update_status' then update public.leads set status=node->'config'->>'status' where id=lead.id;
   when 'move_pipeline_stage' then update public.leads set pipeline_stage_id=(node->'config'->>'stageId')::uuid where id=lead.id and exists(select 1 from public.pipeline_stages where id::text=node->'config'->>'stageId');
   when 'add_note' then insert into public.activities(lead_id,type,description) values(lead.id,'note',node->'config'->>'note');
   when 'create_call_task' then insert into public.contact_tasks(lead_id,title,description,due_date,priority) values(lead.id,coalesce(nullif(node->'config'->>'title',''),'Workflow call task'),node->'config'->>'description',now()+make_interval(days=>coalesce((node->'config'->>'delayDays')::integer,0)),coalesce(nullif(node->'config'->>'priority',''),'medium'));
   when 'enroll_sequence' then sequence_id:=node->'config'->>'sequenceId';perform public.outreach_sequence_admin('enroll',jsonb_build_object('id',sequence_id,'leadIds',jsonb_build_array(lead.id::text)),p_actor,null);
   when 'stop_workflow' then update public.outreach_workflow_runs set status='stopped',completed_at=now() where id=run.id;
   else raise exception 'Unsupported database workflow node';
  end case;
  return jsonb_build_object('applied',true);
 end if;
 raise exception 'Unsupported workflow operation';
end $$;
revoke all on function public.outreach_workflow_start(text,text,text,jsonb),public.outreach_workflow_admin(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.outreach_workflow_admin(text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
