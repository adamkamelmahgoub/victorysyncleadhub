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
    (select 1 from public.connected_accounts a where a.id=new.connected_account_id and a.organization_id=new.organization_id and a.platform=new.channel) then
    raise exception 'Connected account does not belong to conversation organization/channel';
  end if;
  if new.contact_id is not null and not public.social_entity_belongs(new.organization_id,'contact',new.contact_id) then
    raise exception 'Contact does not belong to conversation organization'; end if;
  if new.company_id is not null and not public.social_entity_belongs(new.organization_id,'company',new.company_id) then
    raise exception 'Company does not belong to conversation organization'; end if;
  if new.lead_id is not null and not public.social_entity_belongs(new.organization_id,'lead',new.lead_id) then
    raise exception 'Lead does not belong to conversation organization'; end if;
  return new;
end $$;
create trigger social_conversation_guard before insert or update on public.conversations
for each row execute function public.social_conversation_guard();

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
      (identity_type='phone' and identity_value=regexp_replace(coalesce(v_phone,''),'[^0-9]','','g')))
    or exists(select 1 from public.conversations c where c.organization_id=p_org and c.intent in ('unsubscribe','not_interested')
      and (c.lead_id=v_lead or c.contact_id=p_id and p_type='contact' or c.company_id=v_company))
    or exists(select 1 from public.crm_contacts c join public.leads l on l.id=c.source_lead_id
      where c.company_id=v_company and l.dnc)
    or exists(select 1 from public.crm_contacts c join public.outreach_suppressions s on
      (s.identity_type='email' and s.identity_value=lower(c.email)) or
      (s.identity_type='phone' and s.identity_value=regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'))
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

commit;
