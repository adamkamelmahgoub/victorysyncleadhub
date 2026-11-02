begin;

create index if not exists leads_client_created_id_page_idx
  on public.leads(client_account_id,created_at desc,id desc);

create or replace function public.portal_lead_page(
  p_account uuid,p_before_at timestamptz default null,p_before_id uuid default null,
  p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.portal_page_allowed('leads') or not public.can_access_account(p_account)
    or (p_before_at is null) <> (p_before_id is null)
    or p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'Lead page unavailable' using errcode='42501';
  end if;
  with page as (
    select id,first_name,last_name,email,phone,company,status,pipeline_stage_id,
      notes,source,dnc,meeting_at,created_at
    from public.leads
    where client_account_id=p_account and (p_before_at is null
      or (created_at,id)<(p_before_at,p_before_id))
    order by created_at desc,id desc limit p_limit+1
  ), visible as (
    select * from page order by created_at desc,id desc limit p_limit
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc,v.id desc)
      from visible v),'[]'::jsonb),
    'stages',coalesce((select jsonb_agg(to_jsonb(x) order by x.position,x.id)
      from (select s.id,s.name,s.position from public.pipeline_stages s
        join public.pipelines p on p.id=s.pipeline_id where p.client_account_id=p_account) x),'[]'::jsonb),
    'nextCursor',case when (select count(*) from page)>p_limit then
      (select jsonb_build_object('createdAt',v.created_at,'id',v.id)
       from visible v order by v.created_at,v.id limit 1) else null end
  ) into result;
  return result;
end $$;
revoke all on function public.portal_lead_page(uuid,timestamptz,uuid,integer) from public,anon;
grant execute on function public.portal_lead_page(uuid,timestamptz,uuid,integer) to authenticated;

commit;
