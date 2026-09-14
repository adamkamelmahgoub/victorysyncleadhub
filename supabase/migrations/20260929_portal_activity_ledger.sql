begin;
create table if not exists public.portal_activity_log(
 id bigint generated always as identity primary key,
 actor_id uuid,
 actor_email text,
 actor_name text,
 organization_id text,
 client_account_id text,
 session_id text,
 event_type text not null,
 action text not null,
 page_path text,
 target text,
 request_method text,
 request_status integer,
 ip_address text,
 user_agent text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists portal_activity_created_idx on public.portal_activity_log(created_at desc);
create index if not exists portal_activity_actor_idx on public.portal_activity_log(actor_id,created_at desc);
create index if not exists portal_activity_org_idx on public.portal_activity_log(organization_id,created_at desc);
alter table public.portal_activity_log enable row level security;

create or replace function public.portal_activity_list(p_query text default null,p_event_type text default null,p_limit int default 100,p_offset int default 0,p_org text default null)
returns jsonb language sql stable as $$
 with events as (
  select 'portal'::text source,id::text id,created_at,coalesce(actor_email,actor_name,actor_id::text,'system') actor,event_type,action,page_path,target,request_method,request_status,metadata
  from public.portal_activity_log
  where (p_org is null or organization_id=p_org) and (coalesce(p_event_type,'')='' or event_type=p_event_type)
  union all
  select 'system',id::text,created_at,actor,'audit',reason,null,lead_id,null,null,details
  from public.outreach_audit where p_org is null and (coalesce(p_event_type,'')='' or p_event_type='audit')
 ), filtered as (
  select * from events where coalesce(trim(p_query),'')='' or concat_ws(' ',actor,event_type,action,page_path,target,metadata::text) ilike '%'||trim(p_query)||'%'
 ), total as (select count(*) n from filtered)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from (select * from filtered order by created_at desc,id desc limit greatest(1,least(p_limit,250)) offset greatest(0,p_offset)) x),'[]'::jsonb),'total',(select n from total));
$$;
revoke all on function public.portal_activity_list(text,text,int,int,text) from public;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant select,insert on public.portal_activity_log to service_role;grant usage,select on sequence public.portal_activity_log_id_seq to service_role;grant execute on function public.portal_activity_list(text,text,int,int,text) to service_role;end if;end $$;
commit;
