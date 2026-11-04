begin;

create or replace function public.portal_report_recipients(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('reports')
    or public.auth_role() not in ('agency_admin','agency_staff','client_owner') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by lower(r.email)),'[]'::jsonb) into result
  from (select id,email,name,active from public.report_recipients
    where client_account_id=p_account) r;
  return result;
end $$;
revoke all on function public.portal_report_recipients(uuid) from public,anon;
grant execute on function public.portal_report_recipients(uuid) to authenticated;

create or replace function public.portal_set_report_recipient(
  p_account uuid,p_email text,p_name text,p_active boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('reports')
    or public.auth_role() not in ('agency_admin','agency_staff','client_owner')
    or p_email is null or length(trim(p_email))>320 or trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_name is null or length(trim(p_name))>200 or p_active is null then
    raise exception 'Access denied' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_account::text||':'||lower(trim(p_email)),0));
  select id into recipient from public.report_recipients
    where client_account_id=p_account and lower(email)=lower(trim(p_email))
    order by id limit 1;
  if recipient is null then
    insert into public.report_recipients(id,client_account_id,email,name,active,daily,weekly)
      values(gen_random_uuid(),p_account,lower(trim(p_email)),trim(p_name),p_active,false,true)
      returning id into recipient;
  else
    update public.report_recipients set name=trim(p_name),active=p_active
      where client_account_id=p_account and lower(email)=lower(trim(p_email));
  end if;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,
    event_type,action,target)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    p_account::text,'report','recipient_updated',recipient::text);
  return recipient;
end $$;
revoke all on function public.portal_set_report_recipient(uuid,text,text,boolean) from public,anon;
grant execute on function public.portal_set_report_recipient(uuid,text,text,boolean) to authenticated;

commit;
