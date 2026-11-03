begin;

create index if not exists reviews_client_created_summary_idx
  on public.reviews(client_account_id,created_at desc);
create index if not exists review_requests_client_sent_summary_idx
  on public.review_requests(client_account_id,sent_at desc);

create or replace function public.portal_review_summary(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('reviews') then
    raise exception 'Review summary unavailable' using errcode='42501';
  end if;
  select jsonb_build_object(
    'requestsSent',(select count(*) from public.review_requests q
      where q.client_account_id=p_account and q.sent_at is not null),
    'requestsClicked',(select count(*) from public.review_requests q
      where q.client_account_id=p_account and q.clicked_at is not null),
    'reviewsReceived',(select count(*) from public.reviews r
      where r.client_account_id=p_account),
    'averageRating',(select round(avg(r.rating)::numeric,1) from public.reviews r
      where r.client_account_id=p_account),
    'trend',coalesce((select jsonb_agg(to_jsonb(t) order by t.month)
      from (select to_char(date_trunc('month',r.created_at),'YYYY-MM') as month,
        round(avg(r.rating)::numeric,1) as rating,count(*) as count
        from public.reviews r where r.client_account_id=p_account
          and r.created_at>=date_trunc('month',now())-interval '5 months'
        group by date_trunc('month',r.created_at)) t),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.portal_review_summary(uuid) from public,anon;
grant execute on function public.portal_review_summary(uuid) to authenticated;

commit;
