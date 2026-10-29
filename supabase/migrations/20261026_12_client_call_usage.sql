begin;

create table if not exists public.client_usage_alerts (
  id uuid primary key default gen_random_uuid(),
  client_account_id uuid not null references public.sub_accounts(id) on delete cascade,
  month date not null,
  threshold integer not null default 80,
  minutes_used integer not null,
  minutes_included integer not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(client_account_id,month,threshold)
);
alter table public.client_usage_alerts enable row level security;
drop policy if exists client_usage_alerts_read on public.client_usage_alerts;
create policy client_usage_alerts_read on public.client_usage_alerts for select to authenticated
  using(public.is_agency_admin() or (public.is_agency() and public.can_access_account(client_account_id)));

create or replace function public.client_usage_meter(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  select jsonb_build_object(
    'minutesUsed',coalesce((select ceil(sum(duration_seconds)/60.0)::integer from public.client_call_details
      where client_account_id=p_account and lower(status) in ('answered','connected')
        and occurred_at>=date_trunc('month',now())),0),
    'agentHours',coalesce((select round(sum(duration_seconds)/3600.0,1) from public.client_call_details
      where client_account_id=p_account and lower(status) in ('answered','connected')
        and occurred_at>=date_trunc('month',now())),0),
    'minutesIncluded',greatest(0,coalesce((a.settings->>'included_minutes')::integer,0))) into result
  from public.sub_accounts a where a.id=p_account;
  return result;
end $$;
revoke all on function public.client_usage_meter(uuid) from public, anon, authenticated;
grant execute on function public.client_usage_meter(uuid) to service_role;

create or replace function public.portal_usage(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('calls') then
    raise exception 'Access denied' using errcode='42501'; end if;
  return public.client_usage_meter(p_account);
end $$;
revoke all on function public.portal_usage(uuid) from public, anon;
grant execute on function public.portal_usage(uuid) to authenticated;

create or replace function public.portal_set_usage_limit(p_account uuid,p_minutes integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_agency_admin() or not public.can_access_account(p_account)
    or p_minutes<0 or p_minutes>1000000 then raise exception 'Access denied' using errcode='42501'; end if;
  update public.sub_accounts set settings=jsonb_set(coalesce(settings,'{}'::jsonb),'{included_minutes}',to_jsonb(p_minutes),true)
  where id=p_account;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,event_type,action,target,metadata)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    p_account::text,'settings','usage_limit_changed',p_account::text,jsonb_build_object('included_minutes',p_minutes));
end $$;
revoke all on function public.portal_set_usage_limit(uuid,integer) from public, anon;
grant execute on function public.portal_set_usage_limit(uuid,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
