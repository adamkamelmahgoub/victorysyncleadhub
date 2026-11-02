import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const accountA='10000000-0000-4000-8000-000000000001';
const accountB='10000000-0000-4000-8000-000000000002';

test('lead pages traverse 1,001 account leads once and reject another account',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role authenticated; create role anon;
      create table public.leads(id uuid primary key,client_account_id uuid,first_name text,
        last_name text,email text,phone text,company text,status text,pipeline_stage_id uuid,
        notes text,source text,dnc boolean,meeting_at timestamptz,created_at timestamptz);
      create table public.pipelines(id uuid primary key,client_account_id uuid);
      create table public.pipeline_stages(id uuid primary key,pipeline_id uuid,name text,position int);
      create function public.portal_page_allowed(text) returns boolean language sql stable as $$select true$$;
      create function public.can_access_account(p_account uuid) returns boolean language sql stable as $$
        select p_account::text=current_setting('test.account',true)$$;
      insert into public.leads(id,client_account_id,first_name,created_at)
        select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${accountA}',
          'Lead '||i,'2026-10-01T00:00:00Z'::timestamptz from generate_series(1,1001) i;
      insert into public.leads(id,client_account_id,first_name,created_at) values
        ('40000000-0000-4000-8000-000000000001','${accountB}','Other account','2026-10-01T00:00:00Z');
    `);
    const migration=readFileSync(new URL('../supabase/migrations/20261102_13_portal_lead_paging.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await db.exec(`set role authenticated; set test.account='${accountA}'`);
    let beforeAt:string|null=null,beforeId:string|null=null;
    const ids:string[]=[];
    do{
      const result=await db.query<{page:{rows:Array<{id:string}>;nextCursor:{createdAt:string;id:string}|null}}>(
        `select public.portal_lead_page('${accountA}',${beforeAt?`'${beforeAt}'`:'null'},${beforeId?`'${beforeId}'`:'null'},200) as page`);
      const page=result.rows[0].page;
      ids.push(...page.rows.map(row=>row.id));
      beforeAt=page.nextCursor?.createdAt??null;beforeId=page.nextCursor?.id??null;
    }while(beforeAt);
    assert.equal(ids.length,1001);
    assert.equal(new Set(ids).size,1001);
    assert.ok(ids.every(id=>id.startsWith('30000000-')));
    await assert.rejects(db.query(`select public.portal_lead_page('${accountB}')`),/Lead page unavailable/);
    await assert.rejects(db.query(`select public.portal_lead_page('${accountA}',null,null,null)`),/Lead page unavailable/);
  }finally{await db.close()}
});
