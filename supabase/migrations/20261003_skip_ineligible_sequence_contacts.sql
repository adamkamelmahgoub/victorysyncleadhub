begin;

-- Bulk selection can race with an unsubscribe, bounce, or suppression update.
-- Skip those protected contacts instead of aborting enrollment for the rest.
do $$ declare definition text;changed text;begin
 select pg_get_functiondef('public.outreach_sequence_admin(text,jsonb,text,text)'::regprocedure) into definition;
 changed:=replace(definition,
  'if not found then raise exception ''Eligible lead not found'';end if;',
  'if not found then continue;end if;');
 if changed=definition and position('if not found then continue;end if;' in definition)=0 then
  raise exception 'Unable to make bulk sequence enrollment skip ineligible contacts';
 end if;
 if changed<>definition then execute changed;end if;
end $$;

commit;
