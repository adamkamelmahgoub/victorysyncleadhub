begin;
drop function if exists public.outreach_unsubscribe_admin(text,jsonb,text,text);
-- Restored consent cannot be reconstructed safely during rollback. Keep restored contacts eligible.
commit;
