begin;

alter table public.crm_companies add column if not exists website text;
alter table public.crm_companies add column if not exists domain text;
alter table public.crm_companies add column if not exists google_place_id text;
alter table public.crm_companies add column if not exists google_maps_url text;
update public.crm_companies set
  website = coalesce(website, nullif(custom_fields->>'website', ''), nullif(custom_fields->>'website_url', '')),
  google_place_id = coalesce(google_place_id, nullif(custom_fields->>'google_place_id', '')),
  google_maps_url = coalesce(google_maps_url, nullif(custom_fields->>'google_maps_url', ''))
where website is null or google_place_id is null or google_maps_url is null;
update public.crm_companies set domain = lower(regexp_replace(split_part(regexp_replace(website, '^https?://', '', 'i'), '/', 1), '^www\.', '', 'i'))
where domain is null and website ~* '^https?://[^/]+';
create index if not exists crm_companies_domain_idx on public.crm_companies(organization_id, domain);

create or replace function public.social_org_access(p_organization_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.wf_role() = 'admin' or exists (
    select 1 from public.org_users ou where ou.org_id = p_organization_id and ou.user_id = auth.uid()
  );
$$;
revoke all on function public.social_org_access(uuid) from public, anon;
grant execute on function public.social_org_access(uuid) to authenticated;

create or replace function public.social_entity_access(p_organization_id uuid, p_entity_type text, p_entity_id uuid, p_write boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_entity_type
    when 'contact' then public.social_org_access(p_organization_id) and public.wf_role() = 'admin' and exists
      (select 1 from public.crm_contacts c where c.id = p_entity_id and c.organization_id = p_organization_id)
    when 'company' then public.social_org_access(p_organization_id) and public.wf_role() = 'admin' and exists
      (select 1 from public.crm_companies c where c.id = p_entity_id and c.organization_id = p_organization_id)
    when 'lead' then public.social_org_access(p_organization_id) and exists
      (select 1 from public.leads l where l.id = p_entity_id
        and (l.organization_id = p_organization_id or (l.organization_id is null and p_organization_id = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid))
        and case when p_write then public.crm_lead_can_write(l.client_account_id, l.custom_fields)
                 else public.crm_lead_can_read(l.client_account_id, l.custom_fields) end)
    else false end;
$$;
revoke all on function public.social_entity_access(uuid,text,uuid,boolean) from public, anon;
grant execute on function public.social_entity_access(uuid,text,uuid,boolean) to authenticated;

create table public.social_profiles (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  entity_type text not null check(entity_type in ('contact','company','lead')), entity_id uuid not null,
  platform text not null check(platform in ('instagram','facebook','linkedin_person','linkedin_company','x','tiktok','youtube','threads','whatsapp','yelp','nextdoor','angi','other')),
  handle text not null, normalized_handle text not null, profile_url text,
  platform_user_id text, is_primary boolean not null default false, verified boolean not null default false,
  confidence integer not null default 100 check(confidence between 0 and 100),
  source text not null default 'manual' check(source in ('manual','import','website_scrape','places','enrichment','webhook')),
  follower_count bigint check(follower_count >= 0), last_checked_at timestamptz, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id, platform, normalized_handle, entity_type, entity_id),
  check(not is_primary or confidence >= 70)
);
create index social_profiles_handle_idx on public.social_profiles(platform, normalized_handle);
create index social_profiles_user_idx on public.social_profiles(platform, platform_user_id) where platform_user_id is not null;
create index social_profiles_entity_idx on public.social_profiles(organization_id, entity_type, entity_id);
create unique index social_profiles_one_primary_idx on public.social_profiles(organization_id, entity_type, entity_id, platform) where is_primary;
alter table public.social_profiles enable row level security;
create policy social_profiles_read on public.social_profiles for select to authenticated
  using(public.social_entity_access(organization_id,entity_type,entity_id,false));
create policy social_profiles_insert on public.social_profiles for insert to authenticated
  with check(public.social_entity_access(organization_id,entity_type,entity_id,true));
create policy social_profiles_update on public.social_profiles for update to authenticated
  using(public.social_entity_access(organization_id,entity_type,entity_id,true))
  with check(public.social_entity_access(organization_id,entity_type,entity_id,true));
create policy social_profiles_delete on public.social_profiles for delete to authenticated
  using(public.social_entity_access(organization_id,entity_type,entity_id,true));
grant select,insert,update,delete on public.social_profiles to authenticated;

create view public.social_primary_handles with (security_invoker=true) as
select organization_id,entity_type,entity_id,
  max(normalized_handle) filter(where platform='instagram') instagram,
  max(normalized_handle) filter(where platform='facebook') facebook,
  max(normalized_handle) filter(where platform in ('linkedin_person','linkedin_company')) linkedin,
  max(normalized_handle) filter(where platform='x') x,
  max(normalized_handle) filter(where platform='tiktok') tiktok,
  max(normalized_handle) filter(where platform='youtube') youtube,
  max(normalized_handle) filter(where platform='threads') threads
from public.social_profiles where is_primary group by organization_id,entity_type,entity_id;
grant select on public.social_primary_handles to authenticated;

create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  platform text not null check(platform in ('instagram','facebook','whatsapp','x','linkedin','tiktok','nextdoor','yelp','threads','email','sms','other')),
  label text not null, external_account_id text, username text, scopes text[] not null default '{}',
  status text not null default 'active' check(status in ('active','expired','error','disconnected')),
  token_expires_at timestamptz, daily_new_dm_cap integer not null default 10 check(daily_new_dm_cap between 0 and 1000),
  daily_followup_cap integer not null default 20 check(daily_followup_cap between 0 and 1000),
  warmup_enabled boolean not null default true, warmup_start_at timestamptz default now(), warmup_daily_increment integer not null default 2,
  last_webhook_at timestamptz, last_error text, created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,platform,external_account_id)
);
create table public.connected_account_secrets (
  connected_account_id uuid primary key references public.connected_accounts(id) on delete cascade,
  encrypted_access_token text, encrypted_refresh_token text, updated_at timestamptz not null default now()
);
alter table public.connected_accounts enable row level security;
alter table public.connected_account_secrets enable row level security;
create policy connected_accounts_admin on public.connected_accounts for all to authenticated
  using(public.social_org_access(organization_id) and (public.wf_role()='admin' or auth.jwt()->>'crm_role' in ('owner','admin')))
  with check(public.social_org_access(organization_id) and (public.wf_role()='admin' or auth.jwt()->>'crm_role' in ('owner','admin')));
grant select,insert,update,delete on public.connected_accounts to authenticated;
revoke all on public.connected_account_secrets from public,anon,authenticated;

create table public.conversations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  channel text not null check(channel in ('instagram','facebook','whatsapp','x','linkedin','email','sms','other')),
  connected_account_id uuid references public.connected_accounts(id), external_thread_id text,
  participant_platform_id text, participant_handle text, contact_id uuid references public.crm_contacts(id),
  company_id uuid references public.crm_companies(id), lead_id uuid references public.leads(id),
  status text not null default 'open' check(status in ('open','snoozed','closed')), assigned_to uuid,
  intent text not null default 'unknown' check(intent in ('interested','not_now','not_interested','wrong_person','ooo','unsubscribe','unknown')),
  unread_count integer not null default 0 check(unread_count>=0), last_inbound_at timestamptz, last_outbound_at timestamptz,
  last_message_at timestamptz, reply_window_expires_at timestamptz, snoozed_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organization_id,channel,connected_account_id,external_thread_id)
);
create index conversations_inbox_idx on public.conversations(organization_id,last_message_at desc);
create index conversations_person_idx on public.conversations(organization_id,lead_id,contact_id);
alter table public.conversations enable row level security;
create policy conversations_admin on public.conversations for all to authenticated
  using(public.social_org_access(organization_id) and public.wf_role()='admin')
  with check(public.social_org_access(organization_id) and public.wf_role()='admin');
grant select,insert,update,delete on public.conversations to authenticated;

create table public.messages (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  conversation_id uuid not null references public.conversations(id), direction text not null check(direction in ('inbound','outbound')),
  body text not null default '', attachments jsonb not null default '[]'::jsonb, external_message_id text,
  sent_via text check(sent_via in ('api','manual_assisted','echo')), sent_by uuid,
  status text not null default 'sent' check(status in ('queued','sent','delivered','read','failed')),
  error text, created_at timestamptz not null default now(),
  unique(conversation_id,external_message_id)
);
create index messages_conversation_idx on public.messages(conversation_id,created_at);
alter table public.messages enable row level security;
create policy messages_admin on public.messages for all to authenticated
  using(public.wf_role()='admin' and exists(select 1 from public.conversations c where c.id=conversation_id and c.organization_id=organization_id and public.social_org_access(c.organization_id)))
  with check(public.wf_role()='admin' and exists(select 1 from public.conversations c where c.id=conversation_id and c.organization_id=organization_id and public.social_org_access(c.organization_id)));
grant select,insert,update on public.messages to authenticated;

create table public.dm_templates (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  name text not null, body text not null, allow_spintax boolean not null default false,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.dm_campaigns (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  name text not null, status text not null default 'draft' check(status in ('draft','active','paused','archived')),
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.dm_campaign_steps (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  campaign_id uuid not null references public.dm_campaigns(id), position integer not null check(position>0),
  day_offset integer not null check(day_offset>=0), channel text not null,
  step_type text not null check(step_type in ('follow','engage_post','dm','followup_dm','email','call_task')),
  template_id uuid references public.dm_templates(id), created_at timestamptz not null default now(),
  unique(campaign_id,position)
);
create table public.dm_enrollments (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  campaign_id uuid not null references public.dm_campaigns(id), entity_type text not null check(entity_type in ('contact','company','lead')),
  entity_id uuid not null, connected_account_id uuid references public.connected_accounts(id),
  state text not null default 'queued' check(state in ('queued','step_due','sent','replied','completed','stopped','suppressed')),
  current_step integer not null default 1, enrolled_at timestamptz not null default now(), next_due_at timestamptz,
  stopped_at timestamptz, stop_reason text, created_by uuid, unique(campaign_id,entity_type,entity_id)
);
create table public.dm_tasks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  enrollment_id uuid not null references public.dm_enrollments(id), step_id uuid not null references public.dm_campaign_steps(id),
  connected_account_id uuid references public.connected_accounts(id), due_at timestamptz not null,
  status text not null default 'due' check(status in ('due','sent','followed','engaged','skipped','profile_not_found','wrong_person','expired')),
  acted_at timestamptz, acted_by uuid, message_id uuid references public.messages(id),
  created_at timestamptz not null default now(), unique(enrollment_id,step_id)
);
create index dm_tasks_today_idx on public.dm_tasks(organization_id,connected_account_id,due_at) where status='due';
do $$ declare t text; begin
  foreach t in array array['dm_templates','dm_campaigns','dm_campaign_steps','dm_enrollments','dm_tasks'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for all to authenticated using (public.social_org_access(organization_id) and public.wf_role()=''admin'') with check (public.social_org_access(organization_id) and public.wf_role()=''admin'')',t||'_admin',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  end loop;
end $$;

create table public.social_webhook_events (
  id uuid primary key default gen_random_uuid(), provider text not null, organization_id uuid,
  inbox_id bigint references public.webhook_inbox(id), event_key text not null,
  payload jsonb not null, status text not null default 'queued' check(status in ('queued','processing','processed','dead')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  error text, created_at timestamptz not null default now(), processed_at timestamptz,
  unique(provider,event_key)
);
create index social_webhook_due_idx on public.social_webhook_events(next_attempt_at) where status='queued';
alter table public.social_webhook_events enable row level security;
revoke all on public.social_webhook_events from public,anon,authenticated;

create or replace function public.is_suppressed(p_organization_id uuid, p_entity_type text, p_entity_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_email text; v_phone text; v_lead_id uuid; v_company_id uuid;
begin
  if not public.social_entity_access(p_organization_id,p_entity_type,p_entity_id,false) then return true; end if;
  if p_entity_type='lead' then
    select lower(l.email),l.normalized_phone,l.id into v_email,v_phone,v_lead_id from public.leads l where l.id=p_entity_id;
  elsif p_entity_type='contact' then
    select lower(c.email),c.phone,c.source_lead_id,c.company_id into v_email,v_phone,v_lead_id,v_company_id from public.crm_contacts c where c.id=p_entity_id;
  else
    v_company_id:=p_entity_id;
  end if;
  return exists(select 1 from public.leads l where l.id=v_lead_id and (l.dnc or l.disposition::text in ('dnc','not_interested')))
    or exists(select 1 from public.outreach_suppressions s where
      (s.identity_type='email' and s.identity_value=v_email) or
      (s.identity_type='phone' and s.identity_value=regexp_replace(coalesce(v_phone,''),'[^0-9]','','g')))
    or exists(select 1 from public.conversations c where c.organization_id=p_organization_id and c.intent in ('unsubscribe','not_interested')
      and (c.lead_id=v_lead_id or c.contact_id=p_entity_id and p_entity_type='contact' or c.company_id=v_company_id))
    or exists(select 1 from public.crm_contacts c join public.leads l on l.id=c.source_lead_id where c.company_id=v_company_id and l.dnc);
end $$;
revoke all on function public.is_suppressed(uuid,text,uuid) from public,anon;
grant execute on function public.is_suppressed(uuid,text,uuid) to authenticated;

commit;
