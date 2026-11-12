import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('client launchpad is account-scoped, reflects setup state, and is idempotent',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role authenticated; create role anon;
      create function public.can_access_account(uuid) returns boolean language sql stable as $$ select true $$;
      create function public.portal_page_allowed(text) returns boolean language sql stable as $$ select true $$;
      create table public.sub_accounts(id uuid primary key,name text,mightycall_number text,gbp_url text,
        meta_ad_account_id text,google_review_link text);
      create table public.marketing_landing_pages(client_account_id uuid,status text);
      create table public.automation_workflows(client_account_id uuid,is_active boolean);
      insert into public.sub_accounts values
        ('10000000-0000-4000-8000-000000000001','Demo Plumbing','+15555550100',null,null,'https://example.com/review'),
        ('10000000-0000-4000-8000-000000000002','Other HVAC',null,'https://example.com/profile',null,null);
      insert into public.marketing_landing_pages values('10000000-0000-4000-8000-000000000002','published');
      insert into public.automation_workflows values('10000000-0000-4000-8000-000000000001',true);`);
    const sql=readFileSync(new URL('../supabase/migrations/20261031_06_client_launchpad.sql',import.meta.url),'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const update=readFileSync(new URL('../supabase/migrations/20261103_03_client_launchpad_navigation.sql',import.meta.url),'utf8');
    await db.exec(update);
    await db.exec(update);
    const result=(await db.query<{portal_launchpad:{accountName:string;steps:Array<{key:string;done:boolean}>}}>(
      "select public.portal_launchpad('10000000-0000-4000-8000-000000000001')")).rows[0].portal_launchpad;
    assert.equal(result.accountName,'Demo Plumbing');
    assert.deepEqual(Object.fromEntries(result.steps.map(step=>[step.key,step.done])),
      {phone:true,google:false,meta:false,reviews:true,page:false,workflow:true});
    assert.equal(result.steps.find(step=>step.key==='workflow')?.path,'/automation');
    await db.exec(`create or replace function public.can_access_account(uuid) returns boolean language sql stable as $$ select false $$;`);
    await assert.rejects(()=>db.query("select public.portal_launchpad('10000000-0000-4000-8000-000000000001')"),/Access denied/);
  }finally{await db.close();}
});
