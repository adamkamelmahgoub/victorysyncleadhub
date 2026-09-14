begin;
alter table public.email_accounts add column if not exists signature text;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.email_accounts'::regclass and conname='outreach_mailbox_signature_plain_text') then
  alter table public.email_accounts add constraint outreach_mailbox_signature_plain_text check(length(signature)<=5000 and signature!~'<[A-Za-z/][^>]*>');
 end if;
end $$;
create or replace function public.outreach_email_signature(p_mailbox text,p_signature text,p_actor text default 'operator') returns jsonb language plpgsql as $$
declare result jsonb;begin
 if length(coalesce(p_signature,''))>5000 or coalesce(p_signature,'')~'<[A-Za-z/][^>]*>' then raise exception 'Use a plain text signature of at most 5,000 characters';end if;
 update public.email_accounts set signature=nullif(trim(p_signature),'') where id::text=p_mailbox returning jsonb_build_object('id',id,'saved',true) into result;
 if result is null then raise exception 'Mailbox not found';end if;
 insert into public.outreach_audit(actor,reason,details) values(p_actor,'mailbox_signature_updated',jsonb_build_object('mailbox_id',p_mailbox));return result;
end $$;
revoke all on function public.outreach_email_signature(text,text,text) from public;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.outreach_email_signature(text,text,text) to service_role;end if;end $$;
commit;
