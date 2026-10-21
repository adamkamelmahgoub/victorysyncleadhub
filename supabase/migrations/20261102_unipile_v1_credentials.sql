begin;
alter table public.social_unipile_config add column if not exists api_base_url text;
alter table public.social_unipile_config add column if not exists api_version text not null default 'v2';
alter table public.social_unipile_config add constraint social_unipile_api_version_check check(api_version in ('v1','v2'));
commit;
