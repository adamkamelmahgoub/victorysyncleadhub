begin;

create or replace function public.portal_update_report(p_account uuid,p_report uuid,p_work_done text,p_whats_next text,p_send boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare report public.report_sends%rowtype;
begin
  if not public.can_access_account(p_account) or public.auth_role() not in ('agency_admin','agency_staff')
    or length(coalesce(p_work_done,''))>5000 or length(coalesce(p_whats_next,''))>5000 then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if p_send and (nullif(trim(coalesce(p_work_done,'')),'') is null
    or nullif(trim(coalesce(p_whats_next,'')),'') is null) then
    raise exception 'Complete both report narrative fields before sending' using errcode='22023';
  end if;
  if p_send and not exists (
    select 1 from public.sub_accounts a where a.id=p_account
      and nullif(trim(coalesce(a.owner_email,'')),'') is not null
  ) and not exists (
    select 1 from public.report_recipients r where r.client_account_id=p_account
      and r.active and nullif(trim(coalesce(r.email,'')),'') is not null
  ) then
    raise exception 'Add a report recipient before sending' using errcode='22023';
  end if;
  update public.report_sends set work_done=p_work_done,whats_next=p_whats_next
  where id=p_report and client_account_id=p_account and status='draft' returning * into report;
  if report.id is null then raise exception 'Draft unavailable' using errcode='02000'; end if;
  if p_send then
    if not public.client_delivery_enabled(p_account) then
      raise exception 'Delivery automation is disabled' using errcode='42501';
    end if;
    insert into public.client_automation_jobs(client_account_id,kind,source_id)
    values(p_account,'report_send','report:'||p_report::text)
    on conflict(kind,source_id) do nothing;
    update public.report_sends set status='queued' where id=p_report;
  end if;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,event_type,action,target)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    p_account::text,'report',case when p_send then 'queued' else 'draft_updated' end,p_report::text);
end $$;
revoke all on function public.portal_update_report(uuid,uuid,text,text,boolean) from public,anon;
grant execute on function public.portal_update_report(uuid,uuid,text,text,boolean) to authenticated;

commit;
