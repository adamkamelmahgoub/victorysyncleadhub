begin;

create or replace function public.portal_page_versions(p_account uuid,p_page uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_access_account(p_account) or not public.portal_page_allowed('pages') then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if not exists(select 1 from public.marketing_landing_pages m
    where m.id=p_page and m.client_account_id=p_account and m.canonical_page_id is not null) then
    raise exception 'Page not found' using errcode='02000';
  end if;
  select coalesce(jsonb_agg(to_jsonb(v) order by v.version desc),'[]'::jsonb) into result
  from (
    select h.version,h.published_at,h.note from public.landing_page_versions h
    join public.marketing_landing_pages m on m.canonical_page_id=h.page_id
    where m.id=p_page and m.client_account_id=p_account
    order by h.version desc limit 50
  ) v;
  return result;
end $$;
revoke all on function public.portal_page_versions(uuid,uuid) from public, anon;
grant execute on function public.portal_page_versions(uuid,uuid) to authenticated;

create or replace function public.portal_restore_page(p_account uuid,p_page uuid,p_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare legacy public.marketing_landing_pages%rowtype;
declare old_version public.landing_page_versions%rowtype;
declare restored public.marketing_landing_pages%rowtype;
begin
  if not public.portal_page_edit_allowed(p_account) then
    raise exception 'Access denied' using errcode='42501';
  end if;
  if p_version is null or p_version<1 then
    raise exception 'Invalid version' using errcode='22023';
  end if;
  select * into legacy from public.marketing_landing_pages
    where id=p_page and client_account_id=p_account for update;
  if legacy.id is null or legacy.canonical_page_id is null then
    raise exception 'Page not found' using errcode='02000';
  end if;
  select * into old_version from public.landing_page_versions
    where page_id=legacy.canonical_page_id and version=p_version;
  if old_version.page_id is null then
    raise exception 'Version not found' using errcode='02000';
  end if;
  update public.marketing_landing_pages set sections=old_version.sections,
    theme=jsonb_build_object(
      'background',coalesce(old_version.theme->>'background','#ffffff'),
      'foreground',coalesce(old_version.theme->>'text','#172033'),
      'accent',coalesce(old_version.theme->>'primary','#285ce6'),
      'font',case when old_version.theme->>'font'='serif' then 'serif' else 'sans' end),
    status='draft',updated_at=now()
  where id=legacy.id and client_account_id=p_account returning * into restored;
  insert into public.portal_activity_log(actor_id,actor_email,organization_id,client_account_id,
    event_type,action,target,metadata)
  values(auth.uid(),auth.jwt()->>'email','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
    p_account::text,'page','version_restored',legacy.id::text,
    jsonb_build_object('version',p_version));
  return to_jsonb(restored);
end $$;
revoke all on function public.portal_restore_page(uuid,uuid,integer) from public, anon;
grant execute on function public.portal_restore_page(uuid,uuid,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
