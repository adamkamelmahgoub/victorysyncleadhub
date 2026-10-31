begin;

-- Apply only after a schema/data copy dry run and a verified database backup.
-- The previous created_at is retained per row for rollback.
with original_dates as (
  select id,
    case when pg_input_is_valid(custom_fields->>'original_created_at','timestamp with time zone')
      then (custom_fields->>'original_created_at')::timestamptz else null end as original_created_at
  from public.leads
  where custom_fields ? 'original_created_at'
    and not custom_fields ? 'board_workaround_created_at'
)
update public.leads l set
  custom_fields=jsonb_set(coalesce(l.custom_fields,'{}'::jsonb),
    '{board_workaround_created_at}',to_jsonb(l.created_at),true),
  created_at=o.original_created_at
from original_dates o
where l.id=o.id and o.original_created_at is not null
  and l.created_at is distinct from o.original_created_at;

-- Rollback, if needed, using the stored value after a backup verification:
-- update public.leads set created_at=(custom_fields->>'board_workaround_created_at')::timestamptz
-- where custom_fields ? 'board_workaround_created_at';
commit;
