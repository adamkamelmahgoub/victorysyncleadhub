begin;

create or replace function public.outreach_sequence_bulk_enroll(
 p_sequence text,
 p_leads text[],
 p_actor text default 'operator',
 p_scope text default null
) returns jsonb language plpgsql as $$
#variable_conflict use_column
declare q public.sequences;s public.sequence_steps;chosen text;mailbox_id public.email_accounts.id%type;n int:=0;
begin
 perform pg_advisory_xact_lock(8675309);
 perform set_config('outreach.sequence_actor',p_actor,true);
 if coalesce(array_length(p_leads,1),0)=0 or array_length(p_leads,1)>500 then raise exception 'Choose 1 to 500 contacts';end if;
 select * into q from public.sequences where id::text=p_sequence for update;
 if not found then raise exception 'Sequence not found';end if;
 if q.status<>'active' then raise exception 'Activate the sequence before enrollment';end if;
 select * into s from public.sequence_steps where sequence_id=q.id order by step_number limit 1;
 if not found then raise exception 'Sequence needs steps';end if;
 chosen:=public.outreach_sequence_choose_mailbox();
 select id into mailbox_id from public.email_accounts where id::text=chosen;
 insert into public.sequence_enrollments(sequence_id,lead_id,assigned_mailbox_id,current_step,status,next_send_at)
 select q.id,l.id,mailbox_id,s.step_number,'active',now()+make_interval(hours=>s.delay_days*24)
 from public.outreach_eligible_leads l
 where l.id::text=any(p_leads)
 and (p_scope is null or l.client_account_id::text=p_scope)
 and l.normalized_email is not null
 and (l.disposition is null or l.disposition not in ('meeting_booked','not_interested','wrong_number','dnc'))
 and not exists(select 1 from public.sequence_enrollments e where e.lead_id=l.id and e.status in ('active','paused'))
 on conflict do nothing;
 get diagnostics n=row_count;
 insert into public.outreach_audit(actor,reason,details) values(p_actor,'sequence_bulk_enroll',jsonb_build_object('sequence_id',q.id,'requested',array_length(p_leads,1),'enrolled',n,'mailbox_id',mailbox_id));
 return jsonb_build_object('enrolled',n);
end $$;

revoke all on function public.outreach_sequence_bulk_enroll(text,text[],text,text) from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.outreach_sequence_bulk_enroll(text,text[],text,text) to service_role;
 end if;
end $$;

commit;
