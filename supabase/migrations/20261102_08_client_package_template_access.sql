begin;

-- Templates are read only inside security definer provisioning functions.
-- There is no client or anonymous direct table access path.
revoke all on table public.client_package_templates from public, anon, authenticated;
alter table public.client_package_templates enable row level security;

commit;
