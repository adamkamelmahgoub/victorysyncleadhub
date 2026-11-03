import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const accountA='10000000-0000-4000-8000-000000000001';
const accountB='10000000-0000-4000-8000-000000000002';

test('client pages and forms include every asset in the account',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role authenticated;create role anon;
      create table public.forms(id uuid primary key,client_account_id uuid,name text,slug text,
        status text,created_at timestamptz);
      create table public.marketing_landing_pages(id uuid primary key,client_account_id uuid,
        canonical_page_id uuid,title text,slug text,status text,seo_description text,
        sections jsonb,theme jsonb,created_at timestamptz,updated_at timestamptz);
      create table public.landing_pages(id uuid primary key,client_account_id uuid,draft_name text,
        draft_slug text,slug text,status text,draft_seo_description text,draft_sections jsonb,draft_theme jsonb);
      create function public.portal_page_allowed(text) returns boolean language sql stable as $$select true$$;
      create function public.can_access_account(p_account uuid) returns boolean language sql stable as $$
        select p_account::text=current_setting('test.account',true)$$;
      insert into public.forms(id,client_account_id,name,created_at)
        select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${accountA}',
          'Form '||i,now() from generate_series(1,125) i;
      insert into public.marketing_landing_pages(id,client_account_id,title,sections,theme,created_at)
        select ('40000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${accountA}',
          'Page '||i,'[]'::jsonb,'{}'::jsonb,now() from generate_series(1,125) i;
      insert into public.forms values
        ('50000000-0000-4000-8000-000000000001','${accountB}','Private',null,null,now());
      insert into public.marketing_landing_pages(id,client_account_id,title,created_at)
        values('60000000-0000-4000-8000-000000000001','${accountB}','Private',now());
    `);
    const migration=readFileSync(new URL('../supabase/migrations/20261103_01_portal_asset_lists.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await db.exec(`set role authenticated;set test.account='${accountA}'`);
    const forms=(await db.query<{rows:Array<{name:string}>}>(
      `select public.portal_forms('${accountA}') as rows`)).rows[0].rows;
    const pages=(await db.query<{rows:Array<{name:string}>}>(
      `select public.portal_pages('${accountA}') as rows`)).rows[0].rows;
    assert.equal(forms.length,125);
    assert.equal(pages.length,125);
    assert.ok(forms.every(form=>form.name!=='Private'));
    assert.ok(pages.every(page=>page.name!=='Private'));
    await assert.rejects(db.query(`select public.portal_forms('${accountB}')`),/Forms unavailable/);
    await assert.rejects(db.query(`select public.portal_pages('${accountB}')`),/Access denied/);
  }finally{await db.close()}
});
