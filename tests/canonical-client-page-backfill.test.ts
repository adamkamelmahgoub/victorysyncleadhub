import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { mcpPool } from '../lib/mcp-auth.js';

test('client page backfill links legacy pages without changing existing canonical pages', async () => {
  const db = new PGlite();
  const org = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
  const account = '20000000-0000-4000-8000-000000000001';
  const form = '30000000-0000-4000-8000-000000000001';
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select '50000000-0000-4000-8000-000000000001'::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      create function public.portal_page_edit_allowed(uuid) returns boolean language sql stable as $$ select true $$;
      create function public.can_access_account(uuid) returns boolean language sql stable as $$ select true $$;
      create function public.portal_page_allowed(text) returns boolean language sql stable as $$ select true $$;
      create table public.sub_accounts(id uuid primary key,organization_id uuid);
      create table public.portal_activity_log(actor_id uuid,actor_email text,organization_id text,
        client_account_id text,event_type text,action text,target text);
      create table public.forms(id uuid primary key,client_account_id uuid);
      create table public.landing_page_events(landing_page_id uuid,event_type text);
      create table public.marketing_landing_page_events(page_id uuid,event_type text,legacy_event_id bigint);
      create table public.form_submissions(id uuid primary key,client_account_id uuid,
        landing_page_id uuid,marketing_page_id uuid);
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
        page_id uuid,version integer,sections jsonb,theme jsonb,published_by uuid,published_at timestamptz,
        note text,primary key(page_id,version));
      insert into public.sub_accounts values ('${account}','${org}');
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
    const publishSql = readFileSync(new URL('../supabase/migrations/20261102_06_client_page_publish.sql',import.meta.url),'utf8');
    await db.exec(publishSql);
    await db.exec(publishSql);
    await db.query(`select public.portal_save_page($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)`,[
      account,'40000000-0000-4000-8000-000000000001','Unpublished title','plumbing-draft',
      JSON.stringify([{id:'hero',type:'hero',heading:'New heading'}]),
      JSON.stringify({background:'#ffffff',foreground:'#172033',accent:'#285ce6',font:'sans'}),
      'Unpublished SEO','draft',
    ]);
    const beforePublish = await db.query<{name:string;slug:string;status:string;published_sections:Array<{heading:string}>}>(
      `select name,slug,status,published_sections from public.landing_pages
       where id='40000000-0000-4000-8000-000000000001'`);
    assert.equal(beforePublish.rows[0].name,'Plumbing');
    assert.equal(beforePublish.rows[0].slug,'plumbing');
    assert.equal(beforePublish.rows[0].status,'published');
    assert.equal(beforePublish.rows[0].published_sections[0].heading,'Real plumbing');
    const visible = await db.query<{pages:Array<{status:string;slug:string;public_slug:string}>}>(
      `select public.portal_pages('${account}'::uuid) pages`);
    const draftPage = visible.rows[0].pages.find(page=>page.slug==='plumbing-draft');
    assert.equal(draftPage?.status,'published');
    assert.equal(draftPage?.public_slug,'plumbing');
    const originalQuery=mcpPool.query;
    mcpPool.query=((sql:string,values?:unknown[])=>db.query(sql,values)) as typeof mcpPool.query;
    try{
      const {default:publicHandler}=await import('../api/client-landing.js');
      let location='';
      const res={statusCode:0,setHeader(key:string,value:string){if(key==='location')location=value},end(){}};
      await publicHandler({method:'GET',url:'/api/public/landing/plumbing',headers:{host:'app.victorysync.com'}} as never,res as never);
      assert.equal(res.statusCode,307);
      assert.equal(location,'/p/plumbing');
    }finally{mcpPool.query=originalQuery}
    await db.query(`select public.portal_publish_page($1,$2)`,[
      account,'40000000-0000-4000-8000-000000000001']);
    const afterPublish = await db.query<{name:string;slug:string;version:number;published_sections:Array<{heading:string}>}>(
      `select name,slug,version,published_sections from public.landing_pages
       where id='40000000-0000-4000-8000-000000000001'`);
    assert.equal(afterPublish.rows[0].name,'Unpublished title');
    assert.equal(afterPublish.rows[0].slug,'plumbing-draft');
    assert.equal(afterPublish.rows[0].version,2);
    assert.equal(afterPublish.rows[0].published_sections[0].heading,'New heading');
    await db.exec(`
      insert into public.landing_page_events values
        ('40000000-0000-4000-8000-000000000001','view');
      insert into public.marketing_landing_page_events values
        ('40000000-0000-4000-8000-000000000001','view',null),
        ('40000000-0000-4000-8000-000000000001','view',123);
      insert into public.form_submissions values
        ('60000000-0000-4000-8000-000000000001','${account}',
          '40000000-0000-4000-8000-000000000001',
          '40000000-0000-4000-8000-000000000001');
    `);
    const stats = await db.query<{rows:Array<{id:string;visits:number;leads:number}>}>(
      `select public.portal_page_stats('${account}'::uuid) rows`);
    const pageStats=stats.rows[0].rows.find(row=>row.id==='40000000-0000-4000-8000-000000000001');
    assert.equal(Number(pageStats?.visits),2);
    assert.equal(Number(pageStats?.leads),1);
    const publishedVersions = await db.query(`select version from public.landing_page_versions
      where page_id='40000000-0000-4000-8000-000000000001' order by version`);
    assert.deepEqual(publishedVersions.rows.map(row=>row.version),[1,2]);
  } finally {
    await db.close();
  }
});
