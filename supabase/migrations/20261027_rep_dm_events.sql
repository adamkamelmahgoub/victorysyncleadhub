begin;

create or replace function public.social_message_fact() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_thread public.conversations%rowtype;v_account public.connected_accounts%rowtype;
  v_task public.dm_tasks%rowtype;v_event text;v_first boolean;v_entity_type text;v_entity_id uuid;
  v_campaign_id uuid;v_step_id uuid;v_template_id uuid;
begin
  select * into v_thread from public.conversations where id=new.conversation_id;
  if v_thread.id is null then return new; end if;
  select * into v_account from public.connected_accounts where id=v_thread.connected_account_id;
  v_entity_type:=case when v_thread.lead_id is not null then 'lead' when v_thread.contact_id is not null then 'contact'
    when v_thread.company_id is not null or v_thread.legacy_company_id is not null then 'company' else null end;
  v_entity_id:=coalesce(v_thread.lead_id,v_thread.contact_id,v_thread.company_id,v_thread.legacy_company_id);
  if new.direction='inbound' then
    v_event:='reply_received';
    if v_thread.lead_id is not null then
      update public.leads set first_reply_at=coalesce(first_reply_at,new.created_at) where id=v_thread.lead_id;
    end if;
    if v_entity_type is not null then
      update public.dm_enrollments set state='replied',stopped_at=coalesce(stopped_at,new.created_at),stop_reason='inbound_reply'
        where organization_id=new.organization_id and entity_type=v_entity_type and entity_id=v_entity_id
          and state in ('queued','step_due','sent');
      update public.dm_tasks t set status='expired',skip_reason='lead_replied'
        from public.dm_enrollments e where t.enrollment_id=e.id and e.organization_id=new.organization_id
          and e.entity_type=v_entity_type and e.entity_id=v_entity_id and t.status='due';
    end if;
  else
    select not exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
      where m.id<>new.id and m.direction='outbound' and c.organization_id=new.organization_id
        and ((v_thread.lead_id is not null and c.lead_id=v_thread.lead_id)
          or (v_thread.lead_id is null and c.id=v_thread.id))) into v_first;
    v_event:=case when new.sent_via='api' then 'crm_reply_sent'
      when new.sent_via='echo' and exists(select 1 from public.messages m where m.conversation_id=new.conversation_id
        and m.direction='inbound' and m.created_at<=new.created_at) then 'device_reply_sent'
      when v_first then 'first_dm_sent' else 'followup_sent' end;
    if v_thread.lead_id is not null then
      update public.leads set first_touch_at=coalesce(first_touch_at,new.created_at),last_touch_at=new.created_at
        where id=v_thread.lead_id;
    end if;
    if new.sent_via='echo' and v_entity_type is not null then
      select t.* into v_task from public.dm_tasks t join public.dm_enrollments e on e.id=t.enrollment_id
        where t.organization_id=new.organization_id and t.connected_account_id=v_thread.connected_account_id
          and t.status='due' and e.entity_type=v_entity_type and e.entity_id=v_entity_id
          and t.due_at<=new.created_at+interval '1 day' order by t.due_at,t.id limit 1 for update of t;
      if v_task.id is not null then
        update public.dm_tasks set status='sent',acted_at=new.created_at,acted_by=v_account.owner_user_id,
          message_id=new.id,completed_via='auto_detected' where id=v_task.id;
        update public.messages set task_id=v_task.id,enrollment_id=v_task.enrollment_id where id=new.id;
      end if;
    end if;
  end if;
  if coalesce(new.task_id,v_task.id) is not null then
    select e.campaign_id,t.step_id,s.template_id into v_campaign_id,v_step_id,v_template_id
      from public.dm_tasks t join public.dm_enrollments e on e.id=t.enrollment_id
      join public.dm_campaign_steps s on s.id=t.step_id where t.id=coalesce(new.task_id,v_task.id);
  elsif new.enrollment_id is not null then
    select campaign_id into v_campaign_id from public.dm_enrollments where id=new.enrollment_id;
  end if;
  insert into public.outreach_events(organization_id,occurred_at,rep_user_id,connected_account_id,platform,campaign_id,step_id,
    template_id,variant_key,lead_id,company_id,conversation_id,enrollment_id,task_id,event_type,source_key,metadata)
  values(new.organization_id,new.created_at,coalesce(v_account.owner_user_id,new.sent_by),v_thread.connected_account_id,
    v_thread.channel,v_campaign_id,v_step_id,coalesce(new.template_id,v_template_id),new.variant_key,v_thread.lead_id,v_thread.company_id,
    new.conversation_id,coalesce(new.enrollment_id,v_task.enrollment_id),coalesce(new.task_id,v_task.id),v_event,
    'message:'||new.id::text,jsonb_build_object('direction',new.direction,'sent_via',new.sent_via))
  on conflict(source_key) do nothing;
  return new;
end $$;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='social_message_fact') then
    create trigger social_message_fact after insert on public.messages for each row execute function public.social_message_fact();
  end if;
end $$;

create or replace function public.social_task_fact() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_account public.connected_accounts%rowtype;v_enrollment public.dm_enrollments%rowtype;v_event text;
begin
  if old.status=new.status or new.status not in ('sent','followed','engaged','skipped','expired','wrong_person','profile_not_found') then return new; end if;
  select * into v_account from public.connected_accounts where id=new.connected_account_id;
  select * into v_enrollment from public.dm_enrollments where id=new.enrollment_id;
  v_event:=case when new.status in ('sent','followed','engaged') then 'task_completed'
    when new.status='expired' then 'task_overdue' else 'task_skipped' end;
  insert into public.outreach_events(organization_id,occurred_at,rep_user_id,connected_account_id,platform,campaign_id,
    step_id,lead_id,enrollment_id,task_id,event_type,source_key,metadata)
  values(new.organization_id,coalesce(new.acted_at,now()),coalesce(new.acted_by,v_account.owner_user_id),new.connected_account_id,
    v_account.platform,v_enrollment.campaign_id,new.step_id,case when v_enrollment.entity_type='lead' then v_enrollment.entity_id end,
    new.enrollment_id,new.id,v_event,'task:'||new.id::text||':'||new.status,
    jsonb_build_object('status',new.status,'completed_via',new.completed_via,'skip_reason',new.skip_reason))
  on conflict(source_key) do nothing;
  return new;
end $$;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='social_task_fact') then
    create trigger social_task_fact after update of status on public.dm_tasks for each row execute function public.social_task_fact();
  end if;
end $$;

create or replace function public.social_intent_fact() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_account public.connected_accounts%rowtype;v_event text;
begin
  if old.intent is not distinct from new.intent then return new; end if;
  v_event:=case when new.intent='interested' then 'positive_reply'
    when new.intent in ('unsubscribe','not_interested') then 'negative_reply' else null end;
  if v_event is null then return new; end if;
  select * into v_account from public.connected_accounts where id=new.connected_account_id;
  insert into public.outreach_events(organization_id,occurred_at,rep_user_id,connected_account_id,platform,lead_id,company_id,
    conversation_id,event_type,source_key,metadata)
  values(new.organization_id,now(),v_account.owner_user_id,new.connected_account_id,new.channel,new.lead_id,new.company_id,
    new.id,v_event,'intent:'||new.id::text||':'||new.intent,jsonb_build_object('intent',new.intent))
  on conflict(source_key) do nothing;
  if new.intent in ('unsubscribe','not_interested') and new.lead_id is not null then
    update public.leads set dnc=true where id=new.lead_id;
  end if;
  return new;
end $$;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='social_intent_fact') then
    create trigger social_intent_fact after update of intent on public.conversations for each row execute function public.social_intent_fact();
  end if;
end $$;

commit;
