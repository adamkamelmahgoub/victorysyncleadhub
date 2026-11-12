begin;

create or replace function public.portal_update_client_settings(
  p_account uuid,p_phone text,p_website text,p_notifications jsonb)
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
      and (p_notifications->>'phone') !~ '^\+1[0-9]{10}$')
    or (p_notifications->>'text')='true'
      and coalesce(p_notifications->>'phone','') !~ '^\+1[0-9]{10}$' then
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
revoke all on function public.portal_update_client_settings(uuid,text,text,jsonb) from public,anon;
grant execute on function public.portal_update_client_settings(uuid,text,text,jsonb) to authenticated;

commit;
