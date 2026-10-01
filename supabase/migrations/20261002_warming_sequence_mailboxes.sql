begin;

-- Warming mailboxes already use a reduced effective cap and are valid for direct
-- sends. Apply the same policy to sequence assignment and scheduling.
do $$ declare definition text;changed text;begin
 select pg_get_functiondef('public.outreach_sequence_choose_mailbox()'::regprocedure) into definition;
 changed:=replace(definition,'m.status=''active''','m.status in (''active'',''warming'')');
 if changed=definition and position('m.status in (''active'',''warming'')' in definition)=0 then
  raise exception 'Unable to allow warming mailboxes for sequence assignment';
 end if;
 if changed<>definition then execute changed;end if;

 select pg_get_functiondef('public.outreach_enrollment_mailbox()'::regprocedure) into definition;
 changed:=replace(definition,
  'and status=''active'' and email_engine_enabled',
  'and status in (''active'',''warming'') and email_engine_enabled');
 changed:=replace(changed,'Sequence requires an active mailbox','Sequence requires an active or warming mailbox');
 if changed=definition and position('status in (''active'',''warming'')' in definition)=0 then
  raise exception 'Unable to allow warming mailboxes for sequence enrollment';
 end if;
 if changed<>definition then execute changed;end if;

 select pg_get_functiondef('public.outreach_sequence_tick()'::regprocedure) into definition;
 changed:=replace(definition,'m.status=''active''','m.status in (''active'',''warming'')');
 if changed=definition and position('m.status in (''active'',''warming'')' in definition)=0 then
  raise exception 'Unable to allow warming mailboxes for sequence scheduling';
 end if;
 if changed<>definition then execute changed;end if;
end $$;

commit;
