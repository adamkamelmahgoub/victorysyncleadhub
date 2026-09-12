begin;
create function public.outreach_sequence_choose_mailbox() returns text language plpgsql as $$
#variable_conflict use_column
declare total numeric;chosen text;
begin
 perform pg_advisory_xact_lock(8675309);
 perform public.outreach_email_guardrails();
 select sum(greatest(h.effective_cap-h.sent_today,0)) into total from public.outreach_mailbox_health h join public.email_accounts m on m.id=h.id join public.sending_domains d on d.id=m.sending_domain_id
 where m.status='active' and m.email_engine_enabled and m.inbound_provider<>'disabled' and m.inbox_checked_at>=now()-interval '10 minutes' and not d.is_primary and d.status<>'burned' and d.spf_verified and d.dkim_verified and d.dmarc_verified;
 if coalesce(total,0)=0 then raise exception 'No active mailbox with capacity and a healthy inbox is available';end if;
 update public.email_accounts m set rotation_credit=m.rotation_credit+(h.effective_cap-h.sent_today) from public.outreach_mailbox_health h join public.sending_domains d on d.id=h.sending_domain_id
 where m.id=h.id and m.status='active' and m.email_engine_enabled and m.inbound_provider<>'disabled' and m.inbox_checked_at>=now()-interval '10 minutes' and h.effective_cap>h.sent_today and not d.is_primary and d.status<>'burned' and d.spf_verified and d.dkim_verified and d.dmarc_verified;
 select m.id::text into chosen from public.email_accounts m join public.outreach_mailbox_health h on h.id=m.id join public.sending_domains d on d.id=m.sending_domain_id
 where m.status='active' and m.email_engine_enabled and m.inbound_provider<>'disabled' and m.inbox_checked_at>=now()-interval '10 minutes' and h.effective_cap>h.sent_today and not d.is_primary and d.status<>'burned' and d.spf_verified and d.dkim_verified and d.dmarc_verified order by m.rotation_credit desc,m.id limit 1;
 update public.email_accounts set rotation_credit=rotation_credit-total where id::text=chosen;
 return chosen;
end $$;

create function public.outreach_sequence_admin(p_action text,p_data jsonb default '{}',p_actor text default 'operator',p_scope text default null) returns jsonb language plpgsql as $$
#variable_conflict use_column
declare q public.sequences;e public.sequence_enrollments;l public.leads;m public.email_accounts;s public.sequence_steps;result jsonb;lead_key text;chosen text;n int:=0;step_count int;
begin
 perform pg_advisory_xact_lock(8675309);
 perform set_config('outreach.sequence_actor',p_actor,true);
 if p_action='list' then return coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('total_enrolled',(select count(*) from public.sequence_enrollments where sequence_id=x.id))) from public.sequences x),'[]'::jsonb);
 elsif p_action='get' then
  select * into q from public.sequences where id::text=p_data->>'id';if not found then return null;end if;
  return to_jsonb(q)||jsonb_build_object('steps',coalesce((select jsonb_agg(x order by step_number) from public.sequence_steps x where sequence_id=q.id),'[]'::jsonb),
   'enrollments',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('email',l.email,'company',l.company,'mailbox',m.from_email) order by x.created_at desc) from public.sequence_enrollments x join public.leads l on l.id=x.lead_id left join public.email_accounts m on m.id=x.assigned_mailbox_id where x.sequence_id=q.id and (p_scope is null or l.client_account_id::text=p_scope)),'[]'::jsonb));
 elsif p_action='create' then insert into public.sequences(name,status) values(p_data->>'name','draft') returning to_jsonb(sequences.*) into result;
 elsif p_action in ('update','delete','step_save','step_delete','enroll') then
  select * into q from public.sequences where id::text=p_data->>'id' for update;if not found then raise exception 'Sequence not found';end if;
  if p_action='update' then
   if p_data->>'status'='active' then
    select count(*) into step_count from public.sequence_steps where sequence_id=q.id;
    if step_count=0 or exists(select 1 from public.sequence_steps where sequence_id=q.id and (step_number<1 or step_number>step_count or delay_days<0 or delay_days>365)) or (select count(distinct step_number) from public.sequence_steps where sequence_id=q.id)<>step_count then raise exception 'Steps must be numbered consecutively starting at 1';end if;
   end if;
   update public.sequences set name=coalesce(p_data->>'name',name),status=coalesce(p_data->>'status',status) where id=q.id returning to_jsonb(sequences.*) into result;
  elsif p_action='delete' then
   if exists(select 1 from public.sequence_enrollments where sequence_id=q.id) then raise exception 'Sequences with enrollment history cannot be deleted; pause the sequence';end if;
   delete from public.sequence_steps where sequence_id=q.id;delete from public.sequences where id=q.id;result:='{}';
  elsif p_action in ('step_save','step_delete') then
   if exists(select 1 from public.sequence_enrollments where sequence_id=q.id) then raise exception 'Steps are immutable after enrollment; create a new sequence';end if;
   if p_action='step_delete' then delete from public.sequence_steps where sequence_id=q.id and id::text=p_data->>'stepId';result:='{}';
   elsif p_data->>'stepId' is null then
    insert into public.sequence_steps(sequence_id,step_number,channel,delay_days,subject,body) values(q.id,(p_data->>'stepNumber')::int,p_data->>'channel',(p_data->>'delayDays')::int,coalesce(p_data->>'subject',''),coalesce(p_data->>'body','')) returning to_jsonb(sequence_steps.*) into result;
   else update public.sequence_steps set step_number=(p_data->>'stepNumber')::int,channel=p_data->>'channel',delay_days=(p_data->>'delayDays')::int,subject=coalesce(p_data->>'subject',''),body=coalesce(p_data->>'body','') where sequence_id=q.id and id::text=p_data->>'stepId' returning to_jsonb(sequence_steps.*) into result;end if;
  else
   if q.status<>'active' then raise exception 'Activate the sequence before enrollment';end if;
   select * into s from public.sequence_steps where sequence_id=q.id order by step_number limit 1;if not found then raise exception 'Sequence needs steps';end if;
   for lead_key in select jsonb_array_elements_text(p_data->'leadIds') loop
    select * into l from public.outreach_eligible_leads where id::text=lead_key and (p_scope is null or client_account_id::text=p_scope);
    if not found then raise exception 'Eligible lead not found';end if;
    if exists(select 1 from public.sequence_enrollments where lead_id=l.id and sequence_id=q.id and status in ('active','paused')) then continue;end if;
    chosen:=public.outreach_sequence_choose_mailbox();select * into m from public.email_accounts where id::text=chosen;
    insert into public.sequence_enrollments(sequence_id,lead_id,assigned_mailbox_id,current_step,status,next_send_at) values(q.id,l.id,m.id,s.step_number,'active',now()+make_interval(hours=>s.delay_days*24)) returning * into e;
    insert into public.outreach_audit(lead_id,actor,reason,details) values(l.id::text,'system','sequence_mailbox_assigned',jsonb_build_object('enrollment_id',e.id,'mailbox_id',m.id));n:=n+1;
   end loop;
   result:=jsonb_build_object('enrolled',n);
  end if;
 elsif p_action='stop' then
  update public.sequence_enrollments e set status='stopped',stopped_reason='operator',next_send_at=null,resume_at=null where e.id::text=p_data->>'id' and status in ('active','paused') and exists(select 1 from public.leads l where l.id=e.lead_id and (p_scope is null or l.client_account_id::text=p_scope)) returning to_jsonb(e.*) into result;
 elsif p_action='inboxes' then return coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',from_email,'provider',inbound_provider,'checked_at',inbox_checked_at,'poll_after',inbox_poll_after)) from public.email_accounts),'[]'::jsonb);
 elsif p_action='inbox_secret' then select to_jsonb(x) into result from public.email_accounts x where id::text=p_data->>'id';return result;
 elsif p_action='reply_timezone' then
  select to_jsonb(timezone::text) into result from public.leads where normalized_email=public.outreach_email(p_data->>'email') and timezone_confirmed order by created_at limit 1;return result;
 elsif p_action='inbox_configure' then
  update public.email_accounts set inbound_provider=p_data->>'provider',inbound_credentials=p_data->>'credentials',inbox_configured_at=coalesce(inbox_configured_at,now()),inbox_checked_at=null,inbox_cursor='{}',inbox_poll_after=now(),inbox_poll_token=null,inbox_locked_at=null where id::text=p_data->>'id' returning jsonb_build_object('id',id,'provider',inbound_provider) into result;
 elsif p_action='inbox_claim' then
  select * into m from public.email_accounts where inbound_provider<>'disabled' and inbox_poll_after<=now() and (inbox_locked_at is null or inbox_locked_at<now()-interval '2 minutes') order by inbox_poll_after,id limit 1 for update;
  if not found then return null;end if;
  update public.email_accounts set inbox_poll_token=gen_random_uuid(),inbox_locked_at=now() where id=m.id returning to_jsonb(email_accounts.*) into result;return result;
 elsif p_action='inbox_finish' then
  update public.email_accounts set inbox_cursor=case when p_data->>'ok'='true' then p_data->'cursor' else inbox_cursor end,
   inbox_checked_at=case when p_data->>'ok'='true' and p_data->>'caughtUp'='true' then now() else null end,
   inbox_poll_after=case when p_data->>'ok'='true' and p_data->>'caughtUp'='false' then now() else now()+interval '5 minutes' end,
   inbox_poll_token=null,inbox_locked_at=null
  where id::text=p_data->>'id' and inbox_poll_token::text=p_data->>'token' returning jsonb_build_object('id',id,'checked_at',inbox_checked_at) into result;
  if result is null then raise exception 'Inbox polling lease expired';end if;
  if p_data->>'ok'<>'true' then insert into public.outreach_email_alerts(mailbox_id,reason) values(p_data->>'id','reply_poll_failed') on conflict do nothing;end if;
 else raise exception 'Unsupported sequence operation';end if;
 insert into public.outreach_audit(actor,reason,details) values(p_actor,'sequence_admin_'||p_action,jsonb_build_object('id',coalesce(result->>'id',p_data->>'id')));
 return result;
end $$;

-- New data, helper functions and dispatch wrappers are accessible only to the server.
do $$ declare t text;f record;r text;begin
 foreach t in array array['outreach_phase3_restore','outreach_phase3_legacy_enrollments','outreach_phase3_seed','outreach_inbound_messages'] loop
 execute format('alter table public.%I enable row level security',t);
 if exists(select 1 from pg_roles where rolname='service_role') then execute format('grant select,insert,update,delete on public.%I to service_role',t);end if;
 end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'outreach_sequence_%' or p.proname in ('outreach_email_claim','outreach_email_dispatch_check','outreach_email_finish','outreach_log_call')) loop
 execute format('revoke all on function %s from public',f.sig);
 foreach r in array array['anon','authenticated'] loop if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on function %s from %I',f.sig,r);end if;end loop;
 if exists(select 1 from pg_roles where rolname='service_role') then execute format('grant execute on function %s to service_role',f.sig);end if;
 end loop;
end $$;
commit;
