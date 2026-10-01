begin;

create or replace function public.crm_custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare member public.team_members%rowtype;
declare claims jsonb;
begin
  select * into member from public.team_members
  where auth_user_id = event->>'user_id' and status = 'active'
  order by updated_at desc limit 1;
  claims := event->'claims';
  if member.id is not null then
    claims := pg_catalog.jsonb_set(claims, '{crm_role}', pg_catalog.to_jsonb(member.role), true);
    claims := pg_catalog.jsonb_set(claims, '{crm_client_account_id}', pg_catalog.to_jsonb(member.client_account_id), true);
    claims := pg_catalog.jsonb_set(claims, '{crm_team_member_id}', pg_catalog.to_jsonb(member.id), true);
    claims := pg_catalog.jsonb_set(claims, '{crm_page_permissions}', pg_catalog.to_jsonb(member.page_permissions), true);
  elsif exists (select 1 from public.profiles p where p.id = (event->>'user_id')::uuid
    and p.global_role = 'platform_admin') then
    claims := pg_catalog.jsonb_set(claims, '{crm_role}', '"admin"'::jsonb, true);
  end if;
  return pg_catalog.jsonb_set(event, '{claims}', claims);
end;
$$;
revoke all on function public.crm_custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.crm_custom_access_token_hook(jsonb) to supabase_auth_admin;
grant select on public.team_members to supabase_auth_admin;

create or replace function public.crm_lead_can_read(row_client uuid, row_fields jsonb) returns boolean
language sql stable set search_path = '' as $$
  select case auth.jwt()->>'crm_role'
    when 'owner' then true when 'admin' then true when 'member' then true when 'viewer' then true
    when 'client' then row_client is not null and row_client::text = auth.jwt()->>'crm_client_account_id'
    when 'agent' then
      (row_fields->>'assigned_agent_id' = auth.jwt()->>'crm_team_member_id')
      or (row_client is not null and row_client::text = auth.jwt()->>'crm_client_account_id')
    else false end;
$$;
create or replace function public.crm_lead_can_write(row_client uuid, row_fields jsonb) returns boolean
language sql stable set search_path = '' as $$
  select auth.jwt()->>'crm_role' in ('owner','admin','member') or
    (auth.jwt()->>'crm_role' = 'agent' and
      ((row_fields->>'assigned_agent_id' = auth.jwt()->>'crm_team_member_id') or
       (row_client is not null and row_client::text = auth.jwt()->>'crm_client_account_id')));
$$;

alter table public.leads enable row level security;
drop policy if exists workforce_legacy_boundary on public.leads;
drop policy if exists workforce_legacy_admin on public.leads;
revoke all on public.leads from anon;
grant select, insert, update, delete on public.leads to authenticated;
create policy crm_lead_read on public.leads for select to authenticated
  using (public.crm_lead_can_read(client_account_id, custom_fields));
create policy crm_lead_read_guard on public.leads as restrictive for select to authenticated
  using (public.crm_lead_can_read(client_account_id, custom_fields));
create policy crm_lead_insert on public.leads for insert to authenticated
  with check (public.crm_lead_can_write(client_account_id, custom_fields));
create policy crm_lead_insert_guard on public.leads as restrictive for insert to authenticated
  with check (public.crm_lead_can_write(client_account_id, custom_fields));
create policy crm_lead_update on public.leads for update to authenticated
  using (public.crm_lead_can_write(client_account_id, custom_fields))
  with check (public.crm_lead_can_write(client_account_id, custom_fields));
create policy crm_lead_update_guard on public.leads as restrictive for update to authenticated
  using (public.crm_lead_can_write(client_account_id, custom_fields))
  with check (public.crm_lead_can_write(client_account_id, custom_fields));
create policy crm_lead_delete on public.leads for delete to authenticated
  using (public.crm_lead_can_write(client_account_id, custom_fields));
create policy crm_lead_delete_guard on public.leads as restrictive for delete to authenticated
  using (public.crm_lead_can_write(client_account_id, custom_fields));

alter table public.pipeline_stages enable row level security;
drop policy if exists workforce_legacy_boundary on public.pipeline_stages;
drop policy if exists workforce_legacy_admin on public.pipeline_stages;
grant select, insert, update, delete on public.pipeline_stages to authenticated;
create policy crm_stages_read on public.pipeline_stages for select to authenticated
  using (auth.jwt()->>'crm_role' in ('owner','admin','member','agent','viewer','client'));
create policy crm_stages_write on public.pipeline_stages for all to authenticated
  using (auth.jwt()->>'crm_role' in ('owner','admin','member'))
  with check (auth.jwt()->>'crm_role' in ('owner','admin','member'));
create policy crm_stages_insert_guard on public.pipeline_stages as restrictive for insert to authenticated
  with check (auth.jwt()->>'crm_role' in ('owner','admin','member'));
create policy crm_stages_update_guard on public.pipeline_stages as restrictive for update to authenticated
  using (auth.jwt()->>'crm_role' in ('owner','admin','member'))
  with check (auth.jwt()->>'crm_role' in ('owner','admin','member'));
create policy crm_stages_delete_guard on public.pipeline_stages as restrictive for delete to authenticated
  using (auth.jwt()->>'crm_role' in ('owner','admin','member'));

drop policy if exists workforce_legacy_boundary on public.pipelines;
drop policy if exists workforce_legacy_admin on public.pipelines;
create policy crm_pipeline_read on public.pipelines for select to authenticated
  using (auth.jwt()->>'crm_role' in ('owner','admin','member','agent','viewer','client'));
create policy crm_pipeline_write on public.pipelines for all to authenticated
  using (auth.jwt()->>'crm_role' in ('owner','admin','member'))
  with check (auth.jwt()->>'crm_role' in ('owner','admin','member'));
create policy crm_pipeline_insert_guard on public.pipelines as restrictive for insert to authenticated
  with check (auth.jwt()->>'crm_role' in ('owner','admin','member'));
create policy crm_pipeline_update_guard on public.pipelines as restrictive for update to authenticated
  using (auth.jwt()->>'crm_role' in ('owner','admin','member'))
  with check (auth.jwt()->>'crm_role' in ('owner','admin','member'));
create policy crm_pipeline_delete_guard on public.pipelines as restrictive for delete to authenticated
  using (auth.jwt()->>'crm_role' in ('owner','admin','member'));

notify pgrst, 'reload schema';
commit;
