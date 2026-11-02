begin;

-- The account table is the tenancy root. Existing read policies only take
-- effect when row level security is enabled.
alter table public.sub_accounts enable row level security;

drop policy if exists sub_account_tenancy_guard on public.sub_accounts;
create policy sub_account_tenancy_guard on public.sub_accounts
  as restrictive for all to authenticated
  using (public.can_access_account(id))
  with check (public.is_agency_admin());

drop policy if exists sub_account_agency_admin_write on public.sub_accounts;
create policy sub_account_agency_admin_write on public.sub_accounts
  for all to authenticated
  using (public.is_agency_admin())
  with check (public.is_agency_admin());

notify pgrst, 'reload schema';
commit;
