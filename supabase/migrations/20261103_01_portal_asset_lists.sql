begin;

create index if not exists portal_forms_account_created_idx
  on public.forms(client_account_id,created_at desc,id desc);
create index if not exists portal_pages_account_created_idx
  on public.marketing_landing_pages(client_account_id,created_at desc,id desc);

create or replace function public.portal_forms(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('forms') then
    raise exception 'Forms unavailable' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc,f.id desc),'[]'::jsonb)
    into result
  from (select id,name,slug,status,created_at from public.forms
    where client_account_id=p_account) f;
  return result;
end $$;
revoke all on function public.portal_forms(uuid) from public,anon;
grant execute on function public.portal_forms(uuid) to authenticated;

create or replace function public.portal_pages(p_account uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('pages') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb)
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
    ) x;
  return result;
end $$;
revoke all on function public.portal_pages(uuid) from public,anon;
grant execute on function public.portal_pages(uuid) to authenticated;

commit;
