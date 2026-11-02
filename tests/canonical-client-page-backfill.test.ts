import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('client page backfill links legacy pages without changing existing canonical pages', async () => {
  const db = new PGlite();
  const org = '10000000-0000-4000-8000-000000000001';
  const account = '20000000-0000-4000-8000-000000000001';
  const form = '30000000-0000-4000-8000-000000000001';
  try {
    await db.exec(`
      create table public.forms(id uuid primary key,client_account_id uuid);
      create table public.landing_pages(
        id uuid primary key,organization_id uuid,client_account_id uuid,name text,slug text,
        status text,sections jsonb,theme jsonb,draft_sections jsonb,draft_theme jsonb,
        published_sections jsonb,published_theme jsonb,seo_title text,seo_description text,
        form_id uuid,published_at timestamptz,version integer,template_key text,
        created_at timestamptz,updated_at timestamptz,
        unique(organization_id,slug));
      create table public.marketing_landing_pages(
        id uuid primary key,canonical_page_id uuid,organization_id uuid,client_account_id uuid,
        title text,slug text,status text,sections jsonb,theme jsonb,seo_description text,
        template_key text,created_at timestamptz,updated_at timestamptz);
      create table public.landing_page_versions(
        page_id uuid,version integer,sections jsonb,theme jsonb,published_at timestamptz,
        note text,primary key(page_id,version));
      insert into public.forms values ('${form}','${account}');
      insert into public.landing_pages(id,organization_id,client_account_id,name,slug,status,
        sections,theme,version,created_at,updated_at)
      values('40000000-0000-4000-8000-000000000003','${org}','${account}',
        'Keep me','existing','published','[]','{}',2,now(),now());
      insert into public.marketing_landing_pages values
        ('40000000-0000-4000-8000-000000000001',null,'${org}','${account}',
          'Plumbing','plumbing','published',
          '[{"id":"hero","type":"hero","heading":"Real plumbing"},{"id":"form","type":"form","formId":"${form}"}]',
          '{"accent":"#123456","foreground":"#101010","background":"#ffffff"}',
          'Call us','starter',now(),now()),
        ('40000000-0000-4000-8000-000000000002',null,'${org}','${account}',
          'Draft','draft-page','draft','[{"id":"hero","type":"hero"}]','{}','',null,now(),now()),
        ('40000000-0000-4000-8000-000000000004',null,'${org}','${account}',
          'Collision','existing','published','[]','{}','',null,now(),now());
    `);
    const sql = readFileSync(new URL('../supabase/migrations/20261102_04_canonical_client_page_backfill.sql',import.meta.url),'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const pages = await db.query<{id:string;name:string;status:string;form_id:string|null;version:number;published_sections:unknown;draft_name:string}>(
      'select id,name,status,form_id,version,published_sections,draft_name from public.landing_pages order by id');
    assert.equal(pages.rows.length,3);
    assert.equal(pages.rows[0].name,'Plumbing');
    assert.equal(pages.rows[0].form_id,form);
    assert.equal(pages.rows[0].version,1);
    assert.ok(pages.rows[0].published_sections);
    assert.equal(pages.rows[1].status,'draft');
    assert.equal(pages.rows[1].published_sections,null);
    assert.equal(pages.rows[2].name,'Keep me');
    assert.equal(pages.rows[2].draft_name,'Keep me');
    const linked = await db.query<{title:string;canonical_page_id:string|null}>(
      'select title,canonical_page_id from public.marketing_landing_pages order by id');
    assert.equal(linked.rows[0].canonical_page_id,'40000000-0000-4000-8000-000000000001');
    assert.equal(linked.rows[1].canonical_page_id,'40000000-0000-4000-8000-000000000002');
    assert.equal(linked.rows[2].canonical_page_id,null);
    const versions = await db.query('select * from public.landing_page_versions');
    assert.equal(versions.rows.length,1);
    const syncSql = readFileSync(new URL('../supabase/migrations/20261102_05_client_page_draft_sync.sql',import.meta.url),'utf8');
    await db.exec(syncSql);
    await db.exec(syncSql);
    await db.exec(`update public.marketing_landing_pages set title='Changed draft',status='draft',
      sections='[{"id":"hero","type":"hero","heading":"Unpublished change"}]'
      where id='40000000-0000-4000-8000-000000000001'`);
    const edited = await db.query<{name:string;status:string;draft_name:string;sections:Array<{heading:string}>;
      draft_sections:Array<{heading:string}>;published_sections:Array<{heading:string}>}>(
      `select name,status,draft_name,sections,draft_sections,published_sections
       from public.landing_pages where id='40000000-0000-4000-8000-000000000001'`);
    assert.equal(edited.rows[0].status,'published');
    assert.equal(edited.rows[0].name,'Plumbing');
    assert.equal(edited.rows[0].draft_name,'Changed draft');
    assert.equal(edited.rows[0].published_sections[0].heading,'Real plumbing');
    assert.equal(edited.rows[0].draft_sections[0].heading,'Unpublished change');
    await db.exec(`insert into public.marketing_landing_pages values
      ('40000000-0000-4000-8000-000000000005',null,'${org}','${account}',
       'New page','new-page','draft','[]','{}','',null,now(),now())`);
    const fresh = await db.query<{canonical_page_id:string|null}>(
      `select canonical_page_id from public.marketing_landing_pages
       where id='40000000-0000-4000-8000-000000000005'`);
    assert.equal(fresh.rows[0].canonical_page_id,'40000000-0000-4000-8000-000000000005');
  } finally {
    await db.close();
  }
});
