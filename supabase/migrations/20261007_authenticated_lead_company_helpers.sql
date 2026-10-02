begin;

-- These pure helpers run while PostgreSQL checks lead generated columns and
-- company trial constraints. Authenticated writes need EXECUTE on each one.
grant execute on function public.outreach_email(text) to authenticated;
grant execute on function public.outreach_phone(text) to authenticated;
grant execute on function public.crm_trial_end(date) to authenticated;

commit;
