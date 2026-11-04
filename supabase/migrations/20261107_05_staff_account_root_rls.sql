begin;

-- The root table contains MRR and Stripe customer IDs. Assigned staff use
-- portal_accounts(), which returns only account fields they may see.
drop policy if exists staff_account_root_guard on public.sub_accounts;
create policy staff_account_root_guard on public.sub_accounts as restrictive
  for select to authenticated
  using (public.auth_role() not in ('agency_staff','client_staff'));

commit;
