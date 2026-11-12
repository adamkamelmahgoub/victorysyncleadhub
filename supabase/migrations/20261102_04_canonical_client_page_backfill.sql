begin;

-- Prepare canonical pages for draft metadata as well as draft content.
alter table public.landing_pages
  add column if not exists draft_name text,
  add column if not exists draft_slug text,
  add column if not exists draft_seo_description text;

update public.landing_pages set
  draft_name = coalesce(draft_name,name),
  draft_slug = coalesce(draft_slug,slug),
  draft_seo_description = coalesce(draft_seo_description,seo_description,'')
where draft_name is null or draft_slug is null or draft_seo_description is null;

-- Preserve legacy rows and IDs. A conflicting slug or ID is left unlinked
-- for review instead of overwriting an unrelated published page.
insert into public.landing_pages (
  id,organization_id,client_account_id,name,slug,status,sections,theme,
  draft_sections,draft_theme,published_sections,published_theme,
  draft_name,draft_slug,draft_seo_description,seo_title,seo_description,
  form_id,published_at,version,template_key,created_at,updated_at
)
select m.id,m.organization_id,m.client_account_id,m.title,m.slug,m.status,
  m.sections,
  jsonb_build_object(
    'primary',coalesce(m.theme->>'accent','#285ce6'),
    'accent',coalesce(m.theme->>'accent','#285ce6'),
    'text',coalesce(m.theme->>'foreground','#172033'),
    'background',coalesce(m.theme->>'background','#ffffff'),
    'font',case when m.theme->>'font'='serif' then 'serif' else 'system' end
  ),
  m.sections,
  jsonb_build_object(
    'primary',coalesce(m.theme->>'accent','#285ce6'),
    'accent',coalesce(m.theme->>'accent','#285ce6'),
    'text',coalesce(m.theme->>'foreground','#172033'),
    'background',coalesce(m.theme->>'background','#ffffff'),
    'font',case when m.theme->>'font'='serif' then 'serif' else 'system' end
  ),
  case when m.status='published' then m.sections end,
  case when m.status='published' then jsonb_build_object(
    'primary',coalesce(m.theme->>'accent','#285ce6'),
    'accent',coalesce(m.theme->>'accent','#285ce6'),
    'text',coalesce(m.theme->>'foreground','#172033'),
    'background',coalesce(m.theme->>'background','#ffffff'),
    'font',case when m.theme->>'font'='serif' then 'serif' else 'system' end
  ) end,
  m.title,m.slug,m.seo_description,m.title,m.seo_description,
  (select f.id from public.forms f where f.client_account_id is not distinct from m.client_account_id
    and exists(select 1 from jsonb_array_elements(m.sections) s where s->>'formId'=f.id::text)
    limit 1),
  case when m.status='published' then m.updated_at end,
  case when m.status='published' then 1 else 0 end,
  m.template_key,m.created_at,m.updated_at
from public.marketing_landing_pages m
where m.canonical_page_id is null and m.organization_id is not null
  and not exists(select 1 from public.landing_pages p where p.id=m.id
    or (p.organization_id=m.organization_id and p.slug=m.slug))
on conflict do nothing;

update public.marketing_landing_pages m set canonical_page_id=p.id
from public.landing_pages p
where m.canonical_page_id is null and p.id=m.id
  and p.organization_id=m.organization_id
  and p.client_account_id is not distinct from m.client_account_id
  and p.slug=m.slug;

insert into public.landing_page_versions(page_id,version,sections,theme,published_at,note)
select p.id,1,p.published_sections,p.published_theme,
  coalesce(p.published_at,p.updated_at),'Imported client page'
from public.landing_pages p
join public.marketing_landing_pages m on m.canonical_page_id=p.id
where p.status='published' and p.version=1
  and p.published_sections is not null and p.published_theme is not null
on conflict(page_id,version) do nothing;

notify pgrst, 'reload schema';
commit;
