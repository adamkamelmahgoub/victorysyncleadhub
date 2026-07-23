-- VictorySync platform schema + storage bootstrap
-- Run this in Supabase SQL Editor against the production project.
-- It is intentionally defensive: it creates missing tables/columns without deleting existing data.

begin;

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Existing production leads may already be UUID-based. Preserve that table and add app columns.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads add column if not exists phone text not null default '';
alter table public.leads add column if not exists company text;
alter table public.leads add column if not exists title text;
alter table public.leads add column if not exists source text default 'manual';
alter table public.leads add column if not exists status text not null default 'new';
alter table public.leads add column if not exists score integer not null default 0;
alter table public.leads add column if not exists campaign_id uuid;
alter table public.leads add column if not exists form_id uuid;
alter table public.leads add column if not exists pipeline_stage_id uuid;
alter table public.leads add column if not exists tags text[] not null default '{}';
alter table public.leads add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.leads add column if not exists created_at timestamptz not null default now();
alter table public.leads add column if not exists updated_at timestamptz not null default now();

drop trigger if exists set_leads_updated_at on public.leads;
create trigger set_leads_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#00E5FF',
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'draft',
  source_type text,
  subject text,
  from_name text,
  from_email text,
  body text,
  send_rate_per_hour integer not null default 20,
  daily_limit integer not null default 100,
  send_window_start text not null default '09:00',
  send_window_end text not null default '17:00',
  scheduled_at timestamptz,
  launched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_leads (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  primary key (campaign_id, lead_id)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.contact_tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  title text not null,
  description text,
  due_date timestamptz,
  is_completed boolean not null default false,
  completed_at timestamptz,
  priority text not null default 'medium',
  created_at timestamptz not null default now()
);

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'active',
  campaign_id uuid references public.campaigns(id) on delete set null,
  fields jsonb not null default '[]'::jsonb,
  success_message text default 'Thank you! We''ll be in touch shortly.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid references public.forms(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  source_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  from_name text not null,
  from_email text not null,
  smtp_host text not null,
  smtp_port integer not null default 587,
  smtp_user text not null,
  smtp_password text not null,
  is_default boolean not null default false,
  daily_limit integer not null default 100,
  sent_today integer not null default 0,
  last_sent_reset_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null,
  preview_text text,
  category text not null default 'general',
  tags jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft',
  email_account_id uuid references public.email_accounts(id) on delete set null,
  total_enrolled integer not null default 0,
  total_sent integer not null default 0,
  total_opened integer not null default 0,
  total_replied integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  step_number integer not null,
  subject text not null,
  body text not null,
  delay_days integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  current_step integer not null default 1,
  status text not null default 'active',
  next_send_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sequence_id, lead_id)
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  email_account_id uuid references public.email_accounts(id) on delete set null,
  sequence_id uuid references public.sequences(id) on delete set null,
  sequence_step_id uuid references public.sequence_steps(id) on delete set null,
  to_email text not null,
  from_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'sent',
  opened_at timestamptz,
  replied_at timestamptz,
  sent_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  role text not null default 'member',
  status text not null default 'invited',
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
  created_by text not null default 'admin',
  used_by_user_id text,
  used_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  name text not null,
  account_identifier text,
  status text not null default 'disconnected',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_type text not null default 'contact_created',
  trigger_config jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  enrolled_count integer not null default 0,
  completed_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  filters jsonb not null default '{}'::jsonb,
  contact_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_sources (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  name text not null,
  business_id text,
  review_url text,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  review_count integer not null default 0,
  avg_rating text not null default '0',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.review_sources(id) on delete set null,
  platform text not null,
  reviewer text not null,
  reviewer_avatar text,
  rating integer not null,
  text text,
  reply text,
  replied_at timestamptz,
  platform_review_id text,
  review_url text,
  sentiment text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  contact_name text not null,
  contact_email text,
  contact_phone text,
  channel text not null default 'email',
  platform text not null default 'google',
  status text not null default 'sent',
  sent_at timestamptz not null default now(),
  clicked_at timestamptz
);

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  events jsonb not null default '[]'::jsonb,
  secret text,
  is_active boolean not null default true,
  last_triggered_at timestamptz,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sub_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_email text not null,
  owner_name text not null,
  phone text,
  industry text,
  website text,
  status text not null default 'active',
  plan text not null default 'starter',
  external_id text unique,
  leads_count integer not null default 0,
  campaigns_count integer not null default 0,
  last_active_at timestamptz,
  health_score integer not null default 100,
  onboarding_completed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.white_label_settings (
  id uuid primary key default gen_random_uuid(),
  sub_account_id uuid not null unique references public.sub_accounts(id) on delete cascade,
  brand_name text not null default 'VictorySync',
  logo_url text,
  favicon_url text,
  primary_color text not null default '#f97316',
  accent_color text not null default '#1e293b',
  custom_domain text,
  custom_css text,
  support_email text,
  support_phone text,
  footer_text text,
  hide_powered_by boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null unique,
  key_prefix text not null,
  scopes text[] not null default '{}',
  sub_account_id uuid references public.sub_accounts(id) on delete set null,
  created_by text not null default 'admin',
  last_used_at timestamptz,
  expires_at timestamptz,
  is_active boolean not null default true,
  request_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sso_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  sub_account_id uuid not null references public.sub_accounts(id) on delete cascade,
  external_user_id text not null,
  email text not null,
  name text,
  role text not null default 'member',
  used_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.meeting_event_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  duration_minutes integer not null default 30,
  color text not null default '#f97316',
  location text,
  is_active boolean not null default true,
  requires_confirmation boolean not null default false,
  buffer_before integer not null default 0,
  buffer_after integer not null default 15,
  max_bookings_per_day integer,
  questions jsonb default '[]'::jsonb,
  available_days text[] not null default array['mon','tue','wed','thu','fri'],
  available_start text not null default '09:00',
  available_end text not null default '17:00',
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meeting_appointments (
  id uuid primary key default gen_random_uuid(),
  event_type_id uuid not null references public.meeting_event_types(id) on delete cascade,
  guest_name text not null,
  guest_email text not null,
  guest_phone text,
  guest_company text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'America/New_York',
  status text not null default 'confirmed',
  notes text,
  answers jsonb default '{}'::jsonb,
  meeting_link text,
  cancel_reason text,
  lead_id uuid references public.leads(id) on delete set null,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_appointments (like public.meeting_appointments including all);

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text,
  company text,
  referral_code text not null unique,
  commission_rate numeric(5,2) not null default 20.00,
  status text not null default 'active',
  total_referrals integer not null default 0,
  total_converted integer not null default 0,
  total_earned numeric(10,2) not null default 0.00,
  total_paid numeric(10,2) not null default 0.00,
  payout_method text,
  payout_details text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates(id) on delete cascade,
  referred_email text not null,
  referred_name text,
  referred_company text,
  status text not null default 'pending',
  sub_account_id uuid references public.sub_accounts(id) on delete set null,
  deal_value numeric(10,2),
  commission numeric(10,2),
  commission_paid boolean not null default false,
  paid_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  sub_account_id uuid not null unique references public.sub_accounts(id) on delete cascade,
  completed_steps text[] not null default '{}',
  current_step text not null default 'connect_integrations',
  is_completed boolean not null default false,
  completed_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  title text,
  seniority text,
  department text,
  company text,
  company_size text,
  industry text,
  website text,
  linkedin_url text,
  twitter_url text,
  city text,
  state text,
  country text,
  technologies text[] default '{}',
  keywords text[] default '{}',
  email_verified boolean not null default false,
  enriched_at timestamptz,
  source text not null default 'manual',
  saved_to_leads boolean not null default false,
  lead_id uuid references public.leads(id) on delete set null,
  intent_score integer not null default 0,
  last_funding_round text,
  funding_total text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Common indexes
create index if not exists idx_leads_email on public.leads(email);
create index if not exists idx_leads_created_at on public.leads(created_at desc);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_activities_lead_id on public.activities(lead_id);
create index if not exists idx_notes_lead_id on public.notes(lead_id);
create index if not exists idx_contact_tasks_lead_id on public.contact_tasks(lead_id);
create index if not exists idx_sequence_steps_sequence_id on public.sequence_steps(sequence_id);
create index if not exists idx_sequence_enrollments_sequence_id on public.sequence_enrollments(sequence_id);
create index if not exists idx_sequence_enrollments_lead_id on public.sequence_enrollments(lead_id);

-- updated_at triggers
do $$
declare
  t text;
begin
  foreach t in array array[
    'campaigns','forms','email_accounts','sequences','sequence_steps','sequence_enrollments',
    'team_members','integrations','automation_workflows','segments','review_sources','webhooks',
    'sub_accounts','white_label_settings','api_keys','meeting_event_types','meeting_appointments',
    'affiliates','referrals','onboarding_progress','prospects'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', t, t);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- Baseline seed data
insert into public.pipeline_stages (name, color, position)
values
  ('New', '#38bdf8', 1),
  ('Contacted', '#8b5cf6', 2),
  ('Qualified', '#f59e0b', 3),
  ('Proposal', '#3b82f6', 4),
  ('Converted', '#22c55e', 5),
  ('Lost', '#ef4444', 6)
on conflict do nothing;

-- Storage buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('lead-imports', 'lead-imports', false, 52428800, array['text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('attachments', 'attachments', false, 52428800, null),
  ('brand-assets', 'brand-assets', true, 10485760, array['image/png','image/jpeg','image/webp','image/svg+xml','image/x-icon']),
  ('form-uploads', 'form-uploads', false, 52428800, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies for authenticated users. Service role bypasses these.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'authenticated read platform storage') then
    create policy "authenticated read platform storage"
      on storage.objects for select
      to authenticated
      using (bucket_id in ('lead-imports','attachments','brand-assets','form-uploads'));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'authenticated upload platform storage') then
    create policy "authenticated upload platform storage"
      on storage.objects for insert
      to authenticated
      with check (bucket_id in ('lead-imports','attachments','brand-assets','form-uploads'));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'authenticated update platform storage') then
    create policy "authenticated update platform storage"
      on storage.objects for update
      to authenticated
      using (bucket_id in ('lead-imports','attachments','brand-assets','form-uploads'))
      with check (bucket_id in ('lead-imports','attachments','brand-assets','form-uploads'));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'authenticated delete platform storage') then
    create policy "authenticated delete platform storage"
      on storage.objects for delete
      to authenticated
      using (bucket_id in ('lead-imports','attachments','brand-assets','form-uploads'));
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
