begin;

create index if not exists reviews_client_created_id_page_idx
  on public.reviews(client_account_id,created_at desc,id desc);
create index if not exists review_requests_client_sent_id_page_idx
  on public.review_requests(client_account_id,sent_at desc,id desc);

create or replace function public.portal_review_page(p_account uuid,p_kind text,
  p_before_at timestamptz default null,p_before_id uuid default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('reviews')
    or p_kind is null or p_kind not in ('reviews','requests')
    or (p_before_at is null)<>(p_before_id is null)
    or p_limit is null or p_limit<1 or p_limit>100 then
    raise exception 'Review page unavailable' using errcode='42501';
  end if;
  if p_kind='reviews' then
    with page as (select id,platform,reviewer,rating,text,reply,replied_at,review_url,created_at
      from public.reviews where client_account_id=p_account
        and (p_before_at is null or (created_at,id)<(p_before_at,p_before_id))
      order by created_at desc,id desc limit p_limit+1),
    visible as (select * from page order by created_at desc,id desc limit p_limit)
    select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc,v.id desc)
      from visible v),'[]'::jsonb),'nextCursor',case when (select count(*) from page)>p_limit then
      (select jsonb_build_object('at',v.created_at,'id',v.id) from visible v
        order by v.created_at,v.id limit 1) else null end) into result;
  else
    with page as (select id,contact_name,channel,platform,status,sent_at,clicked_at
      from public.review_requests where client_account_id=p_account
        and (p_before_at is null or (sent_at,id)<(p_before_at,p_before_id))
      order by sent_at desc,id desc limit p_limit+1),
    visible as (select * from page order by sent_at desc,id desc limit p_limit)
    select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(v) order by v.sent_at desc,v.id desc)
      from visible v),'[]'::jsonb),'nextCursor',case when (select count(*) from page)>p_limit then
      (select jsonb_build_object('at',v.sent_at,'id',v.id) from visible v
        order by v.sent_at,v.id limit 1) else null end) into result;
  end if;
  return result;
end $$;
revoke all on function public.portal_review_page(uuid,text,timestamptz,uuid,integer) from public,anon;
grant execute on function public.portal_review_page(uuid,text,timestamptz,uuid,integer) to authenticated;

commit;
