begin;

alter table public.landing_pages
  add column if not exists draft_sections jsonb,
  add column if not exists draft_theme jsonb,
  add column if not exists published_sections jsonb,
  add column if not exists published_theme jsonb,
  add column if not exists template_key text,
  add column if not exists custom_domain text,
  add column if not exists subdomain text,
  add column if not exists tracking jsonb not null default '{}'::jsonb,
  add column if not exists social_image_url text,
  add column if not exists variant_of uuid references public.landing_pages(id) on delete set null,
  add column if not exists traffic_split integer not null default 50,
  add column if not exists version integer not null default 0;

update public.landing_pages set
  draft_sections=coalesce(draft_sections,sections,'[]'::jsonb),
  draft_theme=coalesce(draft_theme,theme,'{}'::jsonb),
  published_sections=case when status='published' then coalesce(published_sections,sections,'[]'::jsonb) else published_sections end,
  published_theme=case when status='published' then coalesce(published_theme,theme,'{}'::jsonb) else published_theme end
where draft_sections is null or draft_theme is null or
  (status='published' and (published_sections is null or published_theme is null));

create table if not exists public.landing_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.landing_pages(id) on delete cascade,
  version integer not null,
  sections jsonb not null,
  theme jsonb not null,
  published_by uuid,
  published_at timestamptz not null default now(),
  note text,
  unique(page_id,version)
);
create index if not exists landing_page_versions_page_idx on public.landing_page_versions(page_id,version desc);
alter table public.landing_page_versions enable row level security;
drop policy if exists landing_page_versions_read on public.landing_page_versions;
create policy landing_page_versions_read on public.landing_page_versions for select to authenticated
  using (exists(select 1 from public.landing_pages p where p.id=page_id and
    (public.is_agency_admin() or (p.client_account_id is not null and public.can_access_account(p.client_account_id)))));
drop policy if exists landing_page_versions_write on public.landing_page_versions;
create policy landing_page_versions_write on public.landing_page_versions for all to authenticated
  using (exists(select 1 from public.landing_pages p where p.id=page_id and
    (public.is_agency_admin() or
      (p.client_account_id is not null and public.auth_role()='agency_staff' and exists
        (select 1 from public.sub_account_assignments a where a.sub_account_id=p.client_account_id
          and a.user_id=auth.uid() and a.role_in_account in ('account_manager','marketing'))) or
      (p.client_account_id is not null and public.auth_role()='client_owner'
        and public.can_access_account(p.client_account_id) and public.client_feature_enabled('client_page_editing')))))
  with check (exists(select 1 from public.landing_pages p where p.id=page_id and
    (public.is_agency_admin() or
      (p.client_account_id is not null and public.auth_role()='agency_staff' and exists
        (select 1 from public.sub_account_assignments a where a.sub_account_id=p.client_account_id
          and a.user_id=auth.uid() and a.role_in_account in ('account_manager','marketing'))) or
      (p.client_account_id is not null and public.auth_role()='client_owner'
        and public.can_access_account(p.client_account_id) and public.client_feature_enabled('client_page_editing')))));

create table if not exists public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_account_id uuid references public.sub_accounts(id) on delete cascade,
  page_id uuid references public.landing_pages(id) on delete set null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_cents numeric(12,4) not null default 0,
  action text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_user_month_idx on public.ai_requests(user_id,created_at desc);
alter table public.ai_requests enable row level security;
drop policy if exists ai_requests_read on public.ai_requests;
create policy ai_requests_read on public.ai_requests for select to authenticated
  using (user_id=auth.uid() or public.is_agency_admin());

create unique index if not exists landing_pages_custom_domain_idx on public.landing_pages(lower(custom_domain)) where custom_domain is not null;
create unique index if not exists landing_pages_subdomain_idx on public.landing_pages(lower(subdomain)) where subdomain is not null;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('landing-media','landing-media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
alter table public.landing_page_events add column if not exists variant_page_id uuid references public.landing_pages(id) on delete set null;
alter table public.landing_page_events drop constraint if exists landing_page_events_event_type_check;
alter table public.landing_page_events add constraint landing_page_events_event_type_check
  check(event_type in ('view','form_start','form_submit','phone_click'));

notify pgrst, 'reload schema';
commit;
