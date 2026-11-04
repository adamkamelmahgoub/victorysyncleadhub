begin;

-- Assigned agency staff can work an account, but billing records belong to
-- agency admins and client owners. This guard composes with tenancy policies.
drop policy if exists staff_billing_guard on public.invoices;
create policy staff_billing_guard on public.invoices as restrictive for all to authenticated
  using (public.auth_role() in ('agency_admin','client_owner'))
  with check (public.auth_role() in ('agency_admin','client_owner'));

drop policy if exists staff_billing_guard on public.invoice_items;
create policy staff_billing_guard on public.invoice_items as restrictive for all to authenticated
  using (public.auth_role() in ('agency_admin','client_owner'))
  with check (public.auth_role() in ('agency_admin','client_owner'));

commit;
