begin;
drop function if exists public.outreach_campaign_launch(text,text,text);
drop function if exists public.outreach_sent_emails(text,text,int,int);
drop index if exists public.outreach_email_sent_at_idx;
drop index if exists public.outreach_one_job_per_campaign_lead;
alter table public.outreach_email_jobs drop column if exists campaign_id;
commit;
