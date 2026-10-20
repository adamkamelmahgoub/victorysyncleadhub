begin;

create or replace function public.social_cancel_due_tasks() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.state in ('replied','completed','stopped','suppressed') and new.state is distinct from old.state then
    update public.dm_tasks set status='skipped',acted_at=now()
    where enrollment_id=new.id and status='due';
  end if;
  return new;
end $$;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='social_cancel_due_tasks' and tgrelid='public.dm_enrollments'::regclass) then
    create trigger social_cancel_due_tasks after update of state on public.dm_enrollments
    for each row execute function public.social_cancel_due_tasks();
  end if;
end $$;

create or replace function public.social_suppression_cascade() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.dm_enrollments e set state='suppressed',stopped_at=now(),stop_reason='outreach_suppression'
  where e.state in ('queued','step_due','sent')
    and public.social_is_suppressed_internal(e.organization_id,e.entity_type,e.entity_id)
    and (
      (e.entity_type='lead' and exists(select 1 from public.leads l where l.id=e.entity_id and
        (new.identity_type='email' and public.outreach_email(l.email)=new.identity_value or
         new.identity_type='phone' and public.outreach_phone(l.phone)=new.identity_value)))
      or (e.entity_type='contact' and exists(select 1 from public.crm_contacts c where c.id=e.entity_id and
        (new.identity_type='email' and public.outreach_email(c.email)=new.identity_value or
         new.identity_type='phone' and public.outreach_phone(c.phone)=new.identity_value)))
      or (e.entity_type='company' and exists(select 1 from public.crm_contacts c where c.company_id=e.entity_id and
        (new.identity_type='email' and public.outreach_email(c.email)=new.identity_value or
         new.identity_type='phone' and public.outreach_phone(c.phone)=new.identity_value)))
    );
  return new;
end $$;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='social_suppression_cascade' and tgrelid='public.outreach_suppressions'::regclass) then
    create trigger social_suppression_cascade after insert on public.outreach_suppressions
    for each row execute function public.social_suppression_cascade();
  end if;
end $$;

create or replace function public.social_lead_dnc_cascade() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.dnc and not coalesce(old.dnc,false) then
    update public.dm_enrollments e set state='suppressed',stopped_at=now(),stop_reason='lead_dnc'
    where e.state in ('queued','step_due','sent') and
      (e.entity_type='lead' and e.entity_id=new.id or
       e.entity_type='contact' and exists(select 1 from public.crm_contacts c where c.id=e.entity_id and c.source_lead_id=new.id) or
       e.entity_type='company' and exists(select 1 from public.crm_contacts c where c.company_id=e.entity_id and c.source_lead_id=new.id));
  end if;
  return new;
end $$;
do $$ begin
  if not exists(select 1 from pg_trigger where tgname='social_lead_dnc_cascade' and tgrelid='public.leads'::regclass) then
    create trigger social_lead_dnc_cascade after update of dnc on public.leads
    for each row execute function public.social_lead_dnc_cascade();
  end if;
end $$;

commit;
