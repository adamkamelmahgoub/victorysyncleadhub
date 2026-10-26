create or replace function public.portal_page_allowed(p_page text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.client_feature_enabled('client_portal')
    and (p_page <> 'pages' or public.client_feature_enabled('landing_page_builder'))
    and case public.auth_role()
      when 'agency_admin' then true
      when 'agency_staff' then p_page <> 'billing'
      when 'client_owner' then true
      when 'client_staff' then p_page in ('dashboard','leads','calls')
      else false end
    and (public.is_agency_admin() or coalesce((
      select case
        when t.role in ('member','viewer','agent') then true
        when jsonb_typeof(t.page_permissions) is distinct from 'array' or not exists (
          select 1 from jsonb_array_elements_text(case when jsonb_typeof(t.page_permissions)='array'
            then t.page_permissions else '[]'::jsonb end) as x(key)
          where x.key in ('dashboard','leads','calls','pages','forms','reviews','reports','billing','settings')
        ) then true
        else t.page_permissions ? p_page end
      from public.team_members t
      where t.is_active is distinct from false
        and (t.user_id=auth.uid() or t.auth_user_id=auth.uid()::text)
      order by (t.role in ('agency_admin','owner','admin')) desc,
        (t.client_account_id is not null) desc,t.created_at desc limit 1
    ),true));
$$;
revoke all on function public.portal_page_allowed(text) from public, anon;
grant execute on function public.portal_page_allowed(text) to authenticated;
