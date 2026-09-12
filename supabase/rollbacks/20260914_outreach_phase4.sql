begin;
-- Stop primary and archived senders before reinstating the original prohibition.
select set_config('outreach.email_actor','system',true);
update public.email_accounts set email_engine_enabled=false,status=case when status='burned' then status else 'paused'::public.outreach_mailbox_status end
 where sending_domain_id in(select id from public.sending_domains where is_primary or deleted_at is not null);
drop function public.outreach_email_domain_admin(text,jsonb,text);
drop function public.outreach_email_metrics(text,jsonb,text,text);
do $$ declare r record;begin for r in select definition from public.outreach_phase4_restore loop execute r.definition;end loop;end $$;
drop table public.outreach_phase4_restore;
drop table public.outreach_call_outcomes;
drop index public.outreach_calls_week;
drop index public.outreach_sent_week;
alter table public.outreach_inbound_messages drop column positive_reply;
alter table public.sending_domains drop column allow_primary_sending,drop column deleted_at,drop column spf_host;
commit;
