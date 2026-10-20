begin;

alter table public.social_profiles add column if not exists review_status text not null default 'pending'
  check (review_status in ('pending','approved','rejected'));
create index if not exists social_profiles_review_queue_idx
  on public.social_profiles(organization_id,created_at desc) where confidence < 70 and review_status = 'pending';

commit;
