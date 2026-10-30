begin;

create or replace function public.portal_create_client_manual(
  p_name text,p_phone text,p_website text,p_package text,
  p_owner_email text,p_owner_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare company_id uuid;
begin
  if not public.is_agency_admin() or not public.client_feature_enabled('client_accounts') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 200
    or length(trim(coalesce(p_owner_name,''))) not between 1 and 200
    or length(coalesce(p_phone,''))>40
    or length(coalesce(p_website,''))>500
    or (coalesce(p_website,'')<>'' and p_website !~* '^https://[^[:space:]]+$') then
    raise exception 'Invalid business details' using errcode='22023';
  end if;
  if exists(select 1 from public.sub_accounts a where lower(a.owner_email)=lower(p_owner_email)) then
    raise exception 'A client account already uses this owner email' using errcode='23505';
  end if;
  insert into public.companies(name,phone,website,email,contact_name,stage,source)
  values(trim(p_name),coalesce(p_phone,''),coalesce(p_website,''),lower(p_owner_email),trim(p_owner_name),
    'client','client_portal') returning id into company_id;
  return public.portal_create_client(company_id,p_package,p_owner_email,p_owner_name);
end $$;
revoke all on function public.portal_create_client_manual(text,text,text,text,text,text) from public,anon;
grant execute on function public.portal_create_client_manual(text,text,text,text,text,text) to authenticated;

insert into public.user_feature_access(org_id,user_id,feature_key,enabled)
values('cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',null,'client_accounts',true)
on conflict (org_id,feature_key) where user_id is null do update set enabled=true,updated_at=now();

notify pgrst, 'reload schema';
commit;
