begin;
drop trigger if exists outreach_make_lead on public.leads;
drop trigger if exists outreach_make_reply on public.outreach_inbound_messages;
drop trigger if exists outreach_make_audit on public.outreach_audit;
drop function if exists public.outreach_make_capture(),public.outreach_make_admin(text,jsonb,text),public.outreach_make_enqueue(text,jsonb);
drop table if exists public.outreach_make_config,public.outreach_make_events,public.outreach_make_requests;
notify pgrst,'reload schema';
commit;
