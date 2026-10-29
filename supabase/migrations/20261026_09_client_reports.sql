begin;

alter table public.report_sends drop constraint if exists report_sends_status_check;
alter table public.report_sends add constraint report_sends_status_check
  check(status in ('pending','draft','queued','sent','failed'));
alter table public.report_sends drop constraint if exists report_sends_type_check;
alter table public.report_sends add constraint report_sends_type_check
  check(type in ('daily','weekly','monthly'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('client-reports','client-reports',false,10485760,array['application/pdf'])
on conflict(id) do nothing;
create unique index if not exists report_sends_client_period_unique on public.report_sends
  (client_account_id,type,period_start,period_end) where client_account_id is not null;

create or replace function public.portal_update_report(p_account uuid,p_report uuid,p_work_done text,p_whats_next text,p_send boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare report public.report_sends%rowtype;
begin
  if not public.can_access_account(p_account) or public.auth_role() not in ('agency_admin','agency_staff')
    or length(p_work_done)>5000 or length(p_whats_next)>5000 then
    raise exception 'Access denied' using errcode='42501';
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
revoke all on function public.portal_update_report(uuid,uuid,text,text,boolean) from public, anon;
grant execute on function public.portal_update_report(uuid,uuid,text,text,boolean) to authenticated;

create or replace function public.portal_report_file(p_account uuid,p_report uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare path text;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('reports') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select pdf_path into path from public.report_sends
  where id=p_report and client_account_id=p_account and status='sent';
  return path;
end $$;
revoke all on function public.portal_report_file(uuid,uuid) from public, anon;
grant execute on function public.portal_report_file(uuid,uuid) to authenticated;

create or replace function public.portal_reports(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('reports') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.period_end desc),'[]'::jsonb) into result
  from (select id,type,period_start,period_end,status,work_done,whats_next,sent_at,pdf_path
    from public.report_sends where client_account_id=p_account order by period_end desc limit 100) r;
  return result;
end $$;
revoke all on function public.portal_reports(uuid) from public, anon;
grant execute on function public.portal_reports(uuid) to authenticated;

create or replace function public.portal_billing_summary(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('billing') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select jsonb_build_object('package',a.package,'addOns',a.add_ons,
    'nextChargeDate',(select coalesce(s.next_billing_date,s.current_period_end::date)
      from public.org_subscriptions s where s.stripe_customer_id=a.stripe_customer_id
      and s.status in ('active','trialing') order by s.created_at desc limit 1)) into result
  from public.sub_accounts a where a.id=p_account;
  return result;
end $$;
revoke all on function public.portal_billing_summary(uuid) from public, anon;
grant execute on function public.portal_billing_summary(uuid) to authenticated;

create or replace function public.enqueue_client_periodic_reports() returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.client_automation_jobs(client_account_id,kind,source_id,run_at)
  select a.id,'weekly_report',a.id::text||':'||
    case when a.package='domination' then to_char(current_date,'IYYY-IW') else to_char(current_date,'YYYY-MM') end,now()
  from public.sub_accounts a where a.status='active' and public.client_delivery_enabled(a.id)
    and ((a.package='domination' and extract(isodow from current_date)=1)
      or (a.package<>'domination' and extract(day from current_date)=1))
  on conflict(kind,source_id) do nothing;
end $$;
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    if exists(select 1 from cron.job where jobname='victorysync-client-weekly-reports') then
      perform cron.unschedule('victorysync-client-weekly-reports');
    end if;
    if exists(select 1 from cron.job where jobname='victorysync-client-periodic-reports') then
      perform cron.unschedule('victorysync-client-periodic-reports');
    end if;
    perform cron.schedule('victorysync-client-periodic-reports','0 13 * * *',
      'select public.enqueue_client_periodic_reports()');
  end if;
exception when others then null;
end $$;

notify pgrst, 'reload schema';
commit;
