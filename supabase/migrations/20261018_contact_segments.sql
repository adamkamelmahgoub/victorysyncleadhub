-- Segment metadata is scoped to the existing VictorySync organization. Leads
-- imported before organization scoping keep their null organization_id.
begin;

alter table public.segments add column if not exists organization_id uuid;
alter table public.segments add column if not exists segment_type text not null default 'smart';
update public.segments set organization_id = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid
where organization_id is null;
alter table public.segments alter column organization_id set not null;
alter table public.segments add constraint segments_type_valid
  check (segment_type in ('smart', 'static'));
create index if not exists segments_organization_id_idx on public.segments(organization_id, created_at desc);
create index if not exists leads_tags_segment_idx on public.leads using gin(tags);
create index if not exists leads_state_segment_idx on public.leads(state);
create index if not exists leads_source_segment_idx on public.leads(source);
create index if not exists crm_activities_deal_segment_idx on public.crm_activities(deal_id, occurred_at desc);
create index if not exists crm_activities_contact_segment_idx on public.crm_activities(contact_id, occurred_at desc);

create table if not exists public.segment_contacts (
  segment_id uuid not null references public.segments(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (segment_id, lead_id)
);
create index if not exists segment_contacts_lead_id_idx on public.segment_contacts(lead_id);

create or replace function public.crm_segment_org_access(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists (select 1 from public.team_members t
      where t.auth_user_id = auth.uid()::text and t.org_id = p_org and t.status = 'active')
    or exists (select 1 from public.profiles p
      where p.id = auth.uid() and p.global_role = 'platform_admin')
  );
$$;
revoke all on function public.crm_segment_org_access(uuid) from public, anon;
grant execute on function public.crm_segment_org_access(uuid) to authenticated;

alter table public.segments enable row level security;
create policy crm_segment_org_guard on public.segments as restrictive for all to authenticated
  using (public.crm_segment_org_access(organization_id))
  with check (public.crm_segment_org_access(organization_id));
alter table public.segment_contacts enable row level security;
grant select, insert, delete on public.segment_contacts to authenticated;
create policy crm_segment_contacts_read on public.segment_contacts for select to authenticated
  using (exists (select 1 from public.segments s where s.id = segment_id));
create policy crm_segment_contacts_insert on public.segment_contacts for insert to authenticated
  with check (exists (select 1 from public.segments s where s.id = segment_id));
create policy crm_segment_contacts_delete on public.segment_contacts for delete to authenticated
  using (exists (select 1 from public.segments s where s.id = segment_id));

-- Conditions are evaluated in PostgreSQL so no page or segment pulls all leads
-- into the browser. A group may contain nested groups and uses AND or OR.
create or replace function public.crm_segment_matches(p_lead public.leads, p_filter jsonb)
returns boolean language plpgsql stable security invoker set search_path = public as $$
declare
  child jsonb;
  field_name text;
  operator_name text;
  value_text text;
  candidate text;
  values_text text[];
  last_activity timestamptz;
  matched boolean;
begin
  if p_filter is null or p_filter = '{}'::jsonb then return true; end if;
  if p_filter ? 'conditions' then
    if p_filter->>'op' = 'or' then
      for child in select value from jsonb_array_elements(coalesce(p_filter->'conditions','[]'::jsonb)) loop
        if public.crm_segment_matches(p_lead,child) then return true; end if;
      end loop;
      return false;
    end if;
    for child in select value from jsonb_array_elements(coalesce(p_filter->'conditions','[]'::jsonb)) loop
      if not public.crm_segment_matches(p_lead,child) then return false; end if;
    end loop;
    return true;
  end if;
  field_name := p_filter->>'field';
  operator_name := coalesce(p_filter->>'operator','eq');
  value_text := p_filter->>'value';
  if field_name = 'tags' then
    select coalesce(array_agg(value), '{}'::text[]) into values_text
      from jsonb_array_elements_text(case when jsonb_typeof(p_filter->'value') = 'array'
        then p_filter->'value' else jsonb_build_array(value_text) end);
    if operator_name = 'has_all' then return coalesce(p_lead.tags @> values_text,false); end if;
    if operator_name = 'has_none' then return not coalesce(p_lead.tags && values_text,false); end if;
    return coalesce(p_lead.tags && values_text,false);
  end if;
  if field_name = 'has_email' then return (nullif(trim(coalesce(p_lead.email,'')),'') is not null) = (value_text = 'true'); end if;
  if field_name = 'has_phone' then return (nullif(trim(coalesce(p_lead.phone,'')),'') is not null) = (value_text = 'true'); end if;
  if field_name = 'enrolled_in_sequence' then
    return exists (select 1 from public.sequence_enrollments e
      where e.lead_id = p_lead.id and (nullif(value_text,'') is null or e.sequence_id::text = value_text));
  end if;
  if field_name = 'last_activity' then
    select max(occurred_at) into last_activity from (
      select a.created_at occurred_at from public.activities a where a.lead_id = p_lead.id
      union all select n.created_at from public.notes n where n.lead_id = p_lead.id
      union all select j.sent_at from public.outreach_email_jobs j where j.lead_id = p_lead.id and j.sent_at is not null
      union all select t.created_at from public.contact_tasks t where t.lead_id = p_lead.id
      union all select a.occurred_at from public.crm_activities a join public.crm_deals d on d.id = a.deal_id where d.source_lead_id = p_lead.id
      union all select a.occurred_at from public.crm_activities a join public.crm_contacts c on c.id = a.contact_id where c.source_lead_id = p_lead.id
    ) events;
    candidate := last_activity::text;
  else
    candidate := case field_name
      when 'first_name' then p_lead.first_name
      when 'last_name' then p_lead.last_name
      when 'name' then concat_ws(' ',nullif(trim(p_lead.first_name),''),nullif(trim(p_lead.last_name),''))
      when 'search' then concat_ws(' ',p_lead.first_name,p_lead.last_name,p_lead.company,p_lead.email,p_lead.phone)
      when 'company' then p_lead.company
      when 'email' then p_lead.email
      when 'phone' then p_lead.phone
      when 'status' then p_lead.status
      when 'source' then p_lead.source
      when 'state' then p_lead.state
      when 'city' then p_lead.custom_fields->>'city'
      when 'created_at' then p_lead.created_at::text
      when 'score' then p_lead.score::text
      else case when field_name like 'custom_fields.%' then
        p_lead.custom_fields->>substring(field_name from 15)
        when field_name like 'other.%' then to_jsonb(p_lead)->>substring(field_name from 7)
        else null end end;
  end if;
  if operator_name = 'is_empty' then return nullif(trim(coalesce(candidate,'')),'') is null; end if;
  if operator_name = 'is_not_empty' then return nullif(trim(coalesce(candidate,'')),'') is not null; end if;
  if operator_name = 'contains' then return coalesce(candidate ilike '%' || value_text || '%',false); end if;
  if operator_name = 'neq' then return candidate is distinct from value_text; end if;
  if operator_name in ('before','after','gte','lte') and field_name in ('created_at','last_activity') then
    if value_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then return false; end if;
    if operator_name = 'before' then return coalesce(candidate::timestamptz < value_text::timestamptz,false); end if;
    if operator_name = 'after' then return coalesce(candidate::timestamptz > value_text::timestamptz,false); end if;
    if operator_name = 'gte' then return coalesce(candidate::timestamptz >= value_text::timestamptz,false); end if;
    return coalesce(candidate::timestamptz <= value_text::timestamptz,false);
  end if;
  if operator_name in ('gte','lte') and field_name = 'score' then
    if value_text !~ '^[0-9]+([.][0-9]+)?$' then return false; end if;
    if operator_name = 'gte' then return coalesce(candidate::numeric >= value_text::numeric,false); end if;
    return coalesce(candidate::numeric <= value_text::numeric,false);
  end if;
  return coalesce(candidate = value_text,false);
end;
$$;

create or replace function public.crm_segment_contacts_page(
  p_organization_id uuid, p_filters jsonb, p_segment_id uuid default null,
  p_segment_type text default 'smart', p_page integer default 1,
  p_limit integer default 50, p_search text default null,
  p_sort text default 'created_at', p_desc boolean default true
) returns jsonb language sql stable security invoker set search_path = public as $$
  with matching as materialized (
    select l.* from public.leads l
    where (l.organization_id = p_organization_id or
      (p_organization_id = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid and l.organization_id is null))
      and (p_search is null or p_search = '' or concat_ws(' ',l.first_name,l.last_name,l.company,l.email,l.phone) ilike '%' || p_search || '%')
      and (case when p_segment_type = 'static' then exists
        (select 1 from public.segment_contacts sc where sc.segment_id = p_segment_id and sc.lead_id = l.id)
        else public.crm_segment_matches(l,p_filters) end)
  ), numbered as (
    select matching.*, row_number() over (order by
      case when p_sort = 'name' and not p_desc then lower(concat_ws(' ',first_name,last_name)) end asc nulls last,
      case when p_sort = 'name' and p_desc then lower(concat_ws(' ',first_name,last_name)) end desc nulls last,
      case when p_sort = 'company' and not p_desc then lower(company) end asc nulls last,
      case when p_sort = 'company' and p_desc then lower(company) end desc nulls last,
      case when p_sort = 'created_at' and not p_desc then created_at end asc nulls last,
      case when p_sort = 'created_at' and p_desc then created_at end desc nulls last,
      id desc) rn from matching
  )
  select jsonb_build_object('total',(select count(*) from matching),
    'page',greatest(p_page,1),'limit',least(greatest(p_limit,1),100),
    'leads',coalesce((select jsonb_agg(to_jsonb(n) - 'rn' order by n.rn)
      from numbered n where n.rn > (greatest(p_page,1)-1)*least(greatest(p_limit,1),100)
      and n.rn <= greatest(p_page,1)*least(greatest(p_limit,1),100)),'[]'::jsonb));
$$;
grant execute on function public.crm_segment_contacts_page(uuid,jsonb,uuid,text,integer,integer,text,text,boolean) to authenticated;

create or replace function public.crm_segment_lead_ids(
  p_organization_id uuid, p_filters jsonb, p_segment_id uuid, p_segment_type text
) returns uuid[] language sql stable security invoker set search_path = public as $$
  select coalesce(array_agg(l.id), '{}'::uuid[]) from public.leads l
  where (l.organization_id = p_organization_id or
    (p_organization_id = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid and l.organization_id is null))
    and (case when p_segment_type = 'static' then exists
      (select 1 from public.segment_contacts sc where sc.segment_id = p_segment_id and sc.lead_id = l.id)
      else public.crm_segment_matches(l,p_filters) end);
$$;
grant execute on function public.crm_segment_lead_ids(uuid,jsonb,uuid,text) to authenticated;

create or replace function public.crm_contact_bulk_action(
  p_organization_id uuid, p_ids uuid[], p_action text, p_value text default null
) returns integer language plpgsql volatile security invoker set search_path = public as $$
declare changed integer;
begin
  if p_action = 'add_tag' and p_value ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$' then
    update public.leads set tags = array_append(coalesce(tags,'{}'::text[]),p_value)
      where id = any(p_ids) and not (coalesce(tags,'{}'::text[]) @> array[p_value])
      and (organization_id = p_organization_id or
        (p_organization_id = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid and organization_id is null));
  elsif p_action = 'remove_tag' and p_value ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$' then
    update public.leads set tags = array_remove(coalesce(tags,'{}'::text[]),p_value)
      where id = any(p_ids) and (organization_id = p_organization_id or
        (p_organization_id = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid and organization_id is null));
  elsif p_action = 'change_status' and p_value in ('new','contacted','qualified','meeting_booked','proposal','converted','lost') then
    update public.leads set status = p_value where id = any(p_ids)
      and (organization_id = p_organization_id or
        (p_organization_id = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid and organization_id is null));
  elsif p_action = 'delete' then
    delete from public.leads where id = any(p_ids)
      and (organization_id = p_organization_id or
        (p_organization_id = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid and organization_id is null));
  else
    raise exception 'Unsupported bulk action or value';
  end if;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
grant execute on function public.crm_contact_bulk_action(uuid,uuid[],text,text) to authenticated;

create or replace function public.crm_contacts_last_activity(p_ids uuid[])
returns table(lead_id uuid, last_activity_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select events.lead_id, max(events.occurred_at) from (
    select a.lead_id,a.created_at occurred_at from public.activities a where a.lead_id = any(p_ids)
    union all select n.lead_id,n.created_at from public.notes n where n.lead_id = any(p_ids)
    union all select t.lead_id,t.created_at from public.contact_tasks t where t.lead_id = any(p_ids)
    union all select j.lead_id,j.sent_at from public.outreach_email_jobs j where j.lead_id = any(p_ids) and j.sent_at is not null
    union all select e.lead_id,e.created_at from public.sequence_enrollments e where e.lead_id = any(p_ids)
    union all select d.source_lead_id,a.occurred_at from public.crm_activities a
      join public.crm_deals d on d.id = a.deal_id where d.source_lead_id = any(p_ids)
    union all select c.source_lead_id,a.occurred_at from public.crm_activities a
      join public.crm_contacts c on c.id = a.contact_id where c.source_lead_id = any(p_ids)
  ) events group by events.lead_id;
$$;
grant execute on function public.crm_contacts_last_activity(uuid[]) to authenticated;

create or replace function public.crm_contact_call_history(p_organization_id uuid, p_phone text)
returns table(id uuid, call_date timestamptz, direction text, status text, duration_seconds integer)
language sql stable security invoker set search_path = public as $$
  select c.id,c.call_date,c.direction,c.status,c.duration_seconds
  from public.call_history c
  where c.org_id = p_organization_id
    and length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) >= 7
    and (
      right(regexp_replace(coalesce(c.from_number,''),'[^0-9]','','g'),10) = right(regexp_replace(p_phone,'[^0-9]','','g'),10)
      or right(regexp_replace(coalesce(c.to_number,''),'[^0-9]','','g'),10) = right(regexp_replace(p_phone,'[^0-9]','','g'),10)
    )
  order by c.call_date desc limit 100;
$$;
grant execute on function public.crm_contact_call_history(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
