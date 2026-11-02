begin;

create or replace function public.portal_pages(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('pages') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
    into result from (
      select m.id,coalesce(p.draft_name,m.title) as name,
        coalesce(p.draft_slug,m.slug) as slug,p.slug as public_slug,
        coalesce(p.status,m.status) as status,
        coalesce(p.draft_seo_description,m.seo_description) as seo_description,
        coalesce(p.draft_sections,m.sections) as sections,
        case when p.id is null then m.theme else jsonb_build_object(
          'background',coalesce(p.draft_theme->>'background',m.theme->>'background','#ffffff'),
          'foreground',coalesce(p.draft_theme->>'text',m.theme->>'foreground','#172033'),
          'accent',coalesce(p.draft_theme->>'primary',m.theme->>'accent','#285ce6'),
          'font',case when p.draft_theme->>'font'='serif' then 'serif' else 'sans' end
        ) end as theme,
        m.created_at,m.updated_at
      from public.marketing_landing_pages m
      left join public.landing_pages p on p.id=m.canonical_page_id
        and p.client_account_id=m.client_account_id
      where m.client_account_id=p_account
      order by m.created_at desc limit 100
    ) x;
  return result;
end $$;
revoke all on function public.portal_pages(uuid) from public, anon;
grant execute on function public.portal_pages(uuid) to authenticated;

create or replace function public.portal_page_stats(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('pages') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.title),'[]'::jsonb)
    into result from (
      select m.id,coalesce(p.draft_name,m.title) as title,
        coalesce(p.slug,m.slug) as slug,coalesce(p.status,m.status) as status,
        (select count(*) from public.landing_page_events e
          where e.landing_page_id=p.id and e.event_type='view')
        + (select count(*) from public.marketing_landing_page_events e
          where e.page_id=m.id and e.event_type='view' and e.legacy_event_id is null) as visits,
        (select count(*) from public.form_submissions s
          where s.client_account_id=p_account
            and (s.landing_page_id=p.id or s.marketing_page_id=m.id)) as leads
      from public.marketing_landing_pages m
      left join public.landing_pages p on p.id=m.canonical_page_id
        and p.client_account_id=m.client_account_id
      where m.client_account_id=p_account
    ) x;
  return result;
end $$;
revoke all on function public.portal_page_stats(uuid) from public, anon;
grant execute on function public.portal_page_stats(uuid) to authenticated;

create or replace function public.portal_save_page(p_account uuid,p_page uuid,p_title text,
  p_slug text,p_sections jsonb,p_theme jsonb,p_seo_description text,p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.marketing_landing_pages%rowtype;
begin
  if not public.portal_page_edit_allowed(p_account) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if length(p_title) not between 1 and 180 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(p_slug)>100 or jsonb_typeof(p_sections)<>'array'
    or jsonb_array_length(p_sections)>40 or jsonb_typeof(p_theme)<>'object'
    or p_status <> 'draft' then
    raise exception 'Save a draft first, then publish' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_sections) as section(value)
    where section.value->>'type'='form' and nullif(section.value->>'formId','') is not null
      and not exists(select 1 from public.forms f
        where f.id::text=section.value->>'formId' and f.client_account_id=p_account)) then
    raise exception 'Form does not belong to this account' using errcode='22023';
  end if;
  if p_page is null then
    insert into public.marketing_landing_pages(client_account_id,organization_id,title,slug,
      sections,theme,seo_description,status)
    select p_account,a.organization_id,p_title,p_slug,p_sections,p_theme,
      left(coalesce(p_seo_description,''),320),'draft' from public.sub_accounts a where a.id=p_account
    returning * into saved;
  else
    update public.marketing_landing_pages set title=p_title,slug=p_slug,sections=p_sections,
      theme=p_theme,seo_description=left(coalesce(p_seo_description,''),320),
      status='draft',updated_at=now()
    where id=p_page and client_account_id=p_account returning * into saved;
  end if;
  if saved.id is null then raise exception 'Page not found' using errcode='02000'; end if;
  if saved.canonical_page_id is null then
    raise exception 'Canonical page link is unavailable' using errcode='23503';
  end if;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,
    event_type,action,target)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    p_account::text,'page','draft_saved',saved.id::text);
  return to_jsonb(saved);
end $$;
revoke all on function public.portal_save_page(uuid,uuid,text,text,jsonb,jsonb,text,text) from public, anon;
grant execute on function public.portal_save_page(uuid,uuid,text,text,jsonb,jsonb,text,text) to authenticated;

create or replace function public.portal_publish_page(p_account uuid,p_page uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare legacy public.marketing_landing_pages%rowtype;
declare published public.landing_pages%rowtype;
begin
  if not public.portal_page_edit_allowed(p_account) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select * into legacy from public.marketing_landing_pages
    where id=p_page and client_account_id=p_account for update;
  if legacy.id is null or legacy.canonical_page_id is null then
    raise exception 'Page not found' using errcode='02000';
  end if;
  update public.landing_pages p set
    name=coalesce(p.draft_name,p.name),slug=coalesce(p.draft_slug,p.slug),
    seo_title=coalesce(p.draft_name,p.name),
    seo_description=coalesce(p.draft_seo_description,p.seo_description),
    sections=coalesce(p.draft_sections,p.sections),
    theme=coalesce(p.draft_theme,p.theme),
    published_sections=coalesce(p.draft_sections,p.sections),
    published_theme=coalesce(p.draft_theme,p.theme),
    form_id=(select f.id from public.forms f where f.client_account_id=p_account
      and exists(select 1 from jsonb_array_elements(legacy.sections) s
        where s->>'formId'=f.id::text) limit 1),
    status='published',published_at=now(),version=p.version+1,updated_at=now()
  where p.id=legacy.canonical_page_id and p.client_account_id=p_account
    and jsonb_typeof(coalesce(p.draft_sections,p.sections))='array'
    and jsonb_array_length(coalesce(p.draft_sections,p.sections))>0
  returning p.* into published;
  if published.id is null then
    raise exception 'Add at least one section before publishing' using errcode='22023';
  end if;
  insert into public.landing_page_versions(page_id,version,sections,theme,published_by,published_at)
    values(published.id,published.version,published.published_sections,
      published.published_theme,auth.uid(),published.published_at)
    on conflict(page_id,version) do nothing;
  update public.marketing_landing_pages set status='published',updated_at=now()
    where id=legacy.id;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,
    event_type,action,target)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    p_account::text,'page','published',published.id::text);
  return jsonb_build_object('id',published.id,'slug',published.slug,'version',published.version);
end $$;
revoke all on function public.portal_publish_page(uuid,uuid) from public, anon;
grant execute on function public.portal_publish_page(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
