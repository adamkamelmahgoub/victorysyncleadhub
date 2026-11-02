begin;

create index if not exists client_call_details_account_time_id_page_idx
  on public.client_call_details(client_account_id,occurred_at desc,id desc);

create or replace function public.portal_call_page(
  p_account uuid,p_start timestamptz,p_end timestamptz,p_outcome text default null,
  p_before_at timestamptz default null,p_before_id uuid default null,p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('calls')
    or p_start is null or p_end is null or p_start>=p_end
    or p_end-p_start>interval '367 days'
    or (p_before_at is null)<>(p_before_id is null)
    or p_limit is null or p_limit<1 or p_limit>200
    or (p_outcome is not null and p_outcome not in
      ('booked','message_taken','spam','existing_customer','other')) then
    raise exception 'Call page unavailable' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.occurred_at desc,c.id desc),'[]'::jsonb)
    into result
  from (select id,external_call_id,lead_id,occurred_at,caller_number,business_number,
      status,direction,duration_seconds,recording_url,agent_name,outcome,summary,booked
    from public.client_call_details
    where client_account_id=p_account and occurred_at>=p_start and occurred_at<p_end
      and (p_outcome is null or outcome=p_outcome)
      and (p_before_at is null or (occurred_at,id)<(p_before_at,p_before_id))
    order by occurred_at desc,id desc limit p_limit) c;
  return result;
end $$;
revoke all on function public.portal_call_page(uuid,timestamptz,timestamptz,text,timestamptz,uuid,integer)
  from public,anon;
grant execute on function public.portal_call_page(uuid,timestamptz,timestamptz,text,timestamptz,uuid,integer)
  to authenticated;

commit;
