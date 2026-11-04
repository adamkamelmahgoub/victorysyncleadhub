begin;

create or replace function public.portal_accounts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.client_feature_enabled('client_portal') then
    raise exception 'Client portal is disabled' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.name), '[]'::jsonb) into result
  from (
    select s.id, s.name, s.slug, s.status, s.package, s.logo_url,
      s.last_active_at, s.launch_date, s.health_score,
      (select count(*) from public.leads l where l.client_account_id = s.id
        and l.created_at >= now() - interval '7 days') as leads_this_week,
      (select count(*) from public.company_tasks t where t.client_account_id = s.id
        and t.status <> 'completed' and t.due_at < now()) as overdue_tasks,
      case when public.auth_role() in ('agency_admin','client_owner') then
        (select count(*) from public.invoices i where i.client_account_id = s.id
          and i.status in ('failed','past_due','uncollectible')) else null end as failed_payments
    from public.sub_accounts s where public.can_access_account(s.id)
  ) a;
  return result;
end $$;
revoke all on function public.portal_accounts() from public,anon;
grant execute on function public.portal_accounts() to authenticated;

create or replace function public.portal_agency_overview() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.name),'[]'::jsonb)
  from (
    select a.id,a.name,a.package,a.launch_date,a.health_score,
      case when public.is_agency_admin() then a.mrr_cents else null end as mrr_cents,
      a.goal_metric,a.goal_value,a.last_active_at,
      coalesce(m.name,m.email,'Unassigned') as account_manager,
      (select count(*) from public.leads l where l.client_account_id=a.id
        and l.created_at>=now()-interval '30 days') as leads_month,
      (select count(*) from public.company_tasks t where t.client_account_id=a.id
        and t.status<>'completed' and t.due_at<now()) as overdue_tasks,
      case when public.is_agency_admin() then
        (select count(*) from public.invoices i where i.client_account_id=a.id
          and i.status in ('failed','past_due','uncollectible')) else null end as failed_payments,
      (select round(avg(extract(epoch from (j.sent_at-l.created_at))))::integer
        from public.client_automation_jobs j join public.leads l on l.id=j.lead_id
        where j.client_account_id=a.id and j.kind='lead_followup' and j.status='sent'
          and j.sent_at>=now()-interval '30 days') as response_seconds,
      (select coalesce(round(sum(c.duration_seconds)/60.0),0)::integer from public.client_call_details c
        where c.client_account_id=a.id and c.status='answered'
          and c.occurred_at>=date_trunc('month',now())) as answered_minutes,
      (select count(*) from public.mightycall_sms_messages s where s.client_account_id=a.id
        and s.direction='outbound' and coalesce(s.sent_at,s.created_at)>=date_trunc('month',now())) as texts_sent,
      (select coalesce(sum(ai.prompt_tokens+ai.completion_tokens),0) from public.ai_requests ai
        where ai.client_account_id=a.id and ai.created_at>=date_trunc('month',now())) as ai_tokens,
      coalesce((a.settings->>'answering_hours_limit')::numeric,0) as answering_hours_limit
    from public.sub_accounts a
    left join public.team_members m on m.user_id=a.account_manager_user_id and m.is_active is distinct from false
    where public.is_agency() and public.can_access_account(a.id)
      and public.client_feature_enabled('client_accounts')
  ) row_data;
$$;
revoke all on function public.portal_agency_overview() from public,anon;
grant execute on function public.portal_agency_overview() to authenticated;

commit;
