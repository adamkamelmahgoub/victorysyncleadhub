begin;

-- Agency accounts must reach AAL2 before any client or prospect data is visible.
-- auth_role remains available at AAL1 so the UI can show the enrollment screen.
create or replace function public.is_agency() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.auth_role() in ('agency_admin','agency_staff')
    and coalesce(auth.jwt()->>'aal' = 'aal2',false);
$$;

create or replace function public.is_agency_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.auth_role() = 'agency_admin'
    and coalesce(auth.jwt()->>'aal' = 'aal2',false);
$$;

create or replace function public.can_access_account(p_account_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_account_id is not null and (
    public.is_agency_admin()
    or (public.auth_role() = 'agency_staff' and public.is_agency() and exists (
      select 1 from public.sub_account_assignments a
      where a.sub_account_id = p_account_id and a.user_id = auth.uid()))
    or (public.auth_role() in ('client_owner','client_staff')
      and public.client_feature_enabled('client_portal') and exists (
      select 1 from public.team_members t where t.client_account_id = p_account_id
        and t.is_active is distinct from false
        and (t.user_id = auth.uid() or t.auth_user_id = auth.uid()::text)))
  );
$$;

revoke all on function public.is_agency() from public, anon;
revoke all on function public.is_agency_admin() from public, anon;
revoke all on function public.can_access_account(uuid) from public, anon;
grant execute on function public.is_agency(), public.is_agency_admin(), public.can_access_account(uuid) to authenticated;

-- The staff page policy reads this table directly. Its RLS exposes only the user's own assignments.
grant select on public.sub_account_assignments to authenticated;

-- The legacy page version policy included a direct staff assignment branch.
drop policy if exists landing_page_versions_write on public.landing_page_versions;
create policy landing_page_versions_write on public.landing_page_versions for all to authenticated
  using (exists(select 1 from public.landing_pages p where p.id=page_id and
    (public.is_agency_admin() or
      (p.client_account_id is not null and public.auth_role()='agency_staff'
        and public.can_access_account(p.client_account_id) and exists
        (select 1 from public.sub_account_assignments a where a.sub_account_id=p.client_account_id
          and a.user_id=auth.uid() and a.role_in_account in ('account_manager','marketing'))) or
      (p.client_account_id is not null and public.auth_role()='client_owner'
        and public.can_access_account(p.client_account_id) and public.client_feature_enabled('client_page_editing')))))
  with check (exists(select 1 from public.landing_pages p where p.id=page_id and
    (public.is_agency_admin() or
      (p.client_account_id is not null and public.auth_role()='agency_staff'
        and public.can_access_account(p.client_account_id) and exists
        (select 1 from public.sub_account_assignments a where a.sub_account_id=p.client_account_id
          and a.user_id=auth.uid() and a.role_in_account in ('account_manager','marketing'))) or
      (p.client_account_id is not null and public.auth_role()='client_owner'
        and public.can_access_account(p.client_account_id) and public.client_feature_enabled('client_page_editing')))));

drop policy if exists ai_requests_read on public.ai_requests;
create policy ai_requests_read on public.ai_requests for select to authenticated
  using ((user_id=auth.uid() and (public.auth_role() not in ('agency_admin','agency_staff')
    or public.is_agency())) or public.is_agency_admin());

notify pgrst, 'reload schema';
commit;
