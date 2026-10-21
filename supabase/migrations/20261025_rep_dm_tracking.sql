begin;

alter table public.connected_accounts add column if not exists owner_user_id uuid;
alter table public.connected_accounts add column if not exists provider text;
alter table public.connected_accounts add column if not exists timezone text not null default 'America/New_York';
alter table public.connected_accounts add column if not exists health text not null default 'healthy';
alter table public.connected_accounts add column if not exists last_sync_at timestamptz;
alter table public.connected_accounts add column if not exists consent_signed_at timestamptz;
alter table public.connected_accounts add column if not exists consent_version text;
alter table public.connected_accounts add column if not exists connected_handle text;
alter table public.connected_accounts add column if not exists connected_provider_user_id text;
update public.connected_accounts set owner_user_id=created_by where owner_user_id is null and created_by is not null;
create index if not exists connected_accounts_rep_idx on public.connected_accounts(organization_id,owner_user_id,platform);

alter table public.leads add column if not exists owner_rep_id uuid;
alter table public.leads add column if not exists outreach_platform text;
alter table public.leads add column if not exists outreach_account_id uuid;
alter table public.leads add column if not exists owner_assigned_at timestamptz;
alter table public.leads add column if not exists first_touch_at timestamptz;
alter table public.leads add column if not exists last_touch_at timestamptz;
alter table public.leads add column if not exists first_reply_at timestamptz;
create index if not exists leads_social_rep_idx on public.leads(owner_rep_id,owner_assigned_at desc);

alter table public.social_profiles add column if not exists provider_resolved_at timestamptz;
alter table public.social_profiles add column if not exists resolve_error text;

alter table public.conversations add column if not exists match_status text not null default 'unmatched';
alter table public.conversations add column if not exists match_confidence numeric(4,3);
alter table public.conversations add column if not exists matched_at timestamptz;
alter table public.conversations add column if not exists matched_by_user_id uuid;
update public.conversations set match_status='matched' where match_status='unmatched'
  and (lead_id is not null or contact_id is not null or company_id is not null or legacy_company_id is not null);
update public.conversations c set assigned_to=a.owner_user_id from public.connected_accounts a
  where c.connected_account_id=a.id and c.assigned_to is null and a.owner_user_id is not null and a.connection_mode='manual';
create index if not exists conversations_match_idx on public.conversations(organization_id,match_status,last_message_at desc);

alter table public.messages add column if not exists sender_provider_id text;
alter table public.messages add column if not exists template_id uuid;
alter table public.messages add column if not exists variant_key text;
alter table public.messages add column if not exists task_id uuid;
alter table public.messages add column if not exists enrollment_id uuid;
alter table public.messages add column if not exists matched_by text;

alter table public.dm_tasks add column if not exists task_kind text;
alter table public.dm_tasks add column if not exists rendered_text text;
alter table public.dm_tasks add column if not exists completed_via text;
alter table public.dm_tasks add column if not exists skip_reason text;

create table if not exists public.social_unipile_config (
  organization_id uuid primary key references public.organizations(id),
  api_key_vault_id uuid not null,
  webhook_secret_vault_id uuid,
  configured_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.social_unipile_config enable row level security;
revoke all on public.social_unipile_config from public,anon,authenticated;

create table if not exists public.social_unipile_connect_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  account_id uuid not null references public.connected_accounts(id),
  rep_user_id uuid not null,
  platform text not null check(platform in ('instagram','linkedin')),
  state_hash text not null unique,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_unipile_attempts_rep on public.social_unipile_connect_attempts(organization_id,rep_user_id,created_at desc);
alter table public.social_unipile_connect_attempts enable row level security;
revoke all on public.social_unipile_connect_attempts from public,anon,authenticated;

create table if not exists public.rep_territories (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  rep_user_id uuid not null, state_codes text[] not null default '{}', trades text[] not null default '{}',
  platforms text[] not null default '{}', priority integer not null default 100, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists rep_territories_rep on public.rep_territories(organization_id,rep_user_id,priority);
alter table public.rep_territories enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='rep_territories' and policyname='rep_territories_admin') then
    create policy rep_territories_admin on public.rep_territories for all to authenticated
      using(public.social_org_access(organization_id) and public.wf_role()='admin')
      with check(public.social_org_access(organization_id) and public.wf_role()='admin');
  end if;
end $$;
grant select,insert,update,delete on public.rep_territories to authenticated;

create or replace function public.has_social_perm(p_organization_id uuid,p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_organization_id='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid and (
    public.wf_role()='admin' or exists(select 1 from public.team_members m
      left join public.social_team_permissions p on p.team_member_id=m.id
      where m.org_id=p_organization_id and m.auth_user_id=auth.uid()::text and m.status='active'
        and m.role not in ('client','viewer') and m.client_account_id is null
        and (m.role='owner' or p_permission=any(coalesce(p.permissions,'{}'::text[])))));
$$;
revoke all on function public.has_social_perm(uuid,text) from public,anon;
grant execute on function public.has_social_perm(uuid,text) to authenticated;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='connected_accounts' and policyname='connected_accounts_rep_read') then
    create policy connected_accounts_rep_read on public.connected_accounts for select to authenticated
      using(owner_user_id=auth.uid() and (public.has_social_perm(organization_id,'accounts_manage') or public.has_social_perm(organization_id,'inbox_view')));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='conversations' and policyname='conversations_rep_read') then
    create policy conversations_rep_read on public.conversations for select to authenticated
      using(public.has_social_perm(organization_id,'inbox_view') and exists(select 1 from public.connected_accounts a
        where a.id=connected_account_id and a.owner_user_id=auth.uid()));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='messages' and policyname='messages_rep_read') then
    create policy messages_rep_read on public.messages for select to authenticated
      using(public.has_social_perm(organization_id,'inbox_view') and exists(select 1 from public.conversations c
        join public.connected_accounts a on a.id=c.connected_account_id
        where c.id=public.messages.conversation_id and c.organization_id=public.messages.organization_id and a.owner_user_id=auth.uid()));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='dm_tasks' and policyname='dm_tasks_rep_read') then
    create policy dm_tasks_rep_read on public.dm_tasks for select to authenticated
      using(public.has_social_perm(organization_id,'queue_work') and exists(select 1 from public.connected_accounts a
        where a.id=connected_account_id and a.owner_user_id=auth.uid()));
  end if;
end $$;

alter policy connected_accounts_rep_read on public.connected_accounts
  using(owner_user_id=auth.uid() and (public.has_social_perm(organization_id,'accounts_manage') or public.has_social_perm(organization_id,'inbox_view')));

create or replace function public.social_reserve_reply(p_conversation_id uuid,p_sent_by uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_thread public.conversations%rowtype; v_account public.connected_accounts%rowtype; v_count integer; v_attempt uuid;
declare v_type text; v_entity uuid;
begin
  select * into v_thread from public.conversations where id=p_conversation_id for update;
  if v_thread.id is null or v_thread.channel not in ('facebook','instagram','whatsapp','linkedin') or v_thread.connected_account_id is null then
    raise exception 'API reply is unavailable for this conversation'; end if;
  if v_thread.last_inbound_at is null or v_thread.last_inbound_at <= now()-interval '24 hours' then
    raise exception 'The 24-hour reply window is closed'; end if;
  if not exists(select 1 from public.messages where conversation_id=v_thread.id and direction='inbound') then
    raise exception 'API reply requires an inbound message from this person'; end if;
  if v_thread.participant_platform_id is null then raise exception 'Recipient platform ID is missing'; end if;
  select * into v_account from public.connected_accounts where id=v_thread.connected_account_id for update;
  if v_account.id is null or v_account.organization_id<>v_thread.organization_id or v_account.status<>'active' or
    (v_account.token_expires_at is not null and v_account.token_expires_at<=now()) or
    (v_thread.channel='linkedin' and v_account.provider is distinct from 'unipile') then
    raise exception 'Connected account is inactive or unsupported'; end if;
  v_type:=case when v_thread.lead_id is not null then 'lead' when v_thread.contact_id is not null then 'contact'
               when v_thread.company_id is not null or v_thread.legacy_company_id is not null then 'company' else null end;
  v_entity:=coalesce(v_thread.lead_id,v_thread.contact_id,v_thread.company_id,v_thread.legacy_company_id);
  if v_type is null or public.social_is_suppressed_internal(v_thread.organization_id,v_type,v_entity) then
    raise exception 'Recipient is unmatched or suppressed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_account.id::text,0));
  select count(*) into v_count from public.social_send_attempts where connected_account_id=v_account.id
    and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' and status in ('reserved','sent');
  if v_count>=v_account.daily_followup_cap then raise exception 'Daily account reply cap reached'; end if;
  insert into public.social_send_attempts(organization_id,connected_account_id,conversation_id,sent_by)
  values(v_thread.organization_id,v_account.id,v_thread.id,p_sent_by) returning id into v_attempt;
  return v_attempt;
end $$;
revoke all on function public.social_reserve_reply(uuid,uuid) from public,anon,authenticated;
grant execute on function public.social_reserve_reply(uuid,uuid) to service_role;

commit;
