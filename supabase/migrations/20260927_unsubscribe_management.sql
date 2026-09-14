begin;
do $$ declare definition text;changed text;begin
 select pg_get_functiondef('public.outreach_lead_guard()'::regprocedure) into definition;
 if position('outreach.resubscribe' in definition)=0 then
  changed:=replace(definition,
   'if old.dnc and not new.dnc or old.suppressed_reason is not null and new.suppressed_reason is distinct from old.suppressed_reason then',
   'if coalesce(current_setting(''outreach.resubscribe'',true),'''')<>''yes'' and (old.dnc and not new.dnc or old.suppressed_reason is not null and new.suppressed_reason is distinct from old.suppressed_reason) then');
  if changed=definition then raise exception 'Unable to install consent restoration guard';end if;execute changed;
 end if;
 select pg_get_functiondef('public.outreach_suppression_guard()'::regprocedure) into definition;
 if position('outreach.resubscribe' in definition)=0 then
  changed:=replace(definition,
   'if tg_op <> ''INSERT'' then raise exception ''Suppression registry is append only''; end if;',
   'if tg_op <> ''INSERT'' and coalesce(current_setting(''outreach.resubscribe'',true),'''')<>''yes'' then raise exception ''Suppression registry is append only''; end if; if tg_op=''DELETE'' then return old; end if;');
  if changed=definition then raise exception 'Unable to install suppression restoration guard';end if;execute changed;
 end if;
end $$;

create or replace function public.outreach_unsubscribe_admin(p_action text,p_data jsonb default '{}',p_actor text default 'operator',p_scope text default null) returns jsonb language plpgsql as $$
declare lead_row public.leads;result jsonb;
begin
 perform pg_advisory_xact_lock(8675309);
 if p_action='list' then
  return coalesce((select jsonb_agg(x order by x.unsubscribed_at desc) from (
   select l.id::text lead_id,l.first_name,l.last_name,l.email,l.company,max(s.created_at) unsubscribed_at
   from public.leads l join public.outreach_suppressions s on s.reason='unsubscribed' and ((s.identity_type='email' and s.identity_value=l.normalized_email) or (s.identity_type='phone' and s.identity_value=l.normalized_phone))
   where l.suppressed_reason='unsubscribed' and not l.dnc and (p_scope is null or l.client_account_id::text=p_scope)
   group by l.id,l.first_name,l.last_name,l.email,l.company)x),'[]'::jsonb);
 elsif p_action='reenroll' then
  select * into lead_row from public.leads where id::text=p_data->>'leadId' and suppressed_reason='unsubscribed' and not dnc and (p_scope is null or client_account_id::text=p_scope) for update;
  if not found then raise exception 'Restorable unsubscribed contact not found';end if;
  perform set_config('outreach.resubscribe','yes',true);
  delete from public.outreach_suppressions where reason='unsubscribed' and ((identity_type='email' and identity_value=lead_row.normalized_email) or (identity_type='phone' and identity_value=lead_row.normalized_phone));
  update public.leads set suppressed_reason=null where id=lead_row.id;
  insert into public.outreach_audit(lead_id,actor,reason,details) values(lead_row.id::text,p_actor,'email_consent_restored',jsonb_build_object('email',lead_row.normalized_email));
  insert into public.activities(lead_id,type,description) values(lead_row.id,'email','Email outreach eligibility restored by operator');
  return jsonb_build_object('leadId',lead_row.id,'reenrolled',true);
 else raise exception 'Unsupported unsubscribe operation';end if;
end $$;
revoke all on function public.outreach_unsubscribe_admin(text,jsonb,text,text) from public;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.outreach_unsubscribe_admin(text,jsonb,text,text) to service_role;end if;end $$;
commit;
