begin;

create or replace function public.portal_page_edit_allowed(p_account uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_access_account(p_account)
    and public.portal_page_allowed('pages')
    and (
      public.is_agency_admin()
      or (public.auth_role() = 'agency_staff' and exists (
        select 1 from public.sub_account_assignments a
        where a.sub_account_id = p_account and a.user_id = auth.uid()
          and a.role_in_account in ('account_manager','marketing')
      ))
      or (public.auth_role() = 'client_owner'
        and public.client_feature_enabled('client_page_editing'))
    );
$$;
revoke all on function public.portal_page_edit_allowed(uuid) from public, anon;
grant execute on function public.portal_page_edit_allowed(uuid) to authenticated;

create or replace function public.portal_save_page(p_account uuid,p_page uuid,p_title text,
  p_slug text,p_sections jsonb,p_theme jsonb,p_seo_description text,p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.marketing_landing_pages%rowtype;
begin
  if not public.portal_page_edit_allowed(p_account) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if length(p_title) not between 1 and 180 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(p_slug)>100 or jsonb_typeof(p_sections)<>'array'
    or jsonb_array_length(p_sections)>40 or jsonb_typeof(p_theme)<>'object'
    or p_status not in ('draft','published') then
    raise exception 'Invalid page' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_sections) as section(value)
    where section.value->>'type'='form' and nullif(section.value->>'formId','') is not null
      and not exists(select 1 from public.forms f
        where f.id::text=section.value->>'formId' and f.client_account_id=p_account)) then
    raise exception 'Form does not belong to this account' using errcode='22023';
  end if;
  if p_page is null then
    insert into public.marketing_landing_pages(client_account_id,organization_id,title,slug,
      sections,theme,seo_description,status)
    select p_account,a.organization_id,p_title,p_slug,p_sections,p_theme,
      left(coalesce(p_seo_description,''),320),p_status from public.sub_accounts a where a.id=p_account
    returning * into saved;
  else
    update public.marketing_landing_pages set title=p_title,slug=p_slug,sections=p_sections,
      theme=p_theme,seo_description=left(coalesce(p_seo_description,''),320),
      status=p_status,updated_at=now()
    where id=p_page and client_account_id=p_account returning * into saved;
  end if;
  if saved.id is null then raise exception 'Page not found' using errcode='02000'; end if;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,
    event_type,action,target)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    p_account::text,'page','saved',saved.id::text);
  return to_jsonb(saved);
end $$;
revoke all on function public.portal_save_page(uuid,uuid,text,text,jsonb,jsonb,text,text) from public, anon;
grant execute on function public.portal_save_page(uuid,uuid,text,text,jsonb,jsonb,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
