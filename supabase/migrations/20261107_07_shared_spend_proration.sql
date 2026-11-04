begin;

create or replace function public.client_dashboard_metric_values(
  p_account uuid,p_start timestamptz,p_end timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'account',(select to_jsonb(a) from (select id,name,package,logo_url,brand,goal_metric,goal_value
      from public.sub_accounts where id=p_account) a),
    'newLeads',(select count(*) from public.leads where client_account_id=p_account and created_at>=p_start and created_at<p_end),
    'bookedJobs',(select count(*) from public.booking_appointments where client_account_id=p_account
      and status not in ('cancelled','no_show') and start_at>=p_start and start_at<p_end),
    'answeredCalls',(select count(*) from public.client_call_details where client_account_id=p_account
      and lower(status) in ('answered','connected') and occurred_at>=p_start and occurred_at<p_end),
    'missedCallsRecovered',(select count(distinct source_id) from public.client_automation_jobs
      where client_account_id=p_account and kind='missed_call_text' and status='sent'
        and sent_at>=p_start and sent_at<p_end),
    'reviewsReceived',(select count(*) from public.reviews where client_account_id=p_account
      and created_at>=p_start and created_at<p_end),
    'averageRating',(select round(avg(rating)::numeric,1) from public.reviews
      where client_account_id=p_account and created_at>=p_start and created_at<p_end),
    'adSpendCents',(select coalesce(round(sum(amount_cents *
      greatest(0,extract(epoch from least(p_end,(month+interval '1 month') at time zone 'UTC')-
        greatest(p_start,month::timestamp at time zone 'UTC'))) /
      extract(epoch from (month+interval '1 month') at time zone 'UTC'-
        (month::timestamp at time zone 'UTC')))),0)
      from public.ad_spend_entries where client_account_id=p_account
        and month::timestamp at time zone 'UTC'<p_end
        and (month+interval '1 month') at time zone 'UTC'>p_start),
    'sourceBreakdown',(select coalesce(jsonb_object_agg(source,count),'{}'::jsonb)
      from (select coalesce(nullif(source,''),'other') source,count(*)
        from public.leads where client_account_id=p_account and created_at>=p_start and created_at<p_end
        group by 1) s)
  );
$$;
revoke all on function public.client_dashboard_metric_values(uuid,timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function public.client_dashboard_metric_values(uuid,timestamptz,timestamptz) to service_role;

commit;
