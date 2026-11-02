begin;

create index if not exists report_sends_client_period_archive_idx
  on public.report_sends(client_account_id,period_end desc,id desc);

create or replace function public.portal_reports(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('reports') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.period_end desc,r.id desc),'[]'::jsonb) into result
  from (select id,type,period_start,period_end,status,work_done,whats_next,sent_at,pdf_path
    from public.report_sends where client_account_id=p_account) r;
  return result;
end $$;
revoke all on function public.portal_reports(uuid) from public,anon;
grant execute on function public.portal_reports(uuid) to authenticated;

commit;
