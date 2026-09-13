begin;
create function public.outreach_email_conversation(p_lead text,p_scope text default null) returns jsonb language sql stable as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',j.id::text,'leadId',j.lead_id::text,'subject',j.subject,'body',j.body,'status',j.state,
  'createdAt',j.created_at,'sentAt',j.sent_at,'fromEmail',m.from_email,'failureReason',j.failure_reason
 ) order by j.created_at),'[]'::jsonb)
 from public.outreach_email_jobs j
 join public.leads l on l.id=j.lead_id
 left join public.email_accounts m on m.id=j.mailbox_id
 where j.lead_id::text=p_lead and (p_scope is null or l.client_account_id::text=p_scope)
$$;
revoke all on function public.outreach_email_conversation(text,text) from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke all on function public.outreach_email_conversation(text,text) from anon;end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on function public.outreach_email_conversation(text,text) from authenticated;end if;
 if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.outreach_email_conversation(text,text) to service_role;end if;
end $$;
commit;
