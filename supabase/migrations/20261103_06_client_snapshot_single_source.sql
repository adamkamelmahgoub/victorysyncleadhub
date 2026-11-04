-- Package snapshots now own onboarding tasks and workflows for newly created accounts.
begin;
create or replace function public.portal_create_client(p_company uuid,p_package text,
  p_owner_email text,p_owner_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare company public.companies%rowtype; account public.sub_accounts%rowtype;
declare template public.client_package_templates%rowtype;
declare member uuid; code text; creator uuid;
begin
  if (not public.is_agency_admin() and auth.role() <> 'service_role')
    or (auth.role() = 'service_role' and not exists(select 1 from public.user_feature_access f
      where f.org_id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid
        and f.user_id is null and f.feature_key='client_accounts' and f.enabled))
    or (auth.role() <> 'service_role' and not public.client_feature_enabled('client_accounts')) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select * into company from public.companies where id=p_company and deleted_at is null and stage='client';
  if company.id is null then raise exception 'Company must be closed as a client' using errcode='22023'; end if;
  if p_owner_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(trim(p_owner_name))<1 then
    raise exception 'Owner name and email are required' using errcode='22023';
  end if;
  select * into template from public.client_package_templates where package=p_package;
  if template.package is null then raise exception 'Invalid package' using errcode='22023'; end if;
  creator:=auth.uid();
  if creator is null then
    select coalesce(t.user_id,t.auth_user_id::uuid) into creator from public.team_members t
    where t.role in ('agency_admin','owner','admin') and t.is_active is distinct from false
      and (t.user_id is not null or t.auth_user_id is not null)
    order by t.created_at limit 1;
  end if;
  if creator is null then raise exception 'Agency task creator is missing' using errcode='22023'; end if;
  select * into account from public.sub_accounts where company_id=p_company;
  if account.id is not null then
    if account.invite_email_sent_at is not null then
      return jsonb_build_object('accountId',account.id,'existing',true);
    end if;
    select id into member from public.team_members where client_account_id=account.id
      and role='client_owner' order by created_at limit 1;
    if member is null then
      insert into public.team_members(org_id,client_account_id,role,name,email,status,is_active,page_permissions)
      values(account.organization_id,account.id,'client_owner',p_owner_name,lower(p_owner_email),'invited',true,
        '["dashboard","leads","calls","pages","forms","reviews","reports","billing","settings"]'::jsonb)
      returning id into member;
    end if;
    code := encode(extensions.gen_random_bytes(16),'hex');
    insert into public.invite_codes(code_hash,email,name,role,team_member_id,client_account_id,
      org_id,expires_at,created_by)
    values(encode(extensions.digest(code,'sha256'),'hex'),lower(p_owner_email),p_owner_name,'client_owner',
      member,account.id,account.organization_id,now()+interval '7 days','client_provisioning_retry');
    return jsonb_build_object('accountId',account.id,'inviteCode',code,'ownerEmail',lower(p_owner_email),'existing',false);
  end if;
  insert into public.sub_accounts(name,slug,owner_email,owner_name,phone,industry,website,
    status,plan,package,company_id,organization_id)
  values(company.name,lower(regexp_replace(company.name,'[^a-zA-Z0-9]+','-','g'))||'-'||substr(gen_random_uuid()::text,1,8),
    lower(p_owner_email),p_owner_name,company.phone,company.industry,company.website,
    'active',p_package,p_package,p_company,'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid)
  returning * into account;
  insert into public.team_members(org_id,client_account_id,role,name,email,status,is_active,page_permissions)
  values(account.organization_id,account.id,'client_owner',p_owner_name,lower(p_owner_email),'invited',true,
    '["dashboard","leads","calls","pages","forms","reviews","reports","billing","settings"]'::jsonb)
  returning id into member;
  code := encode(extensions.gen_random_bytes(16),'hex');
  insert into public.invite_codes(code_hash,email,name,role,team_member_id,client_account_id,
    org_id,expires_at,created_by)
  values(encode(extensions.digest(code,'sha256'),'hex'),lower(p_owner_email),p_owner_name,'client_owner',
    member,account.id,account.organization_id,now()+interval '7 days','client_provisioning');
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,
    event_type,action,target) values(auth.uid(),auth.jwt()->>'email',account.organization_id::text,
    account.id::text,'account','created',p_company::text);
  return jsonb_build_object('accountId',account.id,'inviteCode',code,'ownerEmail',lower(p_owner_email),'existing',false);
end $$;
revoke all on function public.portal_create_client(uuid,text,text,text) from public, anon;
grant execute on function public.portal_create_client(uuid,text,text,text) to authenticated;
grant execute on function public.portal_create_client(uuid,text,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
