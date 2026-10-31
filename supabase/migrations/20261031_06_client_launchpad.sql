begin;

create or replace function public.portal_launchpad(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('dashboard') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select jsonb_build_object('accountName',a.name,'steps',jsonb_build_array(
    jsonb_build_object('key','phone','label','Connect your phone number','done',nullif(a.mightycall_number,'') is not null,'path','/client-portal/settings'),
    jsonb_build_object('key','google','label','Add your Google Business Profile','done',nullif(a.gbp_url,'') is not null,'path','/client-portal/settings'),
    jsonb_build_object('key','meta','label','Connect your Meta ad account','done',nullif(a.meta_ad_account_id,'') is not null,'path','/client-portal/settings'),
    jsonb_build_object('key','reviews','label','Add your Google review link','done',nullif(a.google_review_link,'') is not null,'path','/client-portal/settings'),
    jsonb_build_object('key','page','label','Publish your first landing page','done',exists(
      select 1 from public.marketing_landing_pages p where p.client_account_id=a.id and p.status='published'),'path','/client-portal/pages'),
    jsonb_build_object('key','workflow','label','Activate your first workflow','done',exists(
      select 1 from public.automation_workflows w where w.client_account_id=a.id and w.is_active),'path','/client-portal/dashboard')
  )) into result from public.sub_accounts a where a.id=p_account;
  return result;
end $$;
revoke all on function public.portal_launchpad(uuid) from public, anon;
grant execute on function public.portal_launchpad(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;

-- Rollback: drop function public.portal_launchpad(uuid).
