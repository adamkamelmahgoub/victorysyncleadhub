begin;
drop function if exists public.portal_activity_list(text,text,int,int,text);
drop table if exists public.portal_activity_log;
commit;
