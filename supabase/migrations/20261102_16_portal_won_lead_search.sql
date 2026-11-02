begin;

create or replace function public.portal_won_leads(p_account uuid,p_query text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('reviews')
    or p_query is null or length(p_query)>100 then
    raise exception 'Won leads unavailable' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb)
    into result
  from (select l.id,l.first_name,l.last_name,l.phone,l.created_at
    from public.leads l join public.pipeline_stages s on s.id=l.pipeline_stage_id
      join public.pipelines p on p.id=s.pipeline_id
    where l.client_account_id=p_account and p.client_account_id=p_account
      and (lower(s.name)='won' or lower(s.key)='won')
      and l.phone is not null and l.phone<>''
      and (p_query='' or position(lower(p_query) in lower(
        concat_ws(' ',l.first_name,l.last_name,l.phone)))>0)
    order by l.created_at desc,l.id desc limit 50) x;
  return result;
end $$;
revoke all on function public.portal_won_leads(uuid,text) from public,anon;
grant execute on function public.portal_won_leads(uuid,text) to authenticated;

commit;
