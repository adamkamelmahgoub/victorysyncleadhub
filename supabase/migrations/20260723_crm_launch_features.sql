create extension if not exists "pgcrypto";

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid references public.pipelines(id) on delete cascade,
  name text not null,
  color text not null default '#f97316',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.pipeline_stages
  add column if not exists pipeline_id uuid references public.pipelines(id) on delete cascade;

create table if not exists public.sub_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_email text not null,
  owner_name text not null,
  status text not null default 'active',
  plan text not null default 'starter',
  leads_count integer not null default 0,
  campaigns_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.white_label_settings (
  id uuid primary key default gen_random_uuid(),
  sub_account_id uuid not null unique references public.sub_accounts(id) on delete cascade,
  brand_name text not null default 'VictorySync',
  primary_color text not null default '#f97316',
  accent_color text not null default '#1e293b',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  role text not null default 'member',
  status text not null default 'invited',
  auth_user_id text unique,
  client_account_id uuid references public.sub_accounts(id) on delete set null,
  page_permissions jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  email text not null,
  name text not null,
  role text not null default 'member',
  team_member_id uuid references public.team_members(id) on delete set null,
  client_account_id uuid references public.sub_accounts(id) on delete set null,
  created_by text not null default 'dashboard',
  used_by_user_id text,
  used_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.leads
  add column if not exists disposition text,
  add column if not exists contact_attempts integer not null default 0,
  add column if not exists client_account_id uuid;

-- An early draft created this column as integer. Convert that unused legacy
-- assignment column before attaching it to the UUID sub_accounts primary key.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'client_account_id'
      and data_type <> 'uuid'
  ) then
    alter table public.leads drop constraint if exists leads_client_account_id_fkey;
    alter table public.leads
      alter column client_account_id type uuid using null::uuid;
  end if;
end $$;

alter table public.leads
  drop constraint if exists leads_client_account_id_fkey,
  add constraint leads_client_account_id_fkey
    foreign key (client_account_id) references public.sub_accounts(id) on delete cascade;

alter table public.team_members
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists role text not null default 'member',
  add column if not exists status text not null default 'invited',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists auth_user_id text unique,
  add column if not exists client_account_id uuid references public.sub_accounts(id) on delete set null,
  add column if not exists page_permissions jsonb;

update public.team_members
set
  name = coalesce(nullif(name, ''), nullif(email, ''), 'Team member'),
  email = coalesce(nullif(email, ''), 'unknown-' || id::text || '@invalid.local'),
  role = coalesce(nullif(role, ''), 'member'),
  status = coalesce(nullif(status, ''), 'invited');

alter table public.team_members
  alter column name set not null,
  alter column email set not null,
  alter column role set not null,
  alter column status set not null;

alter table public.invite_codes
  add column if not exists code_hash text,
  add column if not exists email text,
  add column if not exists name text,
  add column if not exists role text not null default 'member',
  add column if not exists team_member_id uuid references public.team_members(id) on delete set null,
  add column if not exists created_by text not null default 'dashboard',
  add column if not exists used_by_user_id text,
  add column if not exists used_at timestamptz,
  add column if not exists expires_at timestamptz not null default (now() + interval '7 days'),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists client_account_id uuid references public.sub_accounts(id) on delete set null;

create unique index if not exists invite_codes_code_hash_unique
  on public.invite_codes (code_hash)
  where code_hash is not null;

create table if not exists public.dispositions (
  id serial primary key,
  name text not null unique,
  color text not null default '#f97316',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.dispositions (name, color) values
  ('No Answer', '#64748b'),
  ('Call Back', '#f59e0b'),
  ('Interested', '#22c55e'),
  ('Not Interested', '#ef4444'),
  ('Wrong Number', '#8b5cf6')
on conflict (name) do nothing;

notify pgrst, 'reload schema';
