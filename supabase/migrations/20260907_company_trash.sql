-- Apply after the company trials and workspace migrations. No records are deleted.
begin;
alter table public.companies add column if not exists deleted_at timestamptz;
create index if not exists companies_deleted_at_idx on public.companies(deleted_at) where deleted_at is not null;

-- Trashed trials release capacity. Restoring a trial must pass the same overlap check.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.companies'::regclass
    and conname='no_overlapping_inbound_trials' and pg_get_constraintdef(oid) like '%deleted_at%') then
    alter table public.companies drop constraint if exists no_overlapping_inbound_trials;
    alter table public.companies add constraint no_overlapping_inbound_trials exclude using gist
      (daterange(trial_start_date,trial_end_date,'[]') with &&)
      where (deleted_at is null and trial_type='inbound' and stage in ('trial_booked','trial_active'));
  end if;
end $$;

-- Restrictive policies also protect direct Supabase requests and existing KPI functions.
do $$ declare t text; begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='companies' and policyname='crm_company_active') then
    create policy crm_company_active on public.companies as restrictive for all to authenticated
      using (deleted_at is null) with check (deleted_at is null);
  end if;
  foreach t in array array['company_activities','company_tasks','company_files'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='crm_parent_active') then
      execute format('create policy crm_parent_active on public.%I as restrictive for all to authenticated
        using (exists(select 1 from public.companies c where c.id=company_id))
        with check (exists(select 1 from public.companies c where c.id=company_id))',t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='crm_storage_parent_active') then
    create policy crm_storage_parent_active on storage.objects as restrictive for all to authenticated
      using (bucket_id <> 'company-files' or exists(select 1 from public.companies c where c.id::text=split_part(storage.objects.name,'/',1)))
      with check (bucket_id <> 'company-files' or exists(select 1 from public.companies c where c.id::text=split_part(storage.objects.name,'/',1)));
  end if;
end $$;

create or replace function public.crm_set_company_trash(company_ids uuid[], restore boolean default false)
returns setof public.companies language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if not public.crm_can_access(true) then raise exception 'Company write access required' using errcode='42501'; end if;
  if company_ids is null or cardinality(company_ids) not between 1 and 100 then
    raise exception 'Choose between 1 and 100 companies' using errcode='22023';
  end if;
  return query update public.companies c set deleted_at=case when restore then null else now() end
    where c.id=any(company_ids) and ((restore and c.deleted_at is not null) or (not restore and c.deleted_at is null))
    returning c.*;
end $$;
create or replace function public.crm_deleted_companies()
returns setof public.companies language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not public.crm_can_access(true) then raise exception 'Company write access required' using errcode='42501'; end if;
  return query select c.* from public.companies c where c.deleted_at is not null order by c.deleted_at desc,c.id;
end $$;
revoke all on function public.crm_set_company_trash(uuid[],boolean) from public,anon;
revoke all on function public.crm_deleted_companies() from public,anon;
grant execute on function public.crm_set_company_trash(uuid[],boolean) to authenticated;
grant execute on function public.crm_deleted_companies() to authenticated;
notify pgrst,'reload schema';
commit;
