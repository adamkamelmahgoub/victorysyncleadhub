begin;

create or replace function public.crm_custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare member public.team_members%rowtype;
declare claims jsonb;
begin
  select * into member from public.team_members
  where auth_user_id = event->>'user_id' and status = 'active'
  order by updated_at desc limit 1;
  claims := (event->'claims') - 'crm_role' - 'crm_client_account_id'
    - 'crm_team_member_id' - 'crm_page_permissions';
  if member.id is not null then
    claims := claims || pg_catalog.jsonb_build_object(
      'crm_role', member.role,
      'crm_client_account_id', member.client_account_id,
      'crm_team_member_id', member.id,
      'crm_page_permissions', member.page_permissions);
  elsif exists (select 1 from public.profiles p where p.id = (event->>'user_id')::uuid
    and p.global_role = 'platform_admin') then
    claims := claims || '{"crm_role":"admin"}'::jsonb;
  end if;
  return pg_catalog.jsonb_set(event, '{claims}', claims);
end;
$$;

notify pgrst, 'reload schema';
commit;
