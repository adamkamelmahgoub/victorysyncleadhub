begin;
drop function if exists public.outreach_email_signature(text,text,text);
alter table public.email_accounts drop constraint if exists outreach_mailbox_signature_plain_text;
alter table public.email_accounts drop column if exists signature;
commit;
