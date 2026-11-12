begin;

create or replace function public.marketing_page_canonical_theme(p_theme jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'primary',coalesce(p_theme->>'accent','#285ce6'),
    'accent',coalesce(p_theme->>'accent','#285ce6'),
    'text',coalesce(p_theme->>'foreground','#172033'),
    'background',coalesce(p_theme->>'background','#ffffff'),
    'font',case when p_theme->>'font'='serif' then 'serif' else 'system' end
  );
$$;

create or replace function public.sync_marketing_page_draft() returns trigger
language plpgsql security definer set search_path = '' as $$
declare page_status text;
begin
  if new.organization_id is null then
    select a.organization_id into new.organization_id
      from public.sub_accounts a where a.id=new.client_account_id;
  end if;
  if new.organization_id is null then
    raise exception 'Page organization is required' using errcode='23502';
  end if;
  if new.canonical_page_id is null then
    insert into public.landing_pages(id,organization_id,client_account_id,name,slug,status,
      sections,theme,draft_sections,draft_theme,published_sections,published_theme,
      draft_name,draft_slug,draft_seo_description,seo_title,seo_description,
      published_at,version,template_key,created_at,updated_at)
    values(new.id,new.organization_id,new.client_account_id,new.title,new.slug,new.status,
      new.sections,public.marketing_page_canonical_theme(new.theme),
      new.sections,public.marketing_page_canonical_theme(new.theme),
      case when new.status='published' then new.sections end,
      case when new.status='published' then public.marketing_page_canonical_theme(new.theme) end,
      new.title,new.slug,new.seo_description,new.title,new.seo_description,
      case when new.status='published' then now() end,
      case when new.status='published' then 1 else 0 end,
      new.template_key,coalesce(new.created_at,now()),now())
    on conflict do nothing;
    select p.id into new.canonical_page_id from public.landing_pages p
    where p.id=new.id and p.organization_id=new.organization_id
      and p.client_account_id is not distinct from new.client_account_id
      and p.slug=new.slug;
  end if;
  if new.canonical_page_id is not null then
    update public.landing_pages p set
      draft_sections=new.sections,draft_theme=public.marketing_page_canonical_theme(new.theme),
      draft_name=new.title,draft_slug=new.slug,draft_seo_description=new.seo_description,
      sections=case when p.status='draft' then new.sections else p.sections end,
      theme=case when p.status='draft' then public.marketing_page_canonical_theme(new.theme) else p.theme end,
      name=case when p.status='draft' then new.title else p.name end,
      slug=case when p.status='draft' then new.slug else p.slug end,
      seo_description=case when p.status='draft' then new.seo_description else p.seo_description end,
      updated_at=now()
    where p.id=new.canonical_page_id and p.organization_id=new.organization_id
      and p.client_account_id is not distinct from new.client_account_id
    returning p.status into page_status;
    if page_status is null then
      raise exception 'Canonical page account mismatch' using errcode='23503';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists marketing_page_draft_sync on public.marketing_landing_pages;
create trigger marketing_page_draft_sync before insert or update of
  title,slug,status,sections,theme,seo_description
on public.marketing_landing_pages for each row
execute function public.sync_marketing_page_draft();

notify pgrst, 'reload schema';
commit;
