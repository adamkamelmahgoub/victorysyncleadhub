begin;
create table if not exists public.social_threads_apps (
  organization_id uuid primary key references public.organizations(id),
  app_id text not null,
  app_secret_vault_id uuid not null,
  configured_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.social_threads_apps enable row level security;
revoke all on public.social_threads_apps from public,anon,authenticated;
commit;
