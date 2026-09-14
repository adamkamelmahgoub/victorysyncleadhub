begin;
do $$ declare definition text;begin
 select r.definition into definition from public.outreach_phase4_restore r where r.name='outreach_choose_mailbox';
 if definition is not null then execute definition;end if;
end $$;
commit;
