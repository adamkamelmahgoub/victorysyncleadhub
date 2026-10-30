begin;

alter table public.sub_accounts add column if not exists mrr_cents integer not null default 0;
alter table public.sub_accounts drop constraint if exists sub_accounts_mrr_cents_check;
alter table public.sub_accounts add constraint sub_accounts_mrr_cents_check check (mrr_cents >= 0);

create or replace function public.refresh_client_health_scores() returns integer
language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  update public.sub_accounts a set health_score = greatest(0, least(100,
    100
    - case when a.goal_value > 0 and (select count(*) from public.leads l
        where l.client_account_id=a.id and l.created_at >= now()-interval '30 days') < a.goal_value then 20 else 0 end
    - case when exists(select 1 from public.client_automation_jobs j where j.client_account_id=a.id
        and j.kind='lead_followup' and j.status='sent' and j.sent_at >
        (select l.created_at+interval '1 minute' from public.leads l where l.id=j.lead_id)) then 15 else 0 end
    - case when exists(select 1 from public.company_tasks t where t.client_account_id=a.id
        and t.status <> 'completed' and t.due_at < now()) then 15 else 0 end
    - case when exists(select 1 from public.invoices i where i.client_account_id=a.id
        and i.status in ('failed','past_due','uncollectible')) then 25 else 0 end
    - case when a.last_active_at is null or a.last_active_at < now()-interval '30 days' then 10 else 0 end
  ));
  get diagnostics changed = row_count;
  return changed;
end $$;
revoke all on function public.refresh_client_health_scores() from public,anon,authenticated;
grant execute on function public.refresh_client_health_scores() to service_role;

do $$ begin
  if exists(select 1 from pg_namespace where nspname='cron') and
    not exists(select 1 from cron.job where jobname='client-health-nightly') then
    perform cron.schedule('client-health-nightly','20 2 * * *','select public.refresh_client_health_scores()');
  end if;
end $$;

create or replace function public.portal_agency_overview() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.name),'[]'::jsonb)
  from (
    select a.id,a.name,a.package,a.launch_date,a.health_score,a.mrr_cents,
      a.goal_metric,a.goal_value,a.last_active_at,
      coalesce(m.name,m.email,'Unassigned') as account_manager,
      (select count(*) from public.leads l where l.client_account_id=a.id
        and l.created_at>=now()-interval '30 days') as leads_month,
      (select count(*) from public.company_tasks t where t.client_account_id=a.id
        and t.status<>'completed' and t.due_at<now()) as overdue_tasks,
      (select count(*) from public.invoices i where i.client_account_id=a.id
        and i.status in ('failed','past_due','uncollectible')) as failed_payments,
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

create or replace function public.portal_failed_automations() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.started_at desc),'[]'::jsonb)
  from (
    select r.id,r.job_id,r.client_account_id,a.name as account_name,r.step,r.error,
      r.started_at,j.kind,j.attempts,j.status as job_status
    from public.automation_runs r
    join public.sub_accounts a on a.id=r.client_account_id
    left join public.client_automation_jobs j on j.id=r.job_id
    where r.status='failed' and public.is_agency() and public.can_access_account(r.client_account_id)
      and public.client_feature_enabled('delivery_automation')
    order by r.started_at desc limit 100
  ) row_data;
$$;
revoke all on function public.portal_failed_automations() from public,anon;
grant execute on function public.portal_failed_automations() to authenticated;

create or replace function public.portal_retry_automation(p_run uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare r public.automation_runs%rowtype;
begin
  select * into r from public.automation_runs where id=p_run for update;
  if r.id is null or r.status<>'failed' or r.job_id is null or
    not public.is_agency() or not public.can_access_account(r.client_account_id) or
    not public.client_feature_enabled('delivery_automation') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  update public.client_automation_jobs set status='pending',attempts=0,run_at=now(),
    last_error=null,claimed_at=null where id=r.job_id and status='failed';
  if not found then raise exception 'Job cannot be retried' using errcode='22023'; end if;
  update public.automation_runs set status='running',error=null,started_at=now(),finished_at=null where id=p_run;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,event_type,action,metadata)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',r.client_account_id::text,
    'automation','retry',jsonb_build_object('run_id',p_run,'job_id',r.job_id));
  return true;
end $$;
revoke all on function public.portal_retry_automation(uuid) from public,anon;
grant execute on function public.portal_retry_automation(uuid) to authenticated;

create or replace function public.portal_set_account_mrr(p_account uuid,p_mrr_cents integer) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_agency_admin() or not public.client_feature_enabled('client_accounts') or
    p_mrr_cents is null or p_mrr_cents<0 or p_mrr_cents>100000000 then
    raise exception 'Access denied' using errcode='42501';
  end if;
  update public.sub_accounts set mrr_cents=p_mrr_cents where id=p_account;
  if not found then raise exception 'Client account not found' using errcode='22023'; end if;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,event_type,action,metadata)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',p_account::text,
    'settings','mrr_updated',jsonb_build_object('mrr_cents',p_mrr_cents));
  return true;
end $$;
revoke all on function public.portal_set_account_mrr(uuid,integer) from public,anon;
grant execute on function public.portal_set_account_mrr(uuid,integer) to authenticated;

notify pgrst, 'reload schema';
commit;

