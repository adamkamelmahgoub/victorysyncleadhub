begin;
create table public.outreach_make_config(id boolean primary key default true check(id),token_hash text check(token_hash is null or token_hash ~ '^[a-f0-9]{64}$'));
insert into public.outreach_make_config values(true,null);
create table public.outreach_make_events(id uuid primary key default gen_random_uuid(),event_type text not null,lead_id text,payload jsonb not null default '{}',created_at timestamptz not null default now(),lease uuid,lease_until timestamptz,acknowledged_at timestamptz);
create index outreach_make_pending on public.outreach_make_events(created_at) where acknowledged_at is null;
create table public.outreach_make_requests(event_key text primary key,request jsonb not null,result jsonb not null,created_at timestamptz not null default now());
alter table public.outreach_make_config enable row level security;
alter table public.outreach_make_events enable row level security;
alter table public.outreach_make_requests enable row level security;
revoke all on public.outreach_make_config,public.outreach_make_events,public.outreach_make_requests from public,anon,authenticated;
grant all on public.outreach_make_config,public.outreach_make_events,public.outreach_make_requests to service_role;

create function public.outreach_make_capture() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare n jsonb:=to_jsonb(new);o jsonb;event_type text;
begin
 if not exists(select 1 from public.outreach_make_config where token_hash is not null) then return new;end if;
 if tg_table_name='leads' then
  if tg_op='INSERT' then event_type:='contact_created';
  else o:=to_jsonb(old);
   if (n->'tags',n->'status',n->'pipeline_stage_id',n->'disposition') is not distinct from (o->'tags',o->'status',o->'pipeline_stage_id',o->'disposition') then return new;end if;
   event_type:=case when n->'pipeline_stage_id' is distinct from o->'pipeline_stage_id' then 'opportunity_stage_changed' when n->'tags' is distinct from o->'tags' then 'tags_changed' when n->'disposition' is distinct from o->'disposition' then 'disposition_changed' else 'status_changed' end;
  end if;
  insert into public.outreach_make_events(event_type,lead_id,payload) values(event_type,n->>'id',jsonb_build_object('tags',n->'tags','status',n->'status','stageId',n->'pipeline_stage_id','disposition',n->'disposition','previous',jsonb_build_object('tags',o->'tags','status',o->'status','stageId',o->'pipeline_stage_id','disposition',o->'disposition')));
 elsif tg_table_name='outreach_inbound_messages' then
  insert into public.outreach_make_events(event_type,payload) values(case when new.is_auto_reply then 'out_of_office' else 'email_replied' end,jsonb_build_object('messageId',new.id,'fromEmail',new.from_email,'mailboxId',new.mailbox_id,'subject',new.subject));
 elsif tg_table_name='outreach_audit' and new.reason in ('call_logged','email_sent','email_event_hard_bounce','email_event_complaint') then
  insert into public.outreach_make_events(event_type,lead_id,payload) values(new.reason,new.lead_id,new.details);
 end if;
 return new;
end $$;
create trigger outreach_make_lead after insert or update on public.leads for each row execute function public.outreach_make_capture();
create trigger outreach_make_reply after insert on public.outreach_inbound_messages for each row execute function public.outreach_make_capture();
create trigger outreach_make_audit after insert on public.outreach_audit for each row execute function public.outreach_make_capture();

create function public.outreach_make_admin(p_action text,p_data jsonb default '{}',p_actor text default 'operator') returns jsonb language plpgsql as $$
declare result jsonb;l jsonb;w jsonb;a jsonb;lease_id uuid;
begin
 if p_action='status' then return jsonb_build_object('configured',exists(select 1 from public.outreach_make_config where token_hash is not null));
 elsif p_action='secret' then return (select to_jsonb(token_hash) from public.outreach_make_config);
 elsif p_action in ('rotate','revoke') then
  update public.outreach_make_config set token_hash=case when p_action='rotate' then p_data->>'hash' else null end;
  insert into public.outreach_audit(actor,reason,details) values(p_actor,'make_connection_'||p_action,'{}');
  return jsonb_build_object('configured',p_action='rotate');
 elsif p_action='catalog' then
  select jsonb_build_object('mailboxes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',from_email,'enabled',email_engine_enabled,'status',status)) from public.email_accounts),'[]'::jsonb),'workflows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',is_active,'trigger',trigger_type,'actions',actions)) from public.automation_workflows),'[]'::jsonb)) into result;return result;
 elsif p_action='lead' then
  select jsonb_build_object('id',id,'firstName',first_name,'lastName',last_name,'email',email,'company',company,'fields',custom_fields,'timezone',timezone,'disposition',disposition,'verified',email_verification_status='valid') into result from public.outreach_eligible_leads where id::text=p_data->>'id';return result;
 elsif p_action='template' then
  select to_jsonb(t) into w from public.automation_workflows t where id::text=p_data->>'workflowId' and is_active;
  if w is null then raise exception 'Workflow must exist and be active';end if;
  a:=w->'actions'->(p_data->>'stepIndex')::integer;
  if a->>'type' is distinct from 'send_email' then raise exception 'Choose a send email step';end if;
  select to_jsonb(t) into l from public.outreach_eligible_leads t where id::text=p_data->>'leadId';
  if l is null then raise exception 'Eligible contact required';end if;
  return jsonb_build_object('subject',public.outreach_sequence_template(replace(a->'config'->>'subject','{{email}}',coalesce(l->>'email','')),l),'body',public.outreach_sequence_template(replace(a->'config'->>'body','{{email}}',coalesce(l->>'email','')),l),'mailboxId',coalesce(a->'config'->>'mailboxId',a->'config'->>'mailbox_id'));
 elsif p_action='claim' then
  lease_id:=gen_random_uuid();
  with picked as(select id from public.outreach_make_events where acknowledged_at is null and (lease_until is null or lease_until<now()) order by created_at,id limit 20 for update skip locked),claimed as(update public.outreach_make_events e set lease=lease_id,lease_until=now()+interval '10 minutes' from picked where e.id=picked.id returning e.*)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'type',event_type,'leadId',lead_id,'payload',payload,'createdAt',created_at,'lease',lease)), '[]'::jsonb) into result from claimed;return result;
 elsif p_action='ack' then
  update public.outreach_make_events set acknowledged_at=coalesce(acknowledged_at,now()) where id::text=p_data->>'id' and lease::text=p_data->>'lease';
  return jsonb_build_object('acknowledged',found);
 end if;
 raise exception 'Unknown Make operation';
end $$;
create function public.outreach_make_enqueue(p_event_key text,p_args jsonb) returns jsonb language plpgsql as $$
declare request_data jsonb:=p_args - array['p_token','p_hash'];previous public.outreach_make_requests;result jsonb;
begin
 if length(p_event_key) not between 1 and 200 then raise exception 'Event key required';end if;
 perform pg_advisory_xact_lock(8675309);
 select * into previous from public.outreach_make_requests where event_key=p_event_key;
 if found then
  if previous.request<>request_data then raise exception 'Event key already used for different email';end if;
  return previous.result || '{"duplicate":true}'::jsonb;
 end if;
 result:=public.outreach_email_enqueue(p_args->>'p_lead',p_args->>'p_subject',p_args->>'p_body',p_args->>'p_mailbox',p_args->>'p_enrollment',p_args->>'p_token',p_args->>'p_hash','make',null);
 insert into public.outreach_make_requests(event_key,request,result) values(p_event_key,request_data,result);
 return result;
end $$;
revoke all on function public.outreach_make_capture(),public.outreach_make_admin(text,jsonb,text),public.outreach_make_enqueue(text,jsonb) from public,anon,authenticated;
grant execute on function public.outreach_make_admin(text,jsonb,text),public.outreach_make_enqueue(text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
