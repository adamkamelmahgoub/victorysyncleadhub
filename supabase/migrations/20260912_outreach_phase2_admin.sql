begin;
create function public.outreach_email_admin(p_action text,p_data jsonb default '{}',p_actor text default 'operator',p_scope text default null) returns jsonb language plpgsql as $$
declare d public.sending_domains;m public.email_accounts;l public.leads;result jsonb;s public.outreach_email_settings;
begin
 perform pg_advisory_xact_lock(8675309);
 perform set_config('outreach.email_actor',p_actor,true);
 if p_action='dashboard' then
  return jsonb_build_object('settings',(select to_jsonb(x) from public.outreach_email_settings x),'domains',coalesce((select jsonb_agg(x order by domain) from public.sending_domains x),'[]'::jsonb),'mailboxes',coalesce((select jsonb_agg(x order by created_at) from public.outreach_mailbox_health x),'[]'::jsonb),'alerts',coalesce((select jsonb_agg(x order by created_at desc) from public.outreach_email_alerts x where acknowledged_at is null),'[]'::jsonb));
 elsif p_action='settings' then
  select * into s from public.outreach_email_settings;
  if p_data ? 'resetTimezone' and p_data->>'resetTimezone'<>s.reset_timezone and exists(select 1 from public.outreach_email_jobs where dispatched_at is not null) then raise exception 'Global reset timezone is immutable after first dispatch';end if;
  if p_data ? 'resetTimezone' and not exists(select 1 from pg_timezone_names where name=p_data->>'resetTimezone') then raise exception 'Invalid reset timezone';end if;
  update public.outreach_email_settings set engine_enabled=coalesce((p_data->>'engineEnabled')::boolean,engine_enabled),global_daily_cap=coalesce((p_data->>'globalDailyCap')::int,global_daily_cap),reset_timezone=coalesce(p_data->>'resetTimezone',reset_timezone),
   primary_domains=case when p_data?'primaryDomains' then array(select lower(jsonb_array_elements_text(p_data->'primaryDomains'))) else primary_domains end,
   direct_link_domains=case when p_data?'directLinkDomains' then array(select lower(jsonb_array_elements_text(p_data->'directLinkDomains'))) else direct_link_domains end returning to_jsonb(outreach_email_settings.*) into result;
  update public.sending_domains set is_primary=true where not is_primary and exists(select 1 from public.outreach_email_settings x,unnest(x.primary_domains) p where domain=p or domain like '%.'||p);
 elsif p_action='domain_create' then
  insert into public.sending_domains(domain,is_primary,dkim_selector) values(lower(p_data->>'domain'),coalesce((p_data->>'isPrimary')::boolean,false),coalesce(p_data->>'dkimSelector','default')) returning to_jsonb(sending_domains.*) into result;
 elsif p_action='domain_get' then select to_jsonb(x) into result from public.sending_domains x where id::text=p_data->>'id';
 elsif p_action='domain_verify' then
  update public.sending_domains set spf_verified=(p_data->>'spf')::boolean,dkim_verified=(p_data->>'dkim')::boolean,dmarc_verified=(p_data->>'dmarc')::boolean,verified_at=now(),status=case when status='burned' then status when (p_data->>'spf')::boolean and (p_data->>'dkim')::boolean and (p_data->>'dmarc')::boolean then 'active'::public.outreach_domain_status else 'warming'::public.outreach_domain_status end where id::text=p_data->>'id' returning to_jsonb(sending_domains.*) into result;
 elsif p_action='mailbox_create' then
  insert into public.email_accounts(from_name,from_email,smtp_host,smtp_port,smtp_user,smtp_password,sending_domain_id,provider,daily_cap,mailbox_timezone)
   values(p_data->>'fromName',lower(p_data->>'fromEmail'),coalesce(p_data->>'smtpHost',''),coalesce((p_data->>'smtpPort')::int,587),coalesce(p_data->>'smtpUser',''),p_data->>'encryptedCredentials',(p_data->>'domainId')::uuid,p_data->>'provider',coalesce((p_data->>'dailyCap')::int,30),coalesce(p_data->>'timezone','America/New_York')) returning * into m;
  select to_jsonb(x) into result from public.outreach_mailbox_health x where id=m.id;
 elsif p_action='mailbox_update' then
  update public.email_accounts set status=coalesce((p_data->>'status')::public.outreach_mailbox_status,status),email_engine_enabled=coalesce((p_data->>'engineEnabled')::boolean,email_engine_enabled),daily_cap=coalesce((p_data->>'dailyCap')::int,daily_cap),smtp_password=coalesce(p_data->>'encryptedCredentials',smtp_password) where id::text=p_data->>'id' returning * into m;
  select to_jsonb(x) into result from public.outreach_mailbox_health x where id=m.id;
 elsif p_action='mailbox_secret' then select to_jsonb(x) into result from public.email_accounts x where id::text=p_data->>'id';return result;
 elsif p_action='lead' then select to_jsonb(x) into result from public.outreach_eligible_leads x where id::text=p_data->>'id' and (p_scope is null or client_account_id::text=p_scope);return result;
 elsif p_action='verification' then
  update public.leads set email_verification_status=(p_data->>'status')::public.outreach_verification_status,verified_email=p_data->>'email',verified_at=now() where id::text=p_data->>'id' and normalized_email=p_data->>'email' and (p_scope is null or client_account_id::text=p_scope) returning jsonb_build_object('status',email_verification_status,'verifiedAt',verified_at) into result;
  if result is null then raise exception 'Lead email changed during verification';end if;
  insert into public.outreach_audit(lead_id,actor,reason,details) values(p_data->>'id','system','email_verified',jsonb_build_object('status',p_data->>'status','provider',p_data->>'provider'));
  return result;
 elsif p_action='acknowledge' then update public.outreach_email_alerts set acknowledged_at=now() where id=(p_data->>'id')::bigint;return '{}'::jsonb;
 else raise exception 'Unsupported email admin action';end if;
 insert into public.outreach_audit(actor,reason,details) values(p_actor,'email_admin_'||p_action,jsonb_build_object('id',coalesce(result->>'id',p_data->>'id')));
 return result;
end $$;
revoke all on function public.outreach_email_admin(text,jsonb,text,text) from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke all on function public.outreach_email_admin(text,jsonb,text,text) from anon;end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on function public.outreach_email_admin(text,jsonb,text,text) from authenticated;end if;
 if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.outreach_email_admin(text,jsonb,text,text) to service_role;end if;
end $$;
commit;
