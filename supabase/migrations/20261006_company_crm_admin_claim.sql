begin;

drop policy if exists workforce_legacy_boundary on public.companies;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'companies' and policyname = 'crm_company_admin_claim') then
    create policy crm_company_admin_claim on public.companies
      for all to authenticated
      using (auth.jwt()->>'crm_role' in ('owner', 'admin'))
      with check (auth.jwt()->>'crm_role' in ('owner', 'admin'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'companies' and policyname = 'crm_company_admin_guard') then
    create policy crm_company_admin_guard on public.companies
      as restrictive for all to authenticated
      using (auth.jwt()->>'crm_role' in ('owner', 'admin') or public.wf_role() = 'admin')
      with check (auth.jwt()->>'crm_role' in ('owner', 'admin') or public.wf_role() = 'admin');
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
