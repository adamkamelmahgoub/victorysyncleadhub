-- Multiple CRM pipelines and contact source cleanup.

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.pipelines (name, description, is_default)
select 'Sales Pipeline', 'Primary sales process', true
where not exists (select 1 from public.pipelines);

alter table public.pipeline_stages
  add column if not exists pipeline_id uuid references public.pipelines(id) on delete cascade;

update public.pipeline_stages
set pipeline_id = (select id from public.pipelines order by is_default desc, created_at asc limit 1)
where pipeline_id is null;

alter table public.pipeline_stages
  alter column pipeline_id set not null;

create index if not exists idx_pipeline_stages_pipeline_id on public.pipeline_stages(pipeline_id);

update public.leads
set source = null
where lower(coalesce(source, '')) in ('mcgrawno', 'mcgraw no', 'mcgraw', 'unknown', 'n/a', 'na', '-');

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'pipelines' and policyname = 'authenticated manage pipelines'
  ) then
    alter table public.pipelines enable row level security;
    create policy "authenticated manage pipelines"
      on public.pipelines for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
