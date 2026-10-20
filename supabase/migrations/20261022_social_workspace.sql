begin;

create table public.social_oauth_apps (
  organization_id uuid primary key references public.organizations(id),
  app_id text not null,
  app_secret_vault_id uuid not null,
  verify_token_vault_id uuid not null,
  graph_version text not null check(graph_version ~ '^v[0-9]+\.[0-9]+$'),
  configured_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.social_oauth_apps enable row level security;
revoke all on public.social_oauth_apps from public,anon,authenticated;

create table public.social_oauth_states (
  state_hash text primary key,
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null,
  redirect_uri text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index social_oauth_states_expiry on public.social_oauth_states(expires_at);
alter table public.social_oauth_states enable row level security;
revoke all on public.social_oauth_states from public,anon,authenticated;

alter table public.connected_account_secrets add column if not exists vault_access_token_id uuid;
alter table public.connected_account_secrets add column if not exists vault_refresh_token_id uuid;

create table public.social_team_permissions (
  team_member_id uuid primary key references public.team_members(id),
  organization_id uuid not null references public.organizations(id),
  permissions text[] not null default '{}',
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint social_team_permissions_values check (
    permissions <@ array['inbox_view','inbox_reply','queue_work','campaign_manage',
      'socials_manage','accounts_manage','posts_create','posts_publish','reports_view','mcp_use']::text[])
);
create index social_team_permissions_org on public.social_team_permissions(organization_id);
alter table public.social_team_permissions enable row level security;
create policy social_team_permissions_admin on public.social_team_permissions for all to authenticated
  using (public.social_org_access(organization_id) and public.wf_role()='admin')
  with check (public.social_org_access(organization_id) and public.wf_role()='admin');
grant select,insert,update on public.social_team_permissions to authenticated;

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  body text not null default '',
  media_url text,
  media_type text check(media_type in ('image','video')),
  status text not null default 'draft' check(status in ('draft','scheduled','publishing','published','failed')),
  scheduled_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_posts_schedule check(status <> 'scheduled' or scheduled_at is not null)
);
create index social_posts_due on public.social_posts(scheduled_at) where status='scheduled';
alter table public.social_posts enable row level security;
create policy social_posts_admin on public.social_posts for all to authenticated
  using (public.social_org_access(organization_id) and public.wf_role()='admin')
  with check (public.social_org_access(organization_id) and public.wf_role()='admin');
grant select,insert,update on public.social_posts to authenticated;

create table public.social_post_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  post_id uuid not null references public.social_posts(id),
  connected_account_id uuid not null references public.connected_accounts(id),
  status text not null default 'scheduled' check(status in ('scheduled','publishing','published','failed','manual_required')),
  provider_post_id text,
  permalink text,
  metrics jsonb not null default '{}'::jsonb,
  last_metrics_at timestamptz,
  published_at timestamptz,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(post_id,connected_account_id)
);
create index social_post_targets_account on public.social_post_targets(connected_account_id,published_at desc);
alter table public.social_post_targets enable row level security;
create policy social_post_targets_admin on public.social_post_targets for all to authenticated
  using (public.social_org_access(organization_id) and public.wf_role()='admin')
  with check (public.social_org_access(organization_id) and public.wf_role()='admin');
grant select,insert,update on public.social_post_targets to authenticated;

create table public.social_workspace_audit (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  actor_id uuid,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index social_workspace_audit_org on public.social_workspace_audit(organization_id,created_at desc);
alter table public.social_workspace_audit enable row level security;
create policy social_workspace_audit_admin on public.social_workspace_audit for select to authenticated
  using (public.social_org_access(organization_id) and public.wf_role()='admin');
grant select on public.social_workspace_audit to authenticated;

create function public.social_workspace_scope_guard() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_table_name='social_team_permissions' and not exists (
    select 1 from public.team_members m where m.id=new.team_member_id
      and m.org_id=new.organization_id and m.role not in ('client','viewer')
      and m.client_account_id is null) then
    raise exception 'Social access is limited to internal team members in this organization';
  end if;
  if tg_table_name='social_post_targets' and (not exists (
    select 1 from public.social_posts p where p.id=new.post_id and p.organization_id=new.organization_id)
    or not exists (
    select 1 from public.connected_accounts a where a.id=new.connected_account_id
      and a.organization_id=new.organization_id)) then
    raise exception 'Post target must use a post and account from the same organization';
  end if;
  return new;
end $$;
create trigger social_team_permissions_scope before insert or update on public.social_team_permissions
  for each row execute function public.social_workspace_scope_guard();
create trigger social_post_targets_scope before insert or update on public.social_post_targets
  for each row execute function public.social_workspace_scope_guard();

commit;
