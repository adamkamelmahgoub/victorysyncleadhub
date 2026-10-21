begin;

create table if not exists public.social_unipile_sync_state (
  connected_account_id uuid primary key references public.connected_accounts(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  chat_cursor text,
  last_sync_at timestamptz,
  next_sync_at timestamptz not null default now(),
  initial_sync_complete boolean not null default false,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_unipile_sync_due on public.social_unipile_sync_state(next_sync_at);
alter table public.social_unipile_sync_state enable row level security;
revoke all on public.social_unipile_sync_state from public, anon, authenticated;

insert into public.social_unipile_sync_state(connected_account_id, organization_id)
select id, organization_id from public.connected_accounts
where provider='unipile' and external_account_id is not null
on conflict (connected_account_id) do nothing;

commit;
