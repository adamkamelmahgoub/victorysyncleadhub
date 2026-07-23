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
  add column if not exists auth_user_id text unique,
  add column if not exists client_account_id uuid references public.sub_accounts(id) on delete set null;

alter table public.invite_codes
  add column if not exists client_account_id uuid references public.sub_accounts(id) on delete set null;

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
