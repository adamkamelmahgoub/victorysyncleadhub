begin;
do $$ declare definition text;changed text;begin
 select pg_get_functiondef('public.outreach_choose_mailbox()'::regprocedure) into definition;
 if position('status in (''active'',''warming'')' in definition)>0 then return;end if;
 changed:=replace(definition,'h.status=''active''','h.status in (''active'',''warming'')');
 changed:=replace(changed,'m.status=''active''','m.status in (''active'',''warming'')');
 if changed=definition then raise exception 'Unable to update mailbox rotation for warming senders';end if;
 execute changed;
end $$;
commit;
