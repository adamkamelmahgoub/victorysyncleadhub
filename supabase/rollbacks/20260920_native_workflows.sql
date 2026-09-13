begin;
drop trigger if exists outreach_native_workflow_lead on public.leads;
drop trigger if exists outreach_native_workflow_activity on public.outreach_audit;
drop trigger if exists outreach_native_workflow_reply on public.outreach_inbound_messages;
drop function if exists public.outreach_workflow_lead_trigger(),public.outreach_workflow_activity_trigger(),public.outreach_workflow_reply_trigger(),public.outreach_workflow_start(text,text,text,jsonb),public.outreach_workflow_admin(text,jsonb,text);
drop table if exists public.outreach_workflow_logs,public.outreach_workflow_runs;
notify pgrst,'reload schema';
commit;
