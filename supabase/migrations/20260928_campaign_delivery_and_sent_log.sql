begin;

alter table public.outreach_email_jobs add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
create unique index if not exists outreach_one_job_per_campaign_lead on public.outreach_email_jobs(campaign_id,lead_id) where campaign_id is not null;
create index if not exists outreach_email_sent_at_idx on public.outreach_email_jobs(sent_at desc) where state='sent';

create or replace function public.outreach_sent_emails(p_scope text default null,p_query text default null,p_limit int default 100,p_offset int default 0)
returns jsonb language sql stable as $$
 with matching as (
  select j.*,m.from_email,l.first_name,l.last_name,l.company,c.name campaign_name
  from public.outreach_email_jobs j
  join public.email_accounts m on m.id=j.mailbox_id
  left join public.leads l on l.id=j.lead_id
  left join public.campaigns c on c.id=j.campaign_id
  where j.state='sent' and (p_scope is null or l.client_account_id::text=p_scope)
   and (coalesce(trim(p_query),'')='' or concat_ws(' ',j.to_email,j.subject,m.from_email,l.first_name,l.last_name,l.company,c.name) ilike '%'||trim(p_query)||'%')
 ), total as (select count(*) n from matching)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',x.id,'leadId',x.lead_id,'recipientEmail',x.to_email,'recipientName',trim(concat_ws(' ',x.first_name,x.last_name)),
  'company',x.company,'fromEmail',x.from_email,'subject',x.subject,'body',x.body,'sentAt',x.sent_at,
  'campaignId',x.campaign_id,'campaignName',x.campaign_name,'providerMessageId',x.provider_message_id
 ) order by x.sent_at desc,x.id) from (select * from matching order by sent_at desc,id limit greatest(1,least(p_limit,250)) offset greatest(p_offset,0)) x),'[]'::jsonb),'total',(select n from total));
$$;

create or replace function public.outreach_campaign_launch(p_campaign text,p_actor text,p_scope text default null)
returns jsonb language plpgsql as $$
declare c public.campaigns;l public.leads;m public.email_accounts;j public.outreach_email_jobs;r record;
 token text;hash text;subject_text text;body_text text;queued int:=0;skipped int:=0;already_queued int:=0;spacing numeric;
begin
 perform pg_advisory_xact_lock(8675310);
 select * into c from public.campaigns where id::text=p_campaign;
 if not found then raise exception 'Campaign not found';end if;
 if p_scope is not null and not exists(select 1 from public.campaign_leads cl join public.leads sl on sl.id=cl.lead_id where cl.campaign_id=c.id and sl.client_account_id::text=p_scope) then raise exception 'Campaign not found';end if;
 if coalesce(trim(c.subject),'')='' or coalesce(trim(c.body),'')='' then raise exception 'Add a subject and email body before launching';end if;
 if c.subject ~ '[\r\n]' or c.body ~ '<[A-Za-z/][^>]*>' then raise exception 'Campaign email must be plain text';end if;
 if coalesce(trim(c.from_email),'')<>'' then
  select * into m from public.email_accounts where lower(from_email)=lower(c.from_email) and status in ('warming','active') and email_engine_enabled order by created_at limit 1;
  if not found then raise exception 'The campaign sending mailbox is not enabled';end if;
 end if;
 spacing:=3600.0/greatest(1,least(coalesce(c.send_rate_per_hour,20),200));
 for r in select cl.lead_id from public.campaign_leads cl where cl.campaign_id=c.id order by cl.created_at,cl.lead_id loop
  if exists(select 1 from public.outreach_email_jobs where campaign_id=c.id and lead_id=r.lead_id) then already_queued:=already_queued+1;continue;end if;
  select * into l from public.outreach_eligible_leads where id=r.lead_id and (p_scope is null or client_account_id::text=p_scope);
  if not found or l.normalized_email is null or not l.timezone_confirmed or l.disposition in ('meeting_booked','not_interested','wrong_number','dnc') then skipped:=skipped+1;continue;end if;
  if coalesce(trim(c.from_email),'')='' then
   select * into m from public.email_accounts where id::text=public.outreach_choose_mailbox();
   if not found then raise exception 'No enabled mailbox capacity is available';end if;
  end if;
  subject_text:=replace(replace(replace(replace(c.subject,'{{firstName}}',coalesce(l.first_name,'')),'{{first_name}}',coalesce(l.first_name,'')),'{{company}}',coalesce(l.company,'')),'{{city}}',coalesce(l.city,''));
  body_text:=replace(replace(replace(replace(c.body,'{{firstName}}',coalesce(l.first_name,'')),'{{first_name}}',coalesce(l.first_name,'')),'{{company}}',coalesce(l.company,'')),'{{city}}',coalesce(l.city,''));
  token:=replace(translate(encode(digest(gen_random_uuid()::text||gen_random_uuid()::text,'sha256'),'base64'),'+/','-_'),'=','');hash:=encode(digest(token,'sha256'),'hex');
  insert into public.outreach_email_jobs(lead_id,mailbox_id,to_email,phone_snapshot,subject,body,not_before,unsubscribe_token,unsubscribe_hash,operator_verification_override,campaign_id)
  values(l.id,m.id,l.normalized_email,l.normalized_phone,subject_text,body_text,public.outreach_email_next_slot(now()+(queued*spacing||' seconds')::interval,l.timezone::text),token,hash,true,c.id) returning * into j;
  update public.campaign_leads set status='queued' where campaign_id=c.id and lead_id=l.id;
  insert into public.outreach_audit(lead_id,actor,reason,details) values(l.id::text,p_actor,'campaign_email_queued',jsonb_build_object('job_id',j.id,'campaign_id',c.id,'mailbox_id',m.id));
  queued:=queued+1;
 end loop;
 update public.campaigns set status='active',launched_at=coalesce(launched_at,now()),updated_at=now() where id=c.id;
 return jsonb_build_object('campaignId',c.id,'queued',queued,'skipped',skipped,'alreadyQueued',already_queued,'status','active');
end $$;

revoke all on function public.outreach_sent_emails(text,text,int,int) from public;
revoke all on function public.outreach_campaign_launch(text,text,text) from public;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.outreach_sent_emails(text,text,int,int) to service_role;grant execute on function public.outreach_campaign_launch(text,text,text) to service_role;end if;end $$;
commit;
