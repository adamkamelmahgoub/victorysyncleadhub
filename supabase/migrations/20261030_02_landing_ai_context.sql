begin;
create or replace function public.portal_ai_context(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare context jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('pages')
    or not public.client_feature_enabled('landing_page_ai') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select jsonb_build_object('name',a.name,'industry',a.industry,'website',a.website,
    'phone',a.phone,'brand',a.brand,'logoUrl',a.logo_url,'goalMetric',a.goal_metric,
    'googleReviewLink',a.google_review_link,'model',o.settings->>'ai_landing_model',
    'services',coalesce(a.settings->'services','[]'::jsonb),
    'serviceArea',coalesce(a.settings->'service_area','[]'::jsonb),
    'reviews',(select coalesce(jsonb_agg(jsonb_build_object('reviewer',r.reviewer,
      'rating',r.rating,'text',r.text)),'[]'::jsonb)
      from (select reviewer,rating,text from public.reviews
        where client_account_id=p_account and rating>=4 and text is not null order by created_at desc limit 10) r),
    'photos',(select coalesce(jsonb_agg('landing-media/'||so.name),'[]'::jsonb)
      from storage.objects so where so.bucket_id='landing-media'
        and split_part(so.name,'/',1) in
          (select p.id::text from public.landing_pages p where p.client_account_id=p_account)))
    into context
  from public.sub_accounts a join public.organizations o on o.id=a.organization_id
  where a.id=p_account;
  return context;
end $$;
revoke all on function public.portal_ai_context(uuid) from public, anon;
grant execute on function public.portal_ai_context(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
