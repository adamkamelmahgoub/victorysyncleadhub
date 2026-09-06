-- Apply after 20260905_company_trials.sql. Rerunnable additive migration; existing fields and data are preserved.
begin;
alter table public.companies
  add column if not exists email text not null default '',
  add column if not exists website text not null default '',
  add column if not exists address text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists country text not null default '',
  add column if not exists tags text[] not null default '{}',
  add column if not exists contacts jsonb not null default '[]'::jsonb,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb,
  add column if not exists next_action text not null default '',
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists coverage_hours text not null default '',
  add column if not exists coverage_timezone text not null default '',
  add column if not exists expected_daily_leads integer check (expected_daily_leads >= 0),
  add column if not exists trial_success_criteria text not null default '',
  add column if not exists trial_results text not null default '',
  add column if not exists proposed_monthly_price numeric(14,2) check (proposed_monthly_price >= 0),
  add column if not exists currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  add column if not exists close_call_at timestamptz,
  add column if not exists close_notes text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.companies'::regclass and conname = 'company_contacts_array') then
    alter table public.companies add constraint company_contacts_array check (jsonb_typeof(contacts) = 'array' and jsonb_array_length(contacts) <= 30);
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.companies'::regclass and conname = 'company_custom_fields_object') then
    alter table public.companies add constraint company_custom_fields_object check (jsonb_typeof(custom_fields) = 'object');
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.companies'::regclass and conname = 'company_tags_limit') then
    alter table public.companies add constraint company_tags_limit check (cardinality(tags) <= 30);
  end if;
end $$;
create index if not exists companies_follow_up_idx on public.companies(next_follow_up_at) where next_follow_up_at is not null;
create table if not exists public.company_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 500),
  kind text not null default 'task' check (kind in ('task','callback','email','meeting','close_call')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  due_at timestamptz,
  assignee text not null default '',
  notes text not null default '',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_tasks_due_idx on public.company_tasks(due_at) where status <> 'completed';
create index if not exists company_tasks_company_idx on public.company_tasks(company_id,created_at desc);
do $$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.company_tasks'::regclass and tgname = 'crm_task_updated_at') then
    create trigger crm_task_updated_at before update on public.company_tasks for each row execute function public.crm_company_updated_at();
  end if;
end $$;
alter table public.company_tasks enable row level security;
revoke all on public.company_tasks from anon, authenticated;
grant select, insert on public.company_tasks to authenticated;
grant update(title,kind,status,priority,due_at,assignee,notes) on public.company_tasks to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'company_tasks' and policyname = 'crm_task_read') then
    create policy crm_task_read on public.company_tasks for select to authenticated using (public.crm_can_access());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'company_tasks' and policyname = 'crm_task_insert') then
    create policy crm_task_insert on public.company_tasks for insert to authenticated with check (public.crm_can_access(true) and created_by = auth.uid());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'company_tasks' and policyname = 'crm_task_update') then
    create policy crm_task_update on public.company_tasks for update to authenticated using (public.crm_can_access(true)) with check (public.crm_can_access(true));
  end if;
end $$;

create table if not exists public.company_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint file_company_path check (split_part(storage_path,'/',1) = company_id::text)
);
create index if not exists company_files_company_idx on public.company_files(company_id,created_at desc);
alter table public.company_files enable row level security;
revoke all on public.company_files from anon, authenticated;
grant select, insert on public.company_files to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'company_files' and policyname = 'crm_file_read') then
    create policy crm_file_read on public.company_files for select to authenticated using (public.crm_can_access());
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'company_files' and policyname = 'crm_file_insert') then
    create policy crm_file_insert on public.company_files for insert to authenticated with check (public.crm_can_access(true) and uploaded_by = auth.uid());
  end if;
end $$;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values
  ('company-files','company-files',false,10485760,array['application/pdf','image/png','image/jpeg','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'crm_storage_read') then
    create policy crm_storage_read on storage.objects for select to authenticated
using (bucket_id='company-files' and public.crm_can_access() and exists(select 1 from public.companies where id::text = split_part(storage.objects.name,'/',1)));
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'crm_storage_insert') then
    create policy crm_storage_insert on storage.objects for insert to authenticated
with check (bucket_id='company-files' and public.crm_can_access(true) and exists(select 1 from public.companies where id::text = split_part(storage.objects.name,'/',1)));
  end if;
end $$;
-- Allows cleanup only of files uploaded by the current user, e.g. when metadata registration fails.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'crm_storage_cleanup') then
    create policy crm_storage_cleanup on storage.objects for delete to authenticated
using (bucket_id='company-files' and public.crm_can_access(true) and owner_id = auth.uid()::text);
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
