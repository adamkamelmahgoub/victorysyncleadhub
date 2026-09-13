begin;
-- Detach contacts before the existing pipeline -> stages cascade executes.
create function public.preserve_pipeline_contacts() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare detached integer;
begin
 update public.leads set pipeline_stage_id=null
 where pipeline_stage_id in (select id from public.pipeline_stages where pipeline_id=old.id);
 get diagnostics detached=row_count;
 insert into public.outreach_audit(actor,reason,details)
 values('system','pipeline_deleted_contacts_preserved',jsonb_build_object('pipeline_id',old.id,'contacts_detached',detached));
 return old;
end $$;
revoke all on function public.preserve_pipeline_contacts() from public;
create trigger preserve_pipeline_contacts before delete on public.pipelines
for each row execute function public.preserve_pipeline_contacts();
notify pgrst,'reload schema';
commit;
