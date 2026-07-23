-- Idempotent compatibility upgrade for older VictorySync portal tables.
create extension if not exists "pgcrypto";

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

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  role text not null default 'member',
  status text not null default 'invited',
  auth_user_id text unique,
  org_id uuid,
  client_account_id uuid references public.sub_accounts(id) on delete set null,
  page_permissions jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.team_members
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists role text not null default 'member',
  add column if not exists status text not null default 'invited',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists auth_user_id text unique,
  add column if not exists org_id uuid,
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

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  email text not null,
  name text not null,
  role text not null default 'member',
  team_member_id uuid references public.team_members(id) on delete set null,
  org_id uuid,
  client_account_id uuid references public.sub_accounts(id) on delete set null,
  created_by text not null default 'dashboard',
  used_by_user_id text,
  used_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.invite_codes
  add column if not exists code_hash text,
  add column if not exists email text,
  add column if not exists name text,
  add column if not exists role text not null default 'member',
  add column if not exists team_member_id uuid references public.team_members(id) on delete set null,
  add column if not exists org_id uuid,
  add column if not exists client_account_id uuid references public.sub_accounts(id) on delete set null,
  add column if not exists created_by text not null default 'dashboard',
  add column if not exists used_by_user_id text,
  add column if not exists used_at timestamptz,
  add column if not exists expires_at timestamptz not null default (now() + interval '7 days'),
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists invite_codes_code_hash_unique
  on public.invite_codes (code_hash)
  where code_hash is not null;

notify pgrst, 'reload schema';
