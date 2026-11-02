begin;

alter table public.conversations add column if not exists match_checked_at timestamptz;
create index if not exists conversations_unmatched_check_idx
  on public.conversations(match_checked_at,last_message_at desc)
  where match_status='unmatched' and channel in ('instagram','linkedin');

-- Rollback: drop the index. Keep match_checked_at as harmless audit metadata.
commit;
