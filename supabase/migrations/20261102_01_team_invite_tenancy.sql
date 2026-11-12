begin;

-- Team directory reads follow the same account boundary as client data.
-- SECURITY DEFINER auth helpers and invite RPCs continue to use their owner.
alter table public.team_members enable row level security;

drop policy if exists team_directory_tenancy on public.team_members;
create policy team_directory_tenancy on public.team_members
  as restrictive for all to authenticated
  using (
    public.is_agency_admin()
    or user_id = auth.uid()
    or auth_user_id = auth.uid()::text
    or (client_account_id is not null and public.auth_role() = 'agency_staff'
      and public.can_access_account(client_account_id))
    or (client_account_id is not null and public.auth_role() = 'client_owner'
      and public.can_access_account(client_account_id))
  )
  with check (public.is_agency_admin());

drop policy if exists team_directory_read on public.team_members;
create policy team_directory_read on public.team_members
  for select to authenticated
  using (
    public.is_agency_admin()
    or user_id = auth.uid()
    or auth_user_id = auth.uid()::text
    or (client_account_id is not null and public.auth_role() = 'agency_staff'
      and public.can_access_account(client_account_id))
    or (client_account_id is not null and public.auth_role() = 'client_owner'
      and public.can_access_account(client_account_id))
  );

drop policy if exists team_directory_admin on public.team_members;
create policy team_directory_admin on public.team_members
  for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

-- Invite hashes are only accessed by server code and SECURITY DEFINER RPCs.
alter table public.invite_codes enable row level security;
revoke all on public.invite_codes from anon, authenticated;

notify pgrst, 'reload schema';
commit;
