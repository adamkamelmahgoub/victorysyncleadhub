begin;

-- marketing_landing_pages is the single writable model used by the editor and
-- renderer. Keep landing_pages as a legacy archive until existing links expire.
insert into public.marketing_landing_pages(id,canonical_page_id,organization_id,
  client_account_id,title,slug,status,seo_description,sections,theme,created_at,updated_at)
select p.id,p.id,p.organization_id,p.client_account_id,
  p.name,p.slug,case when p.status='published' then 'published' else 'draft' end,
  coalesce(p.seo_description,''),
  coalesce((select jsonb_agg(
    jsonb_build_object('id',coalesce(s.value->>'id',gen_random_uuid()::text),
      'type',case when s.value->>'type' in ('hero','features','form') then s.value->>'type' else 'text' end,
      'heading',coalesce(s.value->>'heading',''),
      'body',coalesce(s.value->>'body',''),
      'buttonText',coalesce(s.value->>'buttonText',''),
      'buttonUrl',coalesce(s.value->>'buttonUrl',''),
      'formId',case when s.value->>'type'='form' then coalesce(p.form_id::text,'') else '' end,
      'items',coalesce(s.value->'items','[]'::jsonb)) order by s.ordinality)
    from jsonb_array_elements(p.sections) with ordinality as s(value,ordinality)
    where s.value->>'type'<>'testimonial'),'[]'::jsonb),
  jsonb_build_object('font',case when p.theme->>'font'='serif' then 'serif' else 'sans' end,
    'foreground',coalesce(p.theme->>'text','#172033'),
    'accent',coalesce(p.theme->>'primary','#285ce6'),
    'background',coalesce(p.theme->>'background','#ffffff')),
  p.created_at,p.updated_at
from public.landing_pages p
where not exists(select 1 from public.marketing_landing_pages m where m.id=p.id or m.slug=p.slug)
on conflict(id) do nothing;

alter table public.marketing_landing_page_events
  add column if not exists legacy_event_id bigint;
create unique index if not exists marketing_page_events_legacy_idx
  on public.marketing_landing_page_events(legacy_event_id) where legacy_event_id is not null;
insert into public.marketing_landing_page_events(page_id,event_type,created_at,
  client_account_id,legacy_event_id)
select e.landing_page_id,
  case when e.event_type in ('form_submission','form_submit','conversion')
    then 'form_submission' else 'view' end,
  e.created_at,e.client_account_id,e.id
from public.landing_page_events e
where exists(select 1 from public.marketing_landing_pages m where m.id=e.landing_page_id)
on conflict (legacy_event_id) where legacy_event_id is not null do nothing;

update public.form_submissions s set marketing_page_id=s.landing_page_id
where s.landing_page_id is not null and s.marketing_page_id is null
  and exists(select 1 from public.marketing_landing_pages m where m.id=s.landing_page_id);

revoke insert,update,delete on public.landing_pages from authenticated;

notify pgrst, 'reload schema';
commit;
