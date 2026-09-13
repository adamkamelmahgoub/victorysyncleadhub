begin;
create function public.outreach_email_domain_create(p_data jsonb,p_actor text default 'operator') returns jsonb language plpgsql as $$
declare existing public.sending_domains; result jsonb; name text:=lower(trim(p_data->>'domain'));
begin
 perform pg_advisory_xact_lock(8675309);
 perform set_config('outreach.email_actor',p_actor,true);
 if name is null or name!~'^[a-z0-9][a-z0-9.-]*\.[a-z0-9-]+$' then raise exception 'Invalid domain';end if;
 select * into existing from public.sending_domains where domain=name for update;
 if found then
  if existing.deleted_at is null then return to_jsonb(existing)||jsonb_build_object('alreadyExists',true);end if;
  if existing.status='burned' then raise exception 'Burned domains cannot be restored';end if;
  -- Restoring a domain never resumes its old mailboxes or sequences.
  update public.email_accounts set email_engine_enabled=false,status=case when status='burned' then status else 'paused'::public.outreach_mailbox_status end where sending_domain_id=existing.id;
  update public.sending_domains set deleted_at=null,spf_verified=false,dkim_verified=false,dmarc_verified=false,verified_at=null,status='warming' where id=existing.id returning to_jsonb(sending_domains.*) into result;
  insert into public.outreach_audit(actor,reason,details) values(p_actor,'domain_restored',jsonb_build_object('domain_id',existing.id));
  return result||jsonb_build_object('restored',true);
 end if;
 return public.outreach_email_admin('domain_create',p_data||jsonb_build_object('domain',name),p_actor,null);
end $$;
revoke all on function public.outreach_email_domain_create(jsonb,text) from public;
do $$ declare role_name text;begin
 foreach role_name in array array['anon','authenticated'] loop
  if exists(select 1 from pg_roles where rolname=role_name) then execute format('revoke all on function public.outreach_email_domain_create(jsonb,text) from %I',role_name);end if;
 end loop;
 if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.outreach_email_domain_create(jsonb,text) to service_role;end if;
end $$;
commit;
