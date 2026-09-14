begin;
drop function if exists public.outreach_mailbox_manage(text,text,jsonb,text);
alter table public.sequence_steps drop constraint if exists sequence_steps_channel_check;
alter table public.sequence_steps add constraint sequence_steps_channel_check check(channel in ('email','call_task'));
alter table public.sequences drop column if exists label;
drop view if exists public.outreach_mailbox_health;
alter table public.email_accounts drop column if exists archived_at,drop column if exists warmup_daily_cap,drop column if exists label;
commit;
