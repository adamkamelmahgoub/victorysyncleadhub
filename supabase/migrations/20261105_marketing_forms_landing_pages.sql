begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

alter table public.forms add column if not exists organization_id uuid references public.organizations(id);
alter table public.forms add column if not exists slug text;
alter table public.forms add column if not exists submit_button_text text not null default 'Submit';
alter table public.forms add column if not exists redirect_url text;
alter table public.forms add column if not exists settings jsonb not null default '{}'::jsonb;
update public.forms set organization_id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1' where organization_id is null;
update public.forms set slug='form-'||left(id::text,8) where slug is null;
alter table public.forms alter column organization_id set not null;
alter table public.forms alter column organization_id set default 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
alter table public.forms alter column slug set not null;
create unique index if not exists forms_organization_slug_idx on public.forms(organization_id,slug);
alter table public.forms enable row level security;

alter table public.form_submissions add column if not exists organization_id uuid references public.organizations(id);
alter table public.form_submissions add column if not exists submission_key text;
alter table public.form_submissions add column if not exists status text not null default 'accepted';
alter table public.form_submissions add column if not exists utm jsonb not null default '{}'::jsonb;
alter table public.form_submissions add column if not exists landing_page_id uuid;
update public.form_submissions s set organization_id=f.organization_id from public.forms f
  where f.id=s.form_id and s.organization_id is null;
create unique index if not exists form_submissions_idempotency_idx on public.form_submissions(form_id,submission_key)
  where submission_key is not null;
create index if not exists form_submissions_form_created_idx on public.form_submissions(form_id,created_at desc);
alter table public.form_submissions enable row level security;

create table if not exists public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null,slug text not null,
  status text not null default 'draft' check(status in ('draft','published','archived')),
  sections jsonb not null default '[]'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  seo_title text,seo_description text,
  form_id uuid references public.forms(id) on delete set null,
  visits bigint not null default 0,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(organization_id,slug)
);
create index if not exists landing_pages_status_idx on public.landing_pages(organization_id,status,updated_at desc);
alter table public.landing_pages enable row level security;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='form_submissions_landing_page_id_fkey') then
    alter table public.form_submissions add constraint form_submissions_landing_page_id_fkey
      foreign key(landing_page_id) references public.landing_pages(id) on delete set null;
  end if;
end $$;

create table if not exists public.landing_page_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  landing_page_id uuid not null references public.landing_pages(id),
  event_type text not null check(event_type in ('view','form_submit')),
  referrer_domain text,utm jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists landing_page_events_report_idx on public.landing_page_events(landing_page_id,event_type,created_at desc);
alter table public.landing_page_events enable row level security;

create table if not exists public.form_rate_limits (
  form_id uuid not null references public.forms(id),
  ip_hash text not null,window_started_at timestamptz not null,
  attempts integer not null default 0,
  primary key(form_id,ip_hash,window_started_at)
);
alter table public.form_rate_limits enable row level security;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='forms' and policyname='marketing_forms_admin') then
    create policy marketing_forms_admin on public.forms for all to authenticated
      using(public.social_org_access(organization_id) and public.wf_role()='admin')
      with check(public.social_org_access(organization_id) and public.wf_role()='admin');
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='form_submissions' and policyname='marketing_submissions_admin') then
    create policy marketing_submissions_admin on public.form_submissions for select to authenticated
      using(public.social_org_access(organization_id) and public.wf_role()='admin');
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='landing_pages' and policyname='marketing_pages_admin') then
    create policy marketing_pages_admin on public.landing_pages for all to authenticated
      using(public.social_org_access(organization_id) and public.wf_role()='admin')
      with check(public.social_org_access(organization_id) and public.wf_role()='admin');
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='landing_page_events' and policyname='marketing_page_events_admin') then
    create policy marketing_page_events_admin on public.landing_page_events for select to authenticated
      using(public.social_org_access(organization_id) and public.wf_role()='admin');
  end if;
end $$;

grant select,insert,update on public.forms to authenticated;
grant select on public.form_submissions,public.landing_page_events to authenticated;
grant select,insert,update on public.landing_pages to authenticated;
revoke all on public.form_rate_limits from public,anon,authenticated;

commit;
