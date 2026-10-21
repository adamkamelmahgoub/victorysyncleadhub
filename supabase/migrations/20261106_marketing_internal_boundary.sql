begin;

-- Existing legacy admin policies are permissive. These restrictive policies
-- keep all form data inside Victory Sync's internal organization.
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='forms' and policyname='marketing_forms_internal_boundary') then
    create policy marketing_forms_internal_boundary on public.forms as restrictive for all to public
      using(organization_id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid and public.social_org_access(organization_id))
      with check(organization_id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid and public.social_org_access(organization_id));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='form_submissions' and policyname='marketing_submissions_internal_boundary') then
    create policy marketing_submissions_internal_boundary on public.form_submissions as restrictive for all to public
      using(organization_id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid and public.social_org_access(organization_id))
      with check(organization_id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid and public.social_org_access(organization_id));
  end if;
end $$;

commit;
