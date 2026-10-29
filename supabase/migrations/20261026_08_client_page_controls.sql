begin;

create or replace function public.portal_page_stats(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('pages') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.title),'[]'::jsonb) into result from (
    select p.id,p.title,p.slug,p.status,
      (select count(*) from public.marketing_landing_page_events e where e.page_id=p.id and e.event_type='view') visits,
      (select count(*) from public.form_submissions s where s.marketing_page_id=p.id and s.client_account_id=p_account) leads
    from public.marketing_landing_pages p where p.client_account_id=p_account
  ) x;
  return result;
end $$;
revoke all on function public.portal_page_stats(uuid) from public, anon;
grant execute on function public.portal_page_stats(uuid) to authenticated;

create or replace function public.portal_save_page(p_account uuid,p_page uuid,p_title text,
  p_slug text,p_sections jsonb,p_theme jsonb,p_seo_description text,p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.marketing_landing_pages%rowtype;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('pages')
    or public.auth_role() not in ('agency_admin','agency_staff','client_owner')
    or (public.auth_role()='client_owner' and not public.client_feature_enabled('client_page_editing')) then
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

create or replace function public.portal_set_feature(p_feature text,p_enabled boolean,p_user uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_agency_admin() or p_feature not in
    ('client_portal','client_accounts','landing_page_builder','landing_page_ai','delivery_automation','client_page_editing') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if p_user is null then
    insert into public.user_feature_access(org_id,user_id,feature_key,enabled)
    values('cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid,null,p_feature,p_enabled)
    on conflict (org_id,feature_key) where user_id is null do update
      set enabled=excluded.enabled,updated_at=now();
  else
    insert into public.user_feature_access(org_id,user_id,feature_key,enabled)
    values('cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid,p_user,p_feature,p_enabled)
    on conflict (org_id,user_id,feature_key) do update
      set enabled=excluded.enabled,updated_at=now();
  end if;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,event_type,action,target,metadata)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    'settings','feature_flag_changed',p_feature,jsonb_build_object('enabled',p_enabled,'user_id',p_user));
end $$;
revoke all on function public.portal_set_feature(text,boolean,uuid) from public, anon;
grant execute on function public.portal_set_feature(text,boolean,uuid) to authenticated;

create or replace function public.portal_features() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_agency_admin() then raise exception 'Access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.feature_key,x.user_id),'[]'::jsonb) into result
  from (select feature_key,user_id,enabled from public.user_feature_access
    where org_id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid
      and feature_key in ('client_portal','client_accounts','landing_page_builder','landing_page_ai','delivery_automation','client_page_editing')) x;
  return result;
end $$;
revoke all on function public.portal_features() from public, anon;
grant execute on function public.portal_features() to authenticated;

notify pgrst, 'reload schema';
commit;
