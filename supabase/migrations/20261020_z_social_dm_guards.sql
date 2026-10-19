begin;

create or replace function public.social_entity_belongs(p_org uuid, p_type text, p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'contact' then exists(select 1 from public.crm_contacts where id=p_id and organization_id=p_org)
    when 'company' then exists(select 1 from public.crm_companies where id=p_id and organization_id=p_org)
      or (p_org='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid and exists(select 1 from public.companies where id=p_id))
    when 'lead' then exists(select 1 from public.leads where id=p_id and (organization_id=p_org or
      (organization_id is null and p_org='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid)))
    else false end;
$$;
revoke all on function public.social_entity_belongs(uuid,text,uuid) from public,anon,authenticated;

create or replace function public.social_entity_access(p_organization_id uuid, p_entity_type text, p_entity_id uuid, p_write boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_entity_type
    when 'contact' then public.social_org_access(p_organization_id) and public.wf_role()='admin' and
      public.social_entity_belongs(p_organization_id,p_entity_type,p_entity_id)
    when 'company' then public.social_org_access(p_organization_id) and public.wf_role()='admin' and
      public.social_entity_belongs(p_organization_id,p_entity_type,p_entity_id)
    when 'lead' then public.social_org_access(p_organization_id) and exists
      (select 1 from public.leads l where l.id=p_entity_id and
        public.social_entity_belongs(p_organization_id,p_entity_type,p_entity_id) and
        case when p_write then public.crm_lead_can_write(l.client_account_id,l.custom_fields)
                  else public.crm_lead_can_read(l.client_account_id,l.custom_fields) end)
    else false end;
$$;
revoke all on function public.social_entity_access(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.social_entity_access(uuid,text,uuid,boolean) to authenticated;

create or replace function public.social_profile_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.social_entity_belongs(new.organization_id,new.entity_type,new.entity_id) then
    raise exception 'Social profile entity does not belong to organization';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger social_profile_guard before insert or update on public.social_profiles
for each row execute function public.social_profile_guard();

create or replace function public.social_conversation_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.connected_account_id is not null and not exists
    (select 1 from public.connected_accounts a where a.id=new.connected_account_id and a.organization_id=new.organization_id
      and (a.platform=new.channel or new.channel='other')) then
    raise exception 'Connected account does not belong to conversation organization/channel';
  end if;
  if new.contact_id is not null and not public.social_entity_belongs(new.organization_id,'contact',new.contact_id) then
    raise exception 'Contact does not belong to conversation organization'; end if;
  if new.company_id is not null and not public.social_entity_belongs(new.organization_id,'company',new.company_id) then
    raise exception 'Company does not belong to conversation organization'; end if;
  if new.legacy_company_id is not null and (new.organization_id<>'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid or
    not exists(select 1 from public.companies where id=new.legacy_company_id)) then
    raise exception 'Legacy company does not belong to conversation organization'; end if;
  if new.lead_id is not null and not public.social_entity_belongs(new.organization_id,'lead',new.lead_id) then
    raise exception 'Lead does not belong to conversation organization'; end if;
  return new;
end $$;
alter table public.conversations add column if not exists legacy_company_id uuid references public.companies(id);
create trigger social_conversation_guard before insert or update on public.conversations
for each row execute function public.social_conversation_guard();
create unique index social_conversation_no_account_idx on public.conversations(organization_id,channel,external_thread_id)
  where connected_account_id is null and external_thread_id is not null;

create table public.social_sync_cursors (
  source text primary key check(source in ('outreach_inbound_messages','mightycall_sms_messages')),
  cursor_at timestamptz not null default '1970-01-01'::timestamptz,
  cursor_id uuid, updated_at timestamptz not null default now()
);
alter table public.social_sync_cursors enable row level security;
revoke all on public.social_sync_cursors from public,anon,authenticated;
insert into public.social_sync_cursors(source) values('outreach_inbound_messages'),('mightycall_sms_messages');

create table public.social_send_attempts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  connected_account_id uuid not null references public.connected_accounts(id),
  conversation_id uuid not null references public.conversations(id),
  sent_by uuid, status text not null default 'reserved' check(status in ('reserved','sent','failed')),
  external_message_id text, error text, created_at timestamptz not null default now(), completed_at timestamptz
);
create index social_send_attempts_cap_idx on public.social_send_attempts(connected_account_id,created_at)
  where status in ('reserved','sent');
alter table public.social_send_attempts enable row level security;
revoke all on public.social_send_attempts from public,anon,authenticated;

create or replace function public.social_message_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.conversations c where c.id=new.conversation_id and c.organization_id=new.organization_id) then
    raise exception 'Message organization mismatch'; end if;
  return new;
end $$;
create trigger social_message_guard before insert or update on public.messages
for each row execute function public.social_message_guard();

create or replace function public.social_is_suppressed_internal(p_org uuid,p_type text,p_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_email text; v_phone text; v_lead uuid; v_company uuid;
begin
  if not public.social_entity_belongs(p_org,p_type,p_id) then return true; end if;
  if p_type='lead' then
    select lower(email),normalized_phone,id into v_email,v_phone,v_lead from public.leads where id=p_id;
  elsif p_type='contact' then
    select lower(email),phone,source_lead_id,company_id into v_email,v_phone,v_lead,v_company from public.crm_contacts where id=p_id;
  else v_company:=p_id; end if;
  return exists(select 1 from public.leads where id=v_lead and (dnc or disposition::text in ('dnc','not_interested')))
    or exists(select 1 from public.outreach_suppressions where
      (identity_type='email' and identity_value=v_email) or
      (identity_type='phone' and identity_value in (public.outreach_phone(v_phone),regexp_replace(coalesce(v_phone,''),'[^0-9]','','g'))))
    or exists(select 1 from public.conversations c where c.organization_id=p_org and c.intent in ('unsubscribe','not_interested')
      and (c.lead_id=v_lead or c.contact_id=p_id and p_type='contact' or c.company_id=v_company or c.legacy_company_id=v_company))
    or exists(select 1 from public.crm_contacts c join public.leads l on l.id=c.source_lead_id
      where c.company_id=v_company and l.dnc)
    or exists(select 1 from public.crm_contacts c join public.outreach_suppressions s on
      (s.identity_type='email' and s.identity_value=lower(c.email)) or
      (s.identity_type='phone' and s.identity_value in (public.outreach_phone(c.phone),regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')))
      where c.company_id=v_company);
end $$;
revoke all on function public.social_is_suppressed_internal(uuid,text,uuid) from public,anon,authenticated;

create or replace function public.is_suppressed(p_organization_id uuid, p_entity_type text, p_entity_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when public.social_entity_access(p_organization_id,p_entity_type,p_entity_id,false)
    then public.social_is_suppressed_internal(p_organization_id,p_entity_type,p_entity_id) else true end;
$$;
revoke all on function public.is_suppressed(uuid,text,uuid) from public,anon;
grant execute on function public.is_suppressed(uuid,text,uuid) to authenticated;

create or replace function public.social_reserve_reply(p_conversation_id uuid,p_sent_by uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_thread public.conversations%rowtype; v_account public.connected_accounts%rowtype; v_count integer; v_attempt uuid;
declare v_type text; v_entity uuid;
begin
  select * into v_thread from public.conversations where id=p_conversation_id for update;
  if v_thread.id is null or v_thread.channel not in ('facebook','whatsapp') or v_thread.connected_account_id is null then
    raise exception 'API reply is unavailable for this conversation'; end if;
  if v_thread.last_inbound_at is null or v_thread.last_inbound_at <= now()-interval '24 hours' then
    raise exception 'The 24-hour reply window is closed'; end if;
  if v_thread.participant_platform_id is null then raise exception 'Recipient platform ID is missing'; end if;
  select * into v_account from public.connected_accounts where id=v_thread.connected_account_id for update;
  if v_account.id is null or v_account.organization_id<>v_thread.organization_id or v_account.status<>'active' or
    (v_account.token_expires_at is not null and v_account.token_expires_at<=now()) then
    raise exception 'Connected account is inactive or expired'; end if;
  v_type:=case when v_thread.lead_id is not null then 'lead' when v_thread.contact_id is not null then 'contact'
               when v_thread.company_id is not null or v_thread.legacy_company_id is not null then 'company' else null end;
  v_entity:=coalesce(v_thread.lead_id,v_thread.contact_id,v_thread.company_id,v_thread.legacy_company_id);
  if v_type is null or public.social_is_suppressed_internal(v_thread.organization_id,v_type,v_entity) then
    raise exception 'Recipient is unmatched or suppressed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_account.id::text,0));
  select count(*) into v_count from public.social_send_attempts where connected_account_id=v_account.id
    and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' and status in ('reserved','sent');
  if v_count>=v_account.daily_followup_cap then raise exception 'Daily account reply cap reached'; end if;
  insert into public.social_send_attempts(organization_id,connected_account_id,conversation_id,sent_by)
  values(v_thread.organization_id,v_account.id,v_thread.id,p_sent_by) returning id into v_attempt;
  return v_attempt;
end $$;
revoke all on function public.social_reserve_reply(uuid,uuid) from public,anon,authenticated;
grant execute on function public.social_reserve_reply(uuid,uuid) to service_role;

create or replace function public.social_match_manual_echo(p_account_id uuid,p_participant_id text,p_body text,p_external_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_account public.connected_accounts%rowtype; v_match record; v_count integer; v_message_id uuid; v_existing uuid; v_thread text;
declare v_type text; v_entity uuid;
begin
  select * into v_account from public.connected_accounts where id=p_account_id;
  if v_account.id is null or v_account.platform not in ('instagram','facebook') or p_external_id is null then return null; end if;
  select count(*),min(m.id::text)::uuid into v_count,v_message_id from public.messages m join public.conversations c on c.id=m.conversation_id
  where c.connected_account_id=p_account_id and c.channel=v_account.platform and m.direction='outbound'
    and m.sent_via='manual_assisted' and m.external_message_id is null and m.body=p_body
    and m.created_at>now()-interval '10 minutes';
  if v_count<>1 then return null; end if;
  select m.id message_id,c.id conversation_id,c.lead_id,c.contact_id,c.company_id,c.legacy_company_id
    into v_match from public.messages m join public.conversations c on c.id=m.conversation_id
    where m.id=v_message_id for update of m,c;
  v_thread:=p_account_id::text||':'||p_participant_id;
  select id into v_existing from public.conversations where organization_id=v_account.organization_id
    and channel=v_account.platform and connected_account_id=p_account_id and external_thread_id=v_thread;
  if v_existing is not null and v_existing<>v_match.conversation_id then
    update public.messages set conversation_id=v_existing,external_message_id=p_external_id where id=v_match.message_id;
  else
    update public.conversations set external_thread_id=v_thread,participant_platform_id=p_participant_id,
      last_outbound_at=now(),last_message_at=now() where id=v_match.conversation_id;
    v_existing:=v_match.conversation_id;
    update public.messages set external_message_id=p_external_id where id=v_match.message_id;
  end if;
  v_type:=case when v_match.lead_id is not null then 'lead' when v_match.contact_id is not null then 'contact'
               when v_match.company_id is not null or v_match.legacy_company_id is not null then 'company' else null end;
  v_entity:=coalesce(v_match.lead_id,v_match.contact_id,v_match.company_id,v_match.legacy_company_id);
  if v_type is not null then
    update public.social_profiles set platform_user_id=p_participant_id where id=(
      select id from public.social_profiles where organization_id=v_account.organization_id and entity_type=v_type
        and entity_id=v_entity and platform=v_account.platform and platform_user_id is null
      order by is_primary desc,confidence desc limit 1);
  end if;
  return v_existing;
end $$;
revoke all on function public.social_match_manual_echo(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.social_match_manual_echo(uuid,text,text,text) to service_role;

create or replace function public.dm_enrollment_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.social_entity_belongs(new.organization_id,new.entity_type,new.entity_id) then
    raise exception 'Enrollment entity does not belong to organization'; end if;
  if not exists(select 1 from public.dm_campaigns where id=new.campaign_id and organization_id=new.organization_id) then
    raise exception 'Campaign does not belong to organization'; end if;
  if new.connected_account_id is not null and not exists(select 1 from public.connected_accounts where id=new.connected_account_id and organization_id=new.organization_id) then
    raise exception 'Account does not belong to organization'; end if;
  if new.state in ('queued','step_due','sent') and public.social_is_suppressed_internal(new.organization_id,new.entity_type,new.entity_id) then
    raise exception 'Suppressed entity cannot enter active DM campaign'; end if;
  return new;
end $$;
create trigger dm_enrollment_guard before insert or update on public.dm_enrollments
for each row execute function public.dm_enrollment_guard();

create or replace function public.dm_task_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_enrollment public.dm_enrollments%rowtype;
begin
  select * into v_enrollment from public.dm_enrollments where id=new.enrollment_id;
  if v_enrollment.id is null or v_enrollment.organization_id<>new.organization_id or
    not exists(select 1 from public.dm_campaign_steps where id=new.step_id and campaign_id=v_enrollment.campaign_id and organization_id=new.organization_id) then
    raise exception 'DM task campaign/organization mismatch'; end if;
  if new.status='due' and (v_enrollment.state not in ('queued','step_due','sent') or
    public.social_is_suppressed_internal(new.organization_id,v_enrollment.entity_type,v_enrollment.entity_id)) then
    raise exception 'DM task is not eligible'; end if;
  return new;
end $$;
create trigger dm_task_guard before insert or update on public.dm_tasks
for each row execute function public.dm_task_guard();

create or replace function public.social_set_primary(p_profile_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_profile public.social_profiles%rowtype;
begin
  select * into v_profile from public.social_profiles where id=p_profile_id for update;
  if v_profile.id is null then raise exception 'Social profile not found'; end if;
  if v_profile.confidence < 70 then raise exception 'Profile needs review before it can be primary'; end if;
  update public.social_profiles set is_primary=false where organization_id=v_profile.organization_id
    and entity_type=v_profile.entity_type and entity_id=v_profile.entity_id and platform=v_profile.platform and is_primary;
  update public.social_profiles set is_primary=true where id=p_profile_id;
end $$;
revoke all on function public.social_set_primary(uuid) from public,anon,authenticated;
grant execute on function public.social_set_primary(uuid) to service_role;

create or replace function public.social_slack_notify(p_event_type text,p_conversation_id uuid,p_text text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_webhook text; v_origin text; v_request bigint; v_text text;
declare v_table text;
begin
  v_table:=case when p_event_type in ('token_expiring','account_disconnected','webhook_failure')
                then 'connected_accounts' else 'conversations' end;
  if p_event_type='token_expiring' and exists(select 1 from public.slack_notification_log
    where lead_table=v_table and lead_id=p_conversation_id::text and event_type=p_event_type
      and created_at>now()-interval '7 days') then return; end if;
  select decrypted_secret into v_webhook from vault.decrypted_secrets where name='victorysync_slack_meeting_webhook' limit 1;
  select decrypted_secret into v_origin from vault.decrypted_secrets where name='victorysync_leadgen_origin' limit 1;
  if v_webhook is null or v_webhook !~ '^https://hooks.slack.com/services/' then
    insert into public.slack_notification_log(lead_table,lead_id,event_type,status,error_message)
    values(v_table,p_conversation_id::text,p_event_type,'skipped','Slack webhook missing from Vault');
    return;
  end if;
  v_text:=left(p_text,500);
  if v_origin ~ '^https://[^/]+$' then
    v_text:=v_text||E'\n'||v_origin||case when v_table='connected_accounts' then '/settings' else '/conversations?id='||p_conversation_id::text end;
  end if;
  select net.http_post(url:=v_webhook,body:=jsonb_build_object('text',v_text),
    headers:='{"Content-Type":"application/json"}'::jsonb) into v_request;
  insert into public.slack_notification_log(lead_table,lead_id,event_type,request_id,status)
  values(v_table,p_conversation_id::text,p_event_type,v_request,'queued');
exception when others then
  insert into public.slack_notification_log(lead_table,lead_id,event_type,status,error_message)
  values(v_table,p_conversation_id::text,p_event_type,'failed',left(sqlerrm,1000));
end $$;
revoke all on function public.social_slack_notify(text,uuid,text) from public,anon,authenticated;
grant execute on function public.social_slack_notify(text,uuid,text) to service_role;

create or replace function public.social_message_inbound_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_channel text;
begin
  if new.direction='inbound' then
    select channel into v_channel from public.conversations where id=new.conversation_id;
    if v_channel in ('instagram','facebook','whatsapp') then
      perform public.social_slack_notify('new_dm_reply',new.conversation_id,'New '||v_channel||' reply in Victory Sync');
    end if;
  end if;
  return new;
end $$;
create trigger social_message_inbound_notify after insert on public.messages
for each row execute function public.social_message_inbound_notify();

create or replace function public.social_account_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status='disconnected' and new.status is distinct from old.status then
    perform public.social_slack_notify('account_disconnected',new.id,'Social account disconnected: '||new.label);
  end if;
  return new;
end $$;
create trigger social_account_changed after update of status on public.connected_accounts
for each row execute function public.social_account_changed();

create or replace function public.social_conversation_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_phone text; v_lead uuid; v_reason public.outreach_suppression_reason;
declare v_pipeline uuid; v_stage uuid;
begin
  if new.status is distinct from old.status or new.intent is distinct from old.intent then
    if new.company_id is not null then
      insert into public.crm_activities(organization_id,company_id,contact_id,type,body,occurred_at,metadata)
      values(new.organization_id,new.company_id,new.contact_id,'dm_status',
        'Conversation status: '||new.status||'; intent: '||new.intent,now(),jsonb_build_object('conversation_id',new.id));
    end if;
  end if;
  if new.intent in ('unsubscribe','not_interested') and new.intent is distinct from old.intent then
    v_reason:=case when new.intent='unsubscribe' then 'unsubscribed'::public.outreach_suppression_reason
                   else 'manual_exclude'::public.outreach_suppression_reason end;
    if new.lead_id is not null then v_lead:=new.lead_id;
    elsif new.contact_id is not null then
      select source_lead_id into v_lead from public.crm_contacts where id=new.contact_id;
    end if;
    if v_lead is not null then
      update public.leads set dnc=true,suppressed_reason=v_reason where id=v_lead;
      select public.outreach_email(email),public.outreach_phone(phone) into v_email,v_phone from public.leads where id=v_lead;
    elsif new.contact_id is not null then
      select public.outreach_email(email),public.outreach_phone(phone) into v_email,v_phone from public.crm_contacts where id=new.contact_id;
    end if;
    if v_email is not null then
      insert into public.outreach_suppressions(identity_type,identity_value,reason) values('email',v_email,v_reason)
      on conflict do nothing; end if;
    if v_phone is not null then
      insert into public.outreach_suppressions(identity_type,identity_value,reason) values('phone',v_phone,v_reason)
      on conflict do nothing; end if;
    update public.dm_enrollments set state='suppressed',stopped_at=now(),stop_reason='conversation_'||new.intent
    where organization_id=new.organization_id and state in ('queued','step_due','sent') and
      ((new.lead_id is not null and entity_type='lead' and entity_id=new.lead_id)
       or (new.contact_id is not null and entity_type='contact' and entity_id=new.contact_id)
       or (new.company_id is not null and entity_type='company' and entity_id=new.company_id)
       or (new.legacy_company_id is not null and entity_type='company' and entity_id=new.legacy_company_id));
  end if;
  if new.intent='interested' and new.intent is distinct from old.intent then
    perform public.social_slack_notify('positive_reply',new.id,'Interested reply in Victory Sync ('||new.channel||')');
    v_lead:=new.lead_id;
    if v_lead is null and new.contact_id is not null then
      select source_lead_id into v_lead from public.crm_contacts where id=new.contact_id;
    end if;
    if v_lead is not null then
      select s.pipeline_id into v_pipeline from public.leads l join public.pipeline_stages s on s.id=l.pipeline_stage_id where l.id=v_lead;
      if v_pipeline is null then select id into v_pipeline from public.pipelines where is_default order by created_at limit 1; end if;
      select id into v_stage from public.pipeline_stages where pipeline_id=v_pipeline and
        (key='qualified' or lower(name)='qualified') order by position limit 1;
      if v_stage is not null then
        update public.leads set pipeline_stage_id=v_stage,status='qualified'
        where id=v_lead and coalesce(status,'') not in ('meeting_booked','converted');
      end if;
      insert into public.contact_tasks(lead_id,title,description,due_date,priority)
      values(v_lead,'Reply to interested social prospect','Conversation '||new.id::text,now()+interval '1 day','high');
    end if;
  end if;
  return new;
end $$;
create trigger social_conversation_changed after update of status,intent on public.conversations
for each row execute function public.social_conversation_changed();

commit;
