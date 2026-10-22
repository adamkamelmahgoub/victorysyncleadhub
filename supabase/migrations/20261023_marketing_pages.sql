begin;


create table if not exists public.marketing_landing_pages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  status text not null default 'draft' check (status in ('draft', 'published')),
  seo_description text not null default '',
  sections jsonb not null default '[]'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.marketing_landing_page_events (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.marketing_landing_pages(id) on delete cascade,
  event_type text not null check (event_type in ('view', 'form_submission')),
  created_at timestamptz not null default now()
);

create index if not exists marketing_landing_page_events_page_created_idx
  on public.marketing_landing_page_events (page_id, created_at desc);
create index if not exists form_submissions_form_created_idx
  on public.form_submissions (form_id, created_at desc);
alter table public.form_submissions add column if not exists marketing_page_id uuid references public.marketing_landing_pages(id) on delete set null;
create index if not exists form_submissions_marketing_page_created_idx on public.form_submissions (marketing_page_id, created_at desc);

commit;
