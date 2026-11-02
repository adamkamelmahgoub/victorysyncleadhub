export const inboxViewAccessSql=`select 1 from public.profiles where id=$1 and global_role='platform_admin'
  union all select 1 from public.team_members m left join public.social_team_permissions p on p.team_member_id=m.id
  where m.auth_user_id=$1::text and m.org_id=$2 and m.status='active' and m.client_account_id is null
    and (m.role in ('owner','admin') or 'inbox_view'=any(coalesce(p.permissions,'{}'::text[]))) limit 1`;

export const formsAccessSql=`select 1 from public.profiles where id=$1 and global_role='platform_admin'
  union all select 1 from public.team_members where auth_user_id=$1::text and org_id=$2 and status='active'
    and client_account_id is null and role in ('owner','admin','member')
    and (role in ('owner','admin') or page_permissions is null or page_permissions ? 'forms') limit 1`;
