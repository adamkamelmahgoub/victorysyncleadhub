begin;

-- These are agency-level financial records, not client account data.
-- Client owners receive their invoice and charge date through scoped RPCs.
do $$
declare item text;
begin
  foreach item in array array['billing_records','org_subscriptions','usage_charges','org_billing_locks'] loop
    if to_regclass(format('public.%I',item)) is not null then
      execute format('alter table public.%I enable row level security',item);
      execute format('drop policy if exists agency_billing_guard on public.%I',item);
      execute format('create policy agency_billing_guard on public.%I as restrictive for all to authenticated using (public.is_agency_admin()) with check (public.is_agency_admin())',item);
    end if;
  end loop;
end $$;

commit;
