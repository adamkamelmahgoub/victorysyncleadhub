begin;

-- Existing rows remain agency data until explicitly assigned to a client.
alter table public.sub_accounts
  add column if not exists organization_id uuid references public.organizations(id),
  add column if not exists package text,
  add column if not exists add_ons text[] not null default '{}',
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists timezone text not null default 'America/New_York',
  add column if not exists logo_url text,
  add column if not exists brand jsonb not null default '{}'::jsonb,
  add column if not exists primary_domain text,
  add column if not exists mightycall_number text,
  add column if not exists google_review_link text,
  add column if not exists gbp_url text,
  add column if not exists meta_ad_account_id text,
  add column if not exists google_ads_customer_id text,
  add column if not exists goal_metric text,
  add column if not exists goal_value integer,
  add column if not exists stripe_customer_id text,
  add column if not exists launch_date date,
  add column if not exists account_manager_user_id uuid references auth.users(id) on delete set null,
  add column if not exists invite_email_sent_at timestamptz,
  add column if not exists settings jsonb not null default '{}'::jsonb;

update public.sub_accounts
set organization_id = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid
where organization_id is null;
alter table public.sub_accounts alter column organization_id set default 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid;
alter table public.sub_accounts alter column organization_id set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.sub_accounts'::regclass and conname = 'sub_accounts_package_check') then
    alter table public.sub_accounts add constraint sub_accounts_package_check
      check (package is null or package in ('starter','scale','domination','overflow','business_hours','coverage_247','appt_part_time','appt_full_time','revive','custom'));
  end if;
end $$;

alter table public.mightycall_webhook_inbox
  add column if not exists caller_number text,
  add column if not exists business_number text,
  add column if not exists call_status text,
  add column if not exists call_direction text,
  add column if not exists client_route_attempted_at timestamptz,
  add column if not exists client_routed_at timestamptz;

create unique index if not exists sub_accounts_org_slug_idx on public.sub_accounts(organization_id,slug);
create index if not exists sub_accounts_manager_idx on public.sub_accounts(account_manager_user_id);

create table if not exists public.sub_account_assignments (
  sub_account_id uuid not null references public.sub_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_in_account text not null check (role_in_account in ('account_manager','marketing','ads','agent_lead','agent')),
  created_at timestamptz not null default now(),
  primary key (sub_account_id,user_id)
);
create index if not exists sub_account_assignments_user_idx on public.sub_account_assignments(user_id);

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.team_members'::regclass and conname = 'team_members_role_check') then
    alter table public.team_members add constraint team_members_role_check
      check (role in ('owner','admin','member','viewer','client','agent',
        'agency_admin','agency_staff','client_owner','client_staff'));
  end if;
end $$;

-- These tables already exist. Nullable keys keep agency prospecting data distinct.
do $$
declare item text;
begin
  foreach item in array array[
    'landing_pages','landing_page_events','marketing_landing_pages','marketing_landing_page_events',
    'forms','form_submissions','sequences','sequence_steps','sequence_enrollments','automation_workflows',
    'review_requests','reviews','review_sources','booking_appointments','call_reports',
    'mightycall_reports','mightycall_sms_messages','mightycall_webhook_inbox','report_sends','invoices','invoice_items',
    'conversations','messages','company_tasks','contact_tasks','pipelines','pipeline_stages'
  ] loop
    execute format('alter table public.%I add column if not exists client_account_id uuid references public.sub_accounts(id) on delete cascade', item);
    execute format('create index if not exists %I on public.%I(client_account_id)', item || '_client_account_idx', item);
  end loop;
end $$;

update public.pipeline_stages s set client_account_id=p.client_account_id
from public.pipelines p where p.id=s.pipeline_id and s.client_account_id is distinct from p.client_account_id;
update public.sequence_steps s set client_account_id=q.client_account_id
from public.sequences q where q.id=s.sequence_id and s.client_account_id is distinct from q.client_account_id;
update public.invoice_items s set client_account_id=i.client_account_id
from public.invoices i where i.id=s.invoice_id and s.client_account_id is distinct from i.client_account_id;

create or replace function public.sync_child_client_account() returns trigger
language plpgsql security definer set search_path = '' as $$
declare parent_account uuid; parent_id uuid;
begin
  parent_id := (to_jsonb(new)->>tg_argv[1])::uuid;
  if parent_id is null then return new; end if;
  execute format('select client_account_id from public.%I where id=$1',tg_argv[0])
    into parent_account using parent_id;
  if new.client_account_id is null then
    new.client_account_id:=parent_account;
  elsif new.client_account_id is distinct from parent_account then
    raise exception 'Child account does not match parent';
  end if;
  return new;
end $$;
drop trigger if exists pipeline_stage_client_guard on public.pipeline_stages;
create trigger pipeline_stage_client_guard before insert or update of pipeline_id,client_account_id
on public.pipeline_stages for each row execute function public.sync_child_client_account('pipelines','pipeline_id');
drop trigger if exists sequence_step_client_guard on public.sequence_steps;
create trigger sequence_step_client_guard before insert or update of sequence_id,client_account_id
on public.sequence_steps for each row execute function public.sync_child_client_account('sequences','sequence_id');
drop trigger if exists invoice_item_client_guard on public.invoice_items;
create trigger invoice_item_client_guard before insert or update of invoice_id,client_account_id
on public.invoice_items for each row execute function public.sync_child_client_account('invoices','invoice_id');

-- Keep the newer editor's rows, but associate them with the canonical page.
alter table public.marketing_landing_pages
  add column if not exists canonical_page_id uuid references public.landing_pages(id) on delete set null,
  add column if not exists organization_id uuid references public.organizations(id);
create unique index if not exists marketing_landing_pages_canonical_idx
  on public.marketing_landing_pages(canonical_page_id) where canonical_page_id is not null;
update public.marketing_landing_pages
set organization_id = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid
where organization_id is null;

-- Preserve existing form-submission links when a page is assigned to a client.
create or replace function public.set_submission_client_account() returns trigger
language plpgsql security definer set search_path = '' as $$
declare account_id uuid;
declare page_account_id uuid;
begin
  if new.form_id is not null then
    select f.client_account_id into account_id from public.forms f where f.id = new.form_id;
  end if;
  if new.marketing_page_id is not null then
    select p.client_account_id into page_account_id from public.marketing_landing_pages p where p.id = new.marketing_page_id;
  elsif new.landing_page_id is not null then
    select p.client_account_id into page_account_id from public.landing_pages p where p.id = new.landing_page_id;
  end if;
  if new.form_id is not null and (new.marketing_page_id is not null or new.landing_page_id is not null)
    and account_id is distinct from page_account_id then
    raise exception 'Form and page belong to different accounts';
  end if;
  account_id := coalesce(account_id,page_account_id);
  if new.client_account_id is null then
    new.client_account_id := account_id;
  elsif new.client_account_id is distinct from account_id then
    raise exception 'Submission account does not match its form or page';
  end if;
  return new;
end $$;
drop trigger if exists form_submission_account_guard on public.form_submissions;
create trigger form_submission_account_guard before insert or update of client_account_id,form_id,marketing_page_id,landing_page_id
on public.form_submissions for each row execute function public.set_submission_client_account();

-- A null user_id row is the org default; a user row overrides it.
alter table public.user_feature_access alter column user_id drop not null;
create unique index if not exists user_feature_access_org_default_idx
  on public.user_feature_access(org_id,feature_key) where user_id is null;

create or replace function public.client_feature_enabled(p_feature text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select u.enabled from public.user_feature_access u
      where u.org_id = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid
        and u.user_id = auth.uid() and u.feature_key = p_feature limit 1),
    (select u.enabled from public.user_feature_access u
      where u.org_id = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid
        and u.user_id is null and u.feature_key = p_feature limit 1),
    false
  );
$$;
revoke all on function public.client_feature_enabled(text) from public, anon;
grant execute on function public.client_feature_enabled(text) to authenticated;

create or replace function public.auth_role() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case t.role
      when 'owner' then 'agency_admin' when 'admin' then 'agency_admin'
      when 'member' then 'agency_staff' when 'viewer' then 'agency_staff'
      when 'client' then 'client_owner' when 'agent' then 'agency_staff'
      else t.role end
    from public.team_members t
    where t.is_active is distinct from false
      and (t.user_id = auth.uid() or t.auth_user_id = auth.uid()::text)
    order by (t.role in ('agency_admin','owner','admin')) desc,
      (t.client_account_id is not null) desc, t.created_at desc limit 1
  ), case when public.wf_role() = 'admin' then 'agency_admin' end, 'no_access');
$$;
create or replace function public.is_agency() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.auth_role() in ('agency_admin','agency_staff');
$$;
create or replace function public.is_agency_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.auth_role() = 'agency_admin';
$$;
create or replace function public.can_access_account(p_account_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_account_id is not null and (
    public.is_agency_admin()
    or (public.auth_role() = 'agency_staff' and exists (
      select 1 from public.sub_account_assignments a
      where a.sub_account_id = p_account_id and a.user_id = auth.uid()))
    or (public.auth_role() in ('client_owner','client_staff')
      and public.client_feature_enabled('client_portal') and exists (
      select 1 from public.team_members t where t.client_account_id = p_account_id
        and t.is_active is distinct from false
        and (t.user_id = auth.uid() or t.auth_user_id = auth.uid()::text)))
  );
$$;
revoke all on function public.auth_role() from public, anon;
revoke all on function public.is_agency() from public, anon;
revoke all on function public.is_agency_admin() from public, anon;
revoke all on function public.can_access_account(uuid) from public, anon;
grant execute on function public.auth_role(), public.is_agency(), public.is_agency_admin(), public.can_access_account(uuid) to authenticated;

drop policy if exists client_sub_accounts_read on public.sub_accounts;
create policy client_sub_accounts_read on public.sub_accounts for select to authenticated
  using (public.can_access_account(id));
drop policy if exists workforce_legacy_boundary on public.sub_accounts;

alter table public.sub_account_assignments enable row level security;
drop policy if exists sub_account_assignments_read on public.sub_account_assignments;
create policy sub_account_assignments_read on public.sub_account_assignments for select to authenticated
  using (public.is_agency_admin() or user_id = auth.uid());
drop policy if exists sub_account_assignments_admin on public.sub_account_assignments;
create policy sub_account_assignments_admin on public.sub_account_assignments for all to authenticated
  using (public.is_agency_admin()) with check (public.is_agency_admin());

-- Restrictive guards compose with old policies and prevent cross-client reads
-- before the portal's explicit permissive policies are enabled.
do $$
declare item text;
begin
  foreach item in array array[
    'leads','landing_pages','landing_page_events','marketing_landing_pages',
    'marketing_landing_page_events','forms','form_submissions','sequences',
    'sequence_steps','sequence_enrollments','automation_workflows','review_requests','reviews',
    'review_sources','booking_appointments','call_reports','mightycall_reports',
    'mightycall_sms_messages','mightycall_webhook_inbox','report_sends','invoices','invoice_items','conversations','messages',
    'company_tasks','contact_tasks','pipelines','pipeline_stages'
  ] loop
    execute format('drop policy if exists client_tenancy_guard on public.%I', item);
    execute format('create policy client_tenancy_guard on public.%I as restrictive for all to authenticated using (public.is_agency_admin() or (client_account_id is null and public.is_agency()) or (client_account_id is not null and public.can_access_account(client_account_id))) with check (public.is_agency_admin() or (client_account_id is null and public.is_agency()) or (client_account_id is not null and public.can_access_account(client_account_id)))', item);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
