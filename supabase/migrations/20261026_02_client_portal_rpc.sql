begin;

alter table public.organizations add column if not exists settings jsonb not null default '{}'::jsonb;

create or replace function public.touch_client_login() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.action='signed_in' and new.client_account_id is not null
    and new.client_account_id ~ '^[0-9a-fA-F-]{36}$' then
    update public.sub_accounts set last_active_at=now()
    where id=new.client_account_id::uuid;
  end if;
  return new;
end $$;
drop trigger if exists client_login_activity on public.portal_activity_log;
create trigger client_login_activity after insert on public.portal_activity_log
for each row execute function public.touch_client_login();

create or replace function public.portal_page_allowed(p_page text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.client_feature_enabled('client_portal')
    and (p_page<>'pages' or public.client_feature_enabled('landing_page_builder'))
    and case public.auth_role()
    when 'agency_admin' then true
    when 'agency_staff' then p_page <> 'billing'
    when 'client_owner' then true
    when 'client_staff' then p_page in ('dashboard','leads','calls')
    else false end and coalesce((
      select case when jsonb_typeof(t.page_permissions) is distinct from 'array' or not exists (
        select 1 from jsonb_array_elements_text(case when jsonb_typeof(t.page_permissions)='array'
          then t.page_permissions else '[]'::jsonb end) as x(key)
        where x.key in ('dashboard','leads','calls','pages','forms','reviews','reports','billing','settings')
      ) then true else t.page_permissions ? p_page end
      from public.team_members t
      where t.is_active is distinct from false
        and (t.user_id=auth.uid() or t.auth_user_id=auth.uid()::text)
      order by (t.role in ('agency_admin','owner','admin')) desc,
        (t.client_account_id is not null) desc,t.created_at desc limit 1
    ),true);
$$;
revoke all on function public.portal_page_allowed(text) from public, anon;
grant execute on function public.portal_page_allowed(text) to authenticated;

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
      case when public.auth_role()='client_staff' then null else
        (select count(*) from public.invoices i where i.client_account_id = s.id
          and i.status in ('failed','past_due','uncollectible')) end as failed_payments
    from public.sub_accounts s where public.can_access_account(s.id)
  ) a;
  return result;
end $$;
revoke all on function public.portal_accounts() from public, anon;
grant execute on function public.portal_accounts() to authenticated;

create or replace function public.portal_snapshot(p_account uuid, p_page text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_page not in ('dashboard','leads','calls','pages','forms','reviews','reports','billing','settings')
    or not public.portal_page_allowed(p_page) or not public.can_access_account(p_account) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  case p_page
    when 'dashboard' then
      select jsonb_build_object(
        'account', (select to_jsonb(a) from (select id,name,slug,package,status,logo_url,brand,
          primary_domain,goal_metric,goal_value,launch_date,google_review_link
          from public.sub_accounts where id = p_account) a),
        'leadsThisWeek', (select count(*) from public.leads where client_account_id = p_account and created_at >= now()-interval '7 days'),
        'missedCallsThisWeek', (select count(distinct external_call_id) from public.mightycall_webhook_inbox where client_account_id = p_account and call_status ilike 'missed' and occurred_at >= now()-interval '7 days'),
        'openTasks', (select count(*) from public.company_tasks where client_account_id = p_account and status <> 'completed'),
        'publishedPages', (select count(*) from public.marketing_landing_pages where client_account_id = p_account and status = 'published')
      ) into result;
    when 'leads' then
      select jsonb_build_object(
        'rows',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
          from (select id,first_name,last_name,email,phone,company,status,pipeline_stage_id,
            notes,source,dnc,meeting_at,created_at from public.leads
            where client_account_id = p_account order by created_at desc limit 200) x),
        'stages',(select coalesce(jsonb_agg(to_jsonb(x) order by x.position),'[]'::jsonb)
          from (select s.id,s.name,s.position from public.pipeline_stages s
            join public.pipelines p on p.id=s.pipeline_id where p.client_account_id=p_account) x)
      ) into result;
    when 'calls' then
      select jsonb_build_object(
        'events', (select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc),'[]'::jsonb)
          from (select id,event_type,external_call_id,occurred_at,status,call_status,call_direction
            from public.mightycall_webhook_inbox where client_account_id=p_account
            order by occurred_at desc limit 100) x),
        'reports', (select coalesce(jsonb_agg(to_jsonb(x) order by x.report_date desc),'[]'::jsonb)
          from (select id,report_date,total_calls,answered_calls,avg_wait_seconds,data
            from public.call_reports where client_account_id=p_account
            order by report_date desc limit 30) x),
        'texts', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
          from (select id,from_number,to_number,direction,status,message_text,created_at
            from public.mightycall_sms_messages where client_account_id=p_account
            order by created_at desc limit 100) x)
      ) into result;
    when 'pages' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into result
      from (select id,title as name,slug,status,seo_description,sections,theme,created_at,updated_at
        from public.marketing_landing_pages where client_account_id=p_account
        order by created_at desc limit 100) x;
    when 'forms' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into result
      from (select id,name,slug,status,created_at from public.forms
        where client_account_id=p_account order by created_at desc limit 100) x;
    when 'reviews' then
      select jsonb_build_object(
        'reviews', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
          from (select id,platform,reviewer,rating,text,reply,replied_at,review_url,created_at
            from public.reviews where client_account_id=p_account
            order by created_at desc limit 100) x),
        'requests', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sent_at desc),'[]'::jsonb)
          from (select id,contact_name,channel,platform,status,sent_at,clicked_at
            from public.review_requests where client_account_id=p_account
            order by sent_at desc limit 100) x)
      ) into result;
    when 'reports' then
      select jsonb_build_object(
        'calls', (select coalesce(jsonb_agg(to_jsonb(x) order by x.report_date desc),'[]'::jsonb)
          from (select id,report_date,total_calls,answered_calls,avg_wait_seconds
            from public.call_reports where client_account_id=p_account
            order by report_date desc limit 52) x),
        'sends', (select coalesce(jsonb_agg(to_jsonb(x) order by x.period_end desc),'[]'::jsonb)
          from (select id,type,period_start,period_end,sent_at,status,pdf_path
            from public.report_sends where client_account_id=p_account
            order by period_end desc limit 52) x)
      ) into result;
    when 'billing' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.issued_at desc),'[]'::jsonb) into result
      from (select id,invoice_number,status,currency,total,amount_due,amount_paid,
        issued_at,due_at,paid_at,stripe_hosted_invoice_url,stripe_invoice_pdf
        from public.invoices where client_account_id=p_account
        order by issued_at desc limit 100) x;
    when 'settings' then
      select to_jsonb(x) into result from (select id,name,phone,website,timezone,
        logo_url,brand,primary_domain,mightycall_number,google_review_link,gbp_url,
        meta_ad_account_id,google_ads_customer_id,
        case when public.auth_role() in ('agency_admin','client_owner') then stripe_customer_id end as stripe_customer_id,
        goal_metric,goal_value,
        launch_date,package,add_ons from public.sub_accounts where id=p_account) x;
  end case;
  return coalesce(result,'[]'::jsonb);
end $$;
revoke all on function public.portal_snapshot(uuid,text) from public, anon;
grant execute on function public.portal_snapshot(uuid,text) to authenticated;

create or replace function public.portal_change_lead(p_account uuid,p_lead uuid,
  p_stage uuid default null,p_notes text default null,p_clear_stage boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare changed public.leads%rowtype;
begin
  if not public.portal_page_allowed('leads') or not public.can_access_account(p_account)
    or public.auth_role() not in ('agency_admin','agency_staff','client_owner') then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if p_stage is null and p_notes is null and not p_clear_stage then
    raise exception 'No change supplied' using errcode = '22023';
  end if;
  if p_notes is not null and length(p_notes)>10000 then
    raise exception 'Notes too long' using errcode = '22023';
  end if;
  if p_stage is not null and not exists (
    select 1 from public.pipeline_stages s join public.pipelines p on p.id=s.pipeline_id
    where s.id=p_stage and p.client_account_id=p_account) then
    raise exception 'Stage does not belong to this account' using errcode = '22023';
  end if;
  update public.leads set pipeline_stage_id=case when p_clear_stage then null else coalesce(p_stage,pipeline_stage_id) end,
    notes=coalesce(p_notes,notes),updated_at=now(),updated_by=auth.uid()
  where id=p_lead and client_account_id=p_account returning * into changed;
  if changed.id is null then raise exception 'Lead not found' using errcode='02000'; end if;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,
    event_type,action,target,metadata)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    p_account::text,'lead',case when p_stage is not null or p_clear_stage then 'stage_changed' else 'notes_changed' end,
    p_lead::text,jsonb_build_object('stage_id',p_stage));
  return jsonb_build_object('id',changed.id,'pipeline_stage_id',changed.pipeline_stage_id,
    'notes',changed.notes,'updated_at',changed.updated_at);
end $$;
revoke all on function public.portal_change_lead(uuid,uuid,uuid,text,boolean) from public, anon;
grant execute on function public.portal_change_lead(uuid,uuid,uuid,text,boolean) to authenticated;

create or replace function public.portal_billing_customer(p_account uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare customer text;
begin
  if not public.portal_page_allowed('billing') or not public.can_access_account(p_account)
    or public.auth_role() not in ('agency_admin','client_owner') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select stripe_customer_id into customer from public.sub_accounts where id=p_account;
  return customer;
end $$;
revoke all on function public.portal_billing_customer(uuid) from public, anon;
grant execute on function public.portal_billing_customer(uuid) to authenticated;

create or replace function public.portal_ai_context(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare context jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('pages')
    or not public.client_feature_enabled('landing_page_ai') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select jsonb_build_object('name',a.name,'industry',a.industry,'website',a.website,
    'brand',a.brand,'goalMetric',a.goal_metric,'googleReviewLink',a.google_review_link,
    'model',o.settings->>'ai_landing_model') into context
  from public.sub_accounts a join public.organizations o on o.id=a.organization_id
  where a.id=p_account;
  return context;
end $$;
revoke all on function public.portal_ai_context(uuid) from public, anon;
grant execute on function public.portal_ai_context(uuid) to authenticated;

create or replace function public.portal_set_ai_model(p_model text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_agency_admin() or p_model !~ '^[a-zA-Z0-9._:-]+/[a-zA-Z0-9._:-]+$'
    or length(p_model)>150 then
    raise exception 'Access denied or invalid model' using errcode='42501';
  end if;
  update public.organizations set settings=jsonb_set(settings,'{ai_landing_model}',to_jsonb(p_model),true)
  where id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,event_type,action,target)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    'settings','ai_model_changed',p_model);
end $$;
revoke all on function public.portal_set_ai_model(text) from public, anon;
grant execute on function public.portal_set_ai_model(text) to authenticated;

create or replace function public.portal_ai_model() returns text
language plpgsql stable security definer set search_path = '' as $$
declare model text;
begin
  if not public.is_agency_admin() then raise exception 'Access denied' using errcode='42501'; end if;
  select settings->>'ai_landing_model' into model from public.organizations
  where id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid;
  return coalesce(model,'openai/gpt-4o-mini');
end $$;
revoke all on function public.portal_ai_model() from public, anon;
grant execute on function public.portal_ai_model() to authenticated;

create or replace function public.portal_update_account(p_account uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare saved public.sub_accounts%rowtype;
begin
  if not public.is_agency_admin() or not public.can_access_account(p_account)
    or jsonb_typeof(p_data)<>'object'
    or exists(select 1 from jsonb_object_keys(p_data) as k(key) where k.key not in
      ('phone','website','timezone','logo_url','brand','primary_domain','mightycall_number',
       'google_review_link','gbp_url','meta_ad_account_id','google_ads_customer_id',
       'goal_metric','goal_value','launch_date','add_ons','stripe_customer_id')) then
    raise exception 'Access denied or invalid settings' using errcode='42501';
  end if;
  update public.sub_accounts set
    phone=case when p_data ? 'phone' then nullif(p_data->>'phone','') else phone end,
    website=case when p_data ? 'website' then nullif(p_data->>'website','') else website end,
    timezone=case when p_data ? 'timezone' then p_data->>'timezone' else timezone end,
    logo_url=case when p_data ? 'logo_url' then nullif(p_data->>'logo_url','') else logo_url end,
    brand=case when p_data ? 'brand' then p_data->'brand' else brand end,
    primary_domain=case when p_data ? 'primary_domain' then nullif(p_data->>'primary_domain','') else primary_domain end,
    mightycall_number=case when p_data ? 'mightycall_number' then nullif(p_data->>'mightycall_number','') else mightycall_number end,
    google_review_link=case when p_data ? 'google_review_link' then nullif(p_data->>'google_review_link','') else google_review_link end,
    gbp_url=case when p_data ? 'gbp_url' then nullif(p_data->>'gbp_url','') else gbp_url end,
    meta_ad_account_id=case when p_data ? 'meta_ad_account_id' then nullif(p_data->>'meta_ad_account_id','') else meta_ad_account_id end,
    google_ads_customer_id=case when p_data ? 'google_ads_customer_id' then nullif(p_data->>'google_ads_customer_id','') else google_ads_customer_id end,
    stripe_customer_id=case when p_data ? 'stripe_customer_id' then nullif(p_data->>'stripe_customer_id','') else stripe_customer_id end,
    goal_metric=case when p_data ? 'goal_metric' then nullif(p_data->>'goal_metric','') else goal_metric end,
    goal_value=case when p_data ? 'goal_value' then (p_data->>'goal_value')::integer else goal_value end,
    launch_date=case when p_data ? 'launch_date' then (p_data->>'launch_date')::date else launch_date end,
    add_ons=case when p_data ? 'add_ons' then array(select jsonb_array_elements_text(p_data->'add_ons')) else add_ons end,
    updated_at=now()
  where id=p_account returning * into saved;
  if saved.id is null then raise exception 'Account not found' using errcode='02000'; end if;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,
    event_type,action,target,metadata)
  values(auth.uid(),auth.jwt()->>'email',saved.organization_id::text,p_account::text,
    'settings','account_updated',p_account::text,p_data);
  return to_jsonb(saved)-'stripe_customer_id'-'settings';
end $$;
revoke all on function public.portal_update_account(uuid,jsonb) from public, anon;
grant execute on function public.portal_update_account(uuid,jsonb) to authenticated;

create or replace function public.portal_log(p_account uuid,p_action text,p_target text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_action not in ('impersonation_started','impersonation_ended','exported','billing_portal_opened','account_switched')
    or (p_account is not null and not public.can_access_account(p_account))
    or not public.client_feature_enabled('client_portal') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,
    event_type,action,target)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    p_account::text,'portal',p_action,p_target);
end $$;
revoke all on function public.portal_log(uuid,text,text) from public, anon;
grant execute on function public.portal_log(uuid,text,text) to authenticated;

create or replace function public.portal_features() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_agency_admin() then raise exception 'Access denied' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.feature_key,x.user_id),'[]'::jsonb) into result
  from (select feature_key,user_id,enabled from public.user_feature_access
    where org_id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid
      and feature_key in ('client_portal','client_accounts','landing_page_builder','landing_page_ai','delivery_automation')) x;
  return result;
end $$;
revoke all on function public.portal_features() from public, anon;
grant execute on function public.portal_features() to authenticated;

create or replace function public.portal_set_feature(p_feature text,p_enabled boolean,p_user uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_agency_admin() or p_feature not in
    ('client_portal','client_accounts','landing_page_builder','landing_page_ai','delivery_automation') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if p_user is null then
    insert into public.user_feature_access(org_id,user_id,feature_key,enabled)
    values('cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid,null,p_feature,p_enabled)
    on conflict (org_id,feature_key) where user_id is null do update
      set enabled=excluded.enabled,updated_at=now();
  else
    insert into public.user_feature_access(org_id,user_id,feature_key,enabled)
    values('cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid,p_user,p_feature,p_enabled)
    on conflict (org_id,user_id,feature_key) do update
      set enabled=excluded.enabled,updated_at=now();
  end if;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,event_type,action,target,metadata)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    'settings','feature_flag_changed',p_feature,jsonb_build_object('enabled',p_enabled,'user_id',p_user));
end $$;
revoke all on function public.portal_set_feature(text,boolean,uuid) from public, anon;
grant execute on function public.portal_set_feature(text,boolean,uuid) to authenticated;

create or replace function public.portal_staff(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_agency_admin() or not public.can_access_account(p_account) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) into result
  from (select coalesce(t.user_id,t.auth_user_id::uuid) as user_id,t.name,t.email,
    a.role_in_account from public.team_members t
    left join public.sub_account_assignments a on a.user_id=coalesce(t.user_id,t.auth_user_id::uuid)
      and a.sub_account_id=p_account
    where t.org_id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid
      and t.role in ('member','viewer','agent','agency_staff') and t.status='active'
      and (t.user_id is not null or t.auth_user_id is not null)) x;
  return result;
end $$;
revoke all on function public.portal_staff(uuid) from public, anon;
grant execute on function public.portal_staff(uuid) to authenticated;

create or replace function public.portal_assign_staff(p_account uuid,p_user uuid,p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_agency_admin() or not public.can_access_account(p_account) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if not exists(select 1 from public.team_members t where t.org_id=
    'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid and t.role in ('member','viewer','agent','agency_staff')
    and (t.user_id=p_user or t.auth_user_id=p_user::text) and t.status='active') then
    raise exception 'Active agency staff member not found' using errcode='22023';
  end if;
  if p_role is null then
    delete from public.sub_account_assignments where sub_account_id=p_account and user_id=p_user;
  elsif p_role in ('account_manager','marketing','ads','agent_lead','agent') then
    insert into public.sub_account_assignments(sub_account_id,user_id,role_in_account)
    values(p_account,p_user,p_role) on conflict(sub_account_id,user_id) do update
      set role_in_account=excluded.role_in_account;
  else raise exception 'Invalid assignment role' using errcode='22023'; end if;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,
    event_type,action,target,metadata) values(auth.uid(),auth.jwt()->>'email',
    'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',p_account::text,'settings','staff_assignment_changed',
    p_user::text,jsonb_build_object('role',p_role));
end $$;
revoke all on function public.portal_assign_staff(uuid,uuid,text) from public, anon;
grant execute on function public.portal_assign_staff(uuid,uuid,text) to authenticated;

create or replace function public.portal_invite_client_staff(p_account uuid,p_email text,p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare member uuid; code text;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('settings')
    or public.auth_role() not in ('agency_admin','client_owner') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(trim(p_name))<1 then
    raise exception 'Name and email are required' using errcode='22023';
  end if;
  if exists(select 1 from public.team_members where client_account_id=p_account
    and lower(email)=lower(p_email) and status<>'inactive') then
    raise exception 'User already belongs to this account' using errcode='23505';
  end if;
  insert into public.team_members(org_id,client_account_id,role,name,email,status,is_active,page_permissions)
  values('cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid,p_account,'client_staff',
    trim(p_name),lower(p_email),'invited',true,'["dashboard","leads","calls"]'::jsonb)
  returning id into member;
  code:=encode(extensions.gen_random_bytes(16),'hex');
  insert into public.invite_codes(code_hash,email,name,role,team_member_id,client_account_id,
    org_id,expires_at,created_by)
  values(encode(extensions.digest(code,'sha256'),'hex'),lower(p_email),trim(p_name),'client_staff',member,
    p_account,'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid,now()+interval '7 days','client_portal');
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,
    event_type,action,target) values(auth.uid(),auth.jwt()->>'email',
    'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',p_account::text,'invite','client_staff_invited',lower(p_email));
  return code;
end $$;
revoke all on function public.portal_invite_client_staff(uuid,text,text) from public, anon;
grant execute on function public.portal_invite_client_staff(uuid,text,text) to authenticated;

create or replace function public.portal_save_page(p_account uuid,p_page uuid,p_title text,
  p_slug text,p_sections jsonb,p_theme jsonb,p_seo_description text,p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.marketing_landing_pages%rowtype;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('pages')
    or public.auth_role() not in ('agency_admin','agency_staff','client_owner') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if length(p_title) not between 1 and 180 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(p_slug)>100 or jsonb_typeof(p_sections)<>'array'
    or jsonb_array_length(p_sections)>40 or jsonb_typeof(p_theme)<>'object'
    or p_status not in ('draft','published') then
    raise exception 'Invalid page' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_sections) as section(value)
    where section.value->>'type'='form' and nullif(section.value->>'formId','') is not null
      and not exists(select 1 from public.forms f
        where f.id::text=section.value->>'formId' and f.client_account_id=p_account)) then
    raise exception 'Form does not belong to this account' using errcode='22023';
  end if;
  if p_page is null then
    insert into public.marketing_landing_pages(client_account_id,organization_id,title,slug,
      sections,theme,seo_description,status)
    select p_account,a.organization_id,p_title,p_slug,p_sections,p_theme,
      left(coalesce(p_seo_description,''),320),p_status from public.sub_accounts a where a.id=p_account
    returning * into saved;
  else
    update public.marketing_landing_pages set title=p_title,slug=p_slug,sections=p_sections,
      theme=p_theme,seo_description=left(coalesce(p_seo_description,''),320),
      status=p_status,updated_at=now()
    where id=p_page and client_account_id=p_account returning * into saved;
  end if;
  if saved.id is null then raise exception 'Page not found' using errcode='02000'; end if;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,
    event_type,action,target)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    p_account::text,'page','saved',saved.id::text);
  return to_jsonb(saved);
end $$;
revoke all on function public.portal_save_page(uuid,uuid,text,text,jsonb,jsonb,text,text) from public, anon;
grant execute on function public.portal_save_page(uuid,uuid,text,text,jsonb,jsonb,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
