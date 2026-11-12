begin;

create or replace function public.portal_request_review(p_account uuid,p_name text,p_phone text,p_lead uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request_id uuid; delay_hours integer; matched_lead uuid; review_link text;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('reviews')
    or public.auth_role() not in ('agency_admin','agency_staff','client_owner')
    or length(trim(p_name))<1 or p_phone !~ '^\+1[0-9]{10}$'
    or not public.client_delivery_enabled(p_account) then
    raise exception 'Review request is unavailable' using errcode='42501';
  end if;
  select greatest(0,least(168,coalesce((settings->>'review_delay_hours')::integer,2))),google_review_link
    into delay_hours,review_link from public.sub_accounts where id=p_account;
  if review_link is null or review_link !~ '^https://[^[:space:]]+$' then
    raise exception 'Add a Google review link before requesting reviews' using errcode='22023';
  end if;
  select id into matched_lead from public.leads where client_account_id=p_account
    and (p_lead is null or id=p_lead) and coalesce(dnc,false)=false
    and right(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),10)=right(p_phone,10)
    and (opt_in_source in ('form','call') or source in ('form','call','missed_call'))
    order by created_at desc limit 1;
  if matched_lead is null then raise exception 'An opted-in lead with this phone is required' using errcode='22023'; end if;
  if public.client_phone_dnc(p_account,p_phone) then raise exception 'Contact opted out' using errcode='22023'; end if;
  insert into public.review_requests(client_account_id,lead_id,contact_name,contact_phone,channel,platform,status)
  values(p_account,matched_lead,trim(p_name),p_phone,'sms','google','pending') returning id into request_id;
  insert into public.client_automation_jobs(client_account_id,lead_id,kind,source_id,run_at)
  values(p_account,matched_lead,'review_request','request:'||request_id::text,now()+make_interval(hours=>delay_hours));
  return request_id;
end $$;
revoke all on function public.portal_request_review(uuid,text,text,uuid) from public, anon;
grant execute on function public.portal_request_review(uuid,text,text,uuid) to authenticated;

commit;
