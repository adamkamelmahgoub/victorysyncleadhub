-- Add Open Places to an existing enrichment installation without replacing its tables or data.
begin;

alter table public.lead_enrichment drop constraint if exists lead_enrichment_source_check;
alter table public.lead_enrichment add constraint lead_enrichment_source_check
  check (source in ('open_places','google_places','google_rank','ai_research'));

create table if not exists public.enrichment_api_log (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  lead_id uuid references public.leads(id) on delete set null,
  request jsonb not null default '{}'::jsonb,
  status text not null,
  cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists enrichment_api_log_created_idx
  on public.enrichment_api_log(created_at desc);
alter table public.enrichment_api_log enable row level security;
revoke all on public.enrichment_api_log from public, anon, authenticated;
grant select, insert, update, delete on public.enrichment_api_log to service_role;

create or replace function public.enrichment_import_open_places(p_places jsonb, p_city text, p_state text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; v_phone text; v_inserted integer := 0; v_skipped integer := 0; v_ids uuid[] := '{}'; v_id uuid;
begin
  if jsonb_typeof(p_places) <> 'array' or jsonb_array_length(p_places) > 2000 then
    raise exception 'Expected up to 2,000 places';
  end if;
  perform pg_advisory_xact_lock(8675309);
  for v in select value from jsonb_array_elements(p_places) loop
    v_phone := public.outreach_phone(v->>'phone');
    if v_phone is null or length(v_phone) < 10 or nullif(trim(v->>'name'),'') is null
      or exists(select 1 from public.leads where normalized_phone = v_phone)
      or exists(select 1 from public.outreach_suppressions
        where identity_type = 'phone' and identity_value = v_phone) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into public.leads(phone,company,state,source,tags,custom_fields)
    values(v->>'phone',v->>'name',upper(coalesce(v->'address'->>'region',p_state)),'open_places',
      array['op-new','needs-enrichment'],
      jsonb_build_object('city',coalesce(v->'address'->>'locality',p_city),
        'open_places',v || jsonb_build_object('fetched_at',now(),
          'attribution','Open Places / Overture Maps')))
    returning id into v_id;
    v_ids := array_append(v_ids,v_id);
    v_inserted := v_inserted + 1;
  end loop;
  return jsonb_build_object('inserted',v_inserted,'skipped',v_skipped,'lead_ids',v_ids);
end $$;

create or replace function public.enrichment_job_tag_counts(p_job_id uuid) returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(tag, count), '{}'::jsonb)
  from (
    select tag.value as tag, count(*)::integer as count
    from public.enrichment_jobs j
    join public.leads l on l.id = any(j.lead_ids)
    cross join lateral unnest(l.tags) as tag(value)
    where j.id = p_job_id and tag.value in
      ('top3-fit','top3-reviews-first','top3-already','review-leadgen','franchise',
       'enrich-not-found','enrich-op-not-found')
    group by tag.value
  ) totals
$$;
revoke all on function public.enrichment_import_open_places(jsonb,text,text)
  from public, anon, authenticated;
grant execute on function public.enrichment_import_open_places(jsonb,text,text) to service_role;

commit;
