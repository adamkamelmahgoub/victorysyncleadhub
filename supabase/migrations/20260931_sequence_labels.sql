begin;
create or replace function public.outreach_sequence_label(p_sequence text,p_label text,p_actor text default 'operator') returns jsonb language plpgsql as $$
declare q public.sequences;begin update public.sequences set label=nullif(trim(p_label),''),updated_at=now() where id::text=p_sequence returning * into q;if not found then raise exception 'Sequence not found';end if;insert into public.outreach_audit(actor,reason,details) values(p_actor,'sequence_label_changed',jsonb_build_object('sequence_id',q.id,'label',q.label));return to_jsonb(q);end $$;
revoke all on function public.outreach_sequence_label(text,text,text) from public;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.outreach_sequence_label(text,text,text) to service_role;end if;end $$;
commit;
