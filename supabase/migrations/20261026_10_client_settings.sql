begin;

create or replace function public.portal_branding(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) then raise exception 'Access denied' using errcode='42501'; end if;
  select jsonb_build_object('name',name,'logoUrl',logo_url,'brand',brand) into result
  from public.sub_accounts where id=p_account;
  return result;
end $$;
revoke all on function public.portal_branding(uuid) from public, anon;
grant execute on function public.portal_branding(uuid) to authenticated;

create or replace function public.portal_client_settings(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('settings')
    or public.auth_role() not in ('agency_admin','agency_staff','client_owner') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select jsonb_build_object('name',name,'phone',phone,'website',website,
    'notifications',coalesce(settings->'notifications','{"email":true,"text":false}'::jsonb),
    'reviewDelayHours',coalesce((settings->>'review_delay_hours')::integer,2)) into result
  from public.sub_accounts where id=p_account;
  return result;
end $$;
revoke all on function public.portal_client_settings(uuid) from public, anon;
grant execute on function public.portal_client_settings(uuid) to authenticated;

create or replace function public.portal_update_client_settings(p_account uuid,p_phone text,p_website text,p_notifications jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('settings')
    or public.auth_role() not in ('agency_admin','client_owner')
    or length(p_phone)>30 or length(p_website)>500
    or jsonb_typeof(p_notifications)<>'object'
    or exists(select 1 from jsonb_object_keys(p_notifications) as k(key)
      where k.key not in ('email','text','phone'))
    or (p_notifications ? 'email' and jsonb_typeof(p_notifications->'email')<>'boolean')
    or (p_notifications ? 'text' and jsonb_typeof(p_notifications->'text')<>'boolean')
    or (p_notifications ? 'phone' and (p_notifications->>'phone')<>''
      and (p_notifications->>'phone') !~ '^\+1[0-9]{10}$') then
    raise exception 'Invalid settings' using errcode='22023';
  end if;
  update public.sub_accounts set phone=nullif(p_phone,''),website=nullif(p_website,''),
    settings=jsonb_set(coalesce(settings,'{}'::jsonb),'{notifications}',p_notifications,true),updated_at=now()
  where id=p_account;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,
    event_type,action,target,metadata)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    p_account::text,'settings','client_settings_updated',p_account::text,
    jsonb_build_object('phone',p_phone,'website',p_website,'notifications',p_notifications));
end $$;
revoke all on function public.portal_update_client_settings(uuid,text,text,jsonb) from public, anon;
grant execute on function public.portal_update_client_settings(uuid,text,text,jsonb) to authenticated;

create or replace function public.portal_set_review_delay(p_account uuid,p_hours integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_agency_admin() or not public.can_access_account(p_account)
    or p_hours<0 or p_hours>168 then raise exception 'Access denied' using errcode='42501'; end if;
  update public.sub_accounts set settings=jsonb_set(coalesce(settings,'{}'::jsonb),
    '{review_delay_hours}',to_jsonb(p_hours),true),updated_at=now() where id=p_account;
end $$;
revoke all on function public.portal_set_review_delay(uuid,integer) from public, anon;
grant execute on function public.portal_set_review_delay(uuid,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
