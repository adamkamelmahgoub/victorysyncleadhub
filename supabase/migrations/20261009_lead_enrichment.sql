-- Review before applying. The live leads.id and segments.id columns are UUIDs.
begin;

create table public.enrichment_settings (
  id boolean primary key default true check (id),
  enrichment_budget_usd numeric(12,4) not null default 0 check (enrichment_budget_usd >= 0),
  local_falcon_api_key text,
  updated_at timestamptz not null default now()
);
insert into public.enrichment_settings(id) values (true) on conflict do nothing;

create table public.enrichment_spend (
  month date primary key,
  reserved_usd numeric(12,6) not null default 0 check (reserved_usd >= 0)
);
create table public.enrichment_api_usage (
  provider text not null check (provider in ('open_places','google_places')),
  month date not null,
  calls integer not null default 0 check (calls >= 0),
  blocked_until date,
  primary key (provider, month)
);
create table public.enrichment_api_log (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  lead_id uuid references public.leads(id) on delete set null,
  request jsonb not null default '{}'::jsonb,
  status text not null,
  cost_usd numeric(12,6) not null default 0,
  created_at timestamptz not null default now()
);
create index enrichment_api_log_created_idx on public.enrichment_api_log(created_at desc);
create function public.enrichment_reserve_api_call(p_provider text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_month date := date_trunc('month', now() at time zone 'UTC')::date;
  v_limit integer;
begin
  v_limit := case p_provider when 'open_places' then 9500 when 'google_places' then 900 else null end;
  if v_limit is null then raise exception 'Unknown API provider'; end if;
  insert into public.enrichment_api_usage(provider, month, calls) values(p_provider, v_month, 0)
    on conflict (provider, month) do nothing;
  update public.enrichment_api_usage set calls = calls + 1
    where provider = p_provider and month = v_month and calls < v_limit
      and (blocked_until is null or blocked_until <= current_date);
  return found;
end $$;
create function public.enrichment_block_api_month(p_provider text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.enrichment_api_usage set blocked_until =
    (date_trunc('month', now() at time zone 'UTC') + interval '1 month')::date
    where provider = p_provider and month = date_trunc('month', now() at time zone 'UTC')::date;
end $$;
create function public.enrichment_reserve_cost(p_amount numeric) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_budget numeric; v_month date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  if p_amount < 0 then raise exception 'Cost must be nonnegative'; end if;
  select enrichment_budget_usd into v_budget from public.enrichment_settings where id = true for update;
  if v_budget is null or v_budget = 0 then return false; end if;
  insert into public.enrichment_spend(month, reserved_usd) values(v_month, 0)
    on conflict (month) do nothing;
  update public.enrichment_spend set reserved_usd = reserved_usd + p_amount
    where month = v_month and reserved_usd + p_amount <= v_budget;
  return found;
end $$;
create function public.enrichment_release_cost(p_amount numeric) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_month date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  if p_amount < 0 then raise exception 'Cost must be nonnegative'; end if;
  update public.enrichment_spend set reserved_usd = greatest(0, reserved_usd - p_amount)
    where month = v_month;
end $$;

create table public.lead_enrichment (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  source text not null check (source in ('open_places','google_places','google_rank','ai_research')),
  data jsonb not null default '{}'::jsonb,
  status text not null check (status in ('ok','not_found','error')),
  error text,
  cost_usd numeric(12,6) not null default 0 check (cost_usd >= 0),
  fetched_at timestamptz not null default now(),
  expires_at timestamptz
);
create index lead_enrichment_lead_idx on public.lead_enrichment(lead_id, fetched_at desc);
create index lead_enrichment_month_idx on public.lead_enrichment(fetched_at);

create function public.enrichment_import_open_places(p_places jsonb, p_city text, p_state text)
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

create table public.enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid references public.segments(id) on delete set null,
  lead_ids uuid[] not null,
  mode text not null check (mode in ('google','ai','both')),
  grid integer not null check (grid in (3,5)),
  status text not null default 'queued' check (status in ('queued','running','paused_budget','completed','failed')),
  total integer not null,
  done integer not null default 0,
  failed integer not null default 0,
  cost_usd numeric(12,6) not null default 0,
  max_cost_usd numeric(12,4),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  check (total = cardinality(lead_ids)),
  check (done >= 0 and failed >= 0 and done + failed <= total)
);
create index enrichment_jobs_active_idx on public.enrichment_jobs(created_at)
  where status in ('queued','running');

create table public.enrichment_job_items (
  job_id uuid not null references public.enrichment_jobs(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','running','done','failed')),
  attempts integer not null default 0,
  cost_usd numeric(12,6) not null default 0,
  error text,
  next_attempt_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (job_id, lead_id)
);
create index enrichment_job_items_pending_idx on public.enrichment_job_items(job_id, status);

create function public.enrichment_claim_batch(p_limit integer default 10)
returns table(job_id uuid, lead_id uuid, mode text, grid integer, max_cost_usd numeric, job_cost_usd numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.enrichment_job_items set status = 'pending', updated_at = now()
    where status = 'running' and updated_at < now() - interval '10 minutes';
  update public.enrichment_jobs j set status = 'running', updated_at = now()
    where status = 'queued' and exists
      (select 1 from public.enrichment_job_items i where i.job_id = j.id and i.status = 'pending');
  return query
    with candidates as (
      select i.job_id, i.lead_id from public.enrichment_job_items i
      join public.enrichment_jobs j on j.id = i.job_id
      where j.status = 'running' and i.status = 'pending' and i.next_attempt_at <= now()
      order by j.created_at, i.lead_id limit least(greatest(p_limit, 1), 10)
      for update of i skip locked
    ), claimed as (
      update public.enrichment_job_items i
      set status = 'running', attempts = attempts + 1, updated_at = now()
      from candidates c where i.job_id = c.job_id and i.lead_id = c.lead_id
      returning i.job_id, i.lead_id
    )
    select c.job_id, c.lead_id, j.mode, j.grid, j.max_cost_usd, j.cost_usd
    from claimed c join public.enrichment_jobs j on j.id = c.job_id;
end $$;

create function public.enrichment_complete_item(
  p_job_id uuid, p_lead_id uuid, p_cost numeric, p_success boolean, p_error text default null
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_attempts integer; v_terminal boolean; v_finished integer;
begin
  select attempts into v_attempts from public.enrichment_job_items
    where job_id = p_job_id and lead_id = p_lead_id and status = 'running' for update;
  if not found then return false; end if;
  v_terminal := p_success or v_attempts >= 3;
  update public.enrichment_job_items set
    status = case when p_success then 'done' when v_terminal then 'failed' else 'pending' end,
    cost_usd = cost_usd + greatest(p_cost, 0), error = p_error,
    next_attempt_at = case when v_terminal then next_attempt_at
      else now() + make_interval(secs => power(2, v_attempts)::integer * 30) end,
    updated_at = now()
    where job_id = p_job_id and lead_id = p_lead_id;
  update public.enrichment_jobs set
    done = done + case when p_success then 1 else 0 end,
    failed = failed + case when not p_success and v_terminal then 1 else 0 end,
    cost_usd = cost_usd + greatest(p_cost, 0), updated_at = now()
    where id = p_job_id;
  update public.enrichment_jobs set status = 'completed', finished_at = now()
    where id = p_job_id and done + failed = total and status = 'running';
  get diagnostics v_finished = row_count;
  return v_finished > 0;
end $$;

create function public.enrichment_job_tag_counts(p_job_id uuid) returns jsonb
language sql security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(tag, count), '{}'::jsonb)
  from (
    select tag.value as tag, count(*)::integer as count
    from public.enrichment_jobs j
    join public.leads l on l.id = any(j.lead_ids)
    cross join lateral unnest(l.tags) as tag(value)
    where j.id = p_job_id and tag.value in
      ('top3-fit','top3-reviews-first','top3-already','review-leadgen','franchise','enrich-not-found','enrich-op-not-found')
    group by tag.value
  ) totals
$$;

alter table public.enrichment_settings enable row level security;
alter table public.enrichment_spend enable row level security;
alter table public.enrichment_api_usage enable row level security;
alter table public.enrichment_api_log enable row level security;
alter table public.lead_enrichment enable row level security;
alter table public.enrichment_jobs enable row level security;
alter table public.enrichment_job_items enable row level security;
revoke all on public.enrichment_settings, public.lead_enrichment, public.enrichment_jobs,
  public.enrichment_job_items, public.enrichment_spend, public.enrichment_api_usage,
  public.enrichment_api_log from public, anon, authenticated;
grant select, insert, update, delete on public.enrichment_settings, public.lead_enrichment,
  public.enrichment_jobs, public.enrichment_job_items, public.enrichment_spend,
  public.enrichment_api_usage, public.enrichment_api_log to service_role;
revoke all on function public.enrichment_reserve_cost(numeric),
  public.enrichment_release_cost(numeric), public.enrichment_claim_batch(integer),
  public.enrichment_complete_item(uuid,uuid,numeric,boolean,text),
  public.enrichment_job_tag_counts(uuid), public.enrichment_reserve_api_call(text),
  public.enrichment_block_api_month(text), public.enrichment_import_open_places(jsonb,text,text)
  from public, anon, authenticated;
grant execute on function public.enrichment_reserve_cost(numeric),
  public.enrichment_release_cost(numeric), public.enrichment_claim_batch(integer),
  public.enrichment_complete_item(uuid,uuid,numeric,boolean,text),
  public.enrichment_job_tag_counts(uuid), public.enrichment_reserve_api_call(text),
  public.enrichment_block_api_month(text), public.enrichment_import_open_places(jsonb,text,text)
  to service_role;

select cron.schedule('victorysync-enrichment-worker', '* * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
      where name = 'victorysync_leadgen_origin') || '/api/enrichment-worker',
    headers := jsonb_build_object('Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets
       where name = 'victorysync_native_worker_token'),
      'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
$cron$);

commit;
