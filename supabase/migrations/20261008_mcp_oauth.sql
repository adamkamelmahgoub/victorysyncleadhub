-- Review before applying. MCP credentials and backups are server-only.
begin;

create table if not exists public.mcp_oauth_clients (
  client_id text primary key,
  client_name text not null,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_oauth_codes (
  code_hash text primary key,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid not null,
  email text not null,
  redirect_uri text not null,
  code_challenge text not null,
  resource text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists public.mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique,
  refresh_token_hash text not null unique,
  client_id text not null references public.mcp_oauth_clients(client_id) on delete cascade,
  user_id uuid not null,
  email text not null,
  resource text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz,
  window_started_at timestamptz not null default now(),
  window_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists mcp_tokens_user_idx on public.mcp_oauth_tokens(user_id) where revoked_at is null;

create table if not exists public.mcp_audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id uuid,
  email text,
  client_id text,
  tool text not null,
  arguments jsonb not null,
  rows_affected bigint,
  result_status text not null,
  error_message text
);

create table if not exists public.mcp_deleted_backup (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null,
  audit_id bigint references public.mcp_audit_log(id),
  source_table text not null,
  source_pk jsonb,
  row_data jsonb not null
);

alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_codes enable row level security;
alter table public.mcp_oauth_tokens enable row level security;
alter table public.mcp_audit_log enable row level security;
alter table public.mcp_deleted_backup enable row level security;
revoke all on public.mcp_oauth_clients, public.mcp_oauth_codes, public.mcp_oauth_tokens,
  public.mcp_audit_log, public.mcp_deleted_backup from public, anon, authenticated;
grant select, insert, update, delete on public.mcp_oauth_clients, public.mcp_oauth_codes,
  public.mcp_oauth_tokens, public.mcp_audit_log, public.mcp_deleted_backup to service_role;
grant usage, select on sequence public.mcp_audit_log_id_seq, public.mcp_deleted_backup_id_seq to service_role;

commit;
