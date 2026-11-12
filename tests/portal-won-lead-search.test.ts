import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const accountA='10000000-0000-4000-8000-000000000001';
const accountB='10000000-0000-4000-8000-000000000002';
const pipeline='20000000-0000-4000-8000-000000000001';
const won='30000000-0000-4000-8000-000000000001';

test('Won lead search finds an older customer and remains account scoped',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role authenticated;create role anon;
      create table public.pipelines(id uuid primary key,client_account_id uuid);
      create table public.pipeline_stages(id uuid primary key,pipeline_id uuid,name text,key text);
      create table public.leads(id uuid primary key,client_account_id uuid,pipeline_stage_id uuid,
        first_name text,last_name text,phone text,created_at timestamptz);
      create function public.portal_page_allowed(text) returns boolean language sql stable as $$select true$$;
      create function public.can_access_account(p_account uuid) returns boolean language sql stable as $$
        select p_account::text=current_setting('test.account',true)$$;
      insert into public.pipelines values('${pipeline}','${accountA}');
      insert into public.pipeline_stages values('${won}','${pipeline}','Won','won');
      insert into public.leads(id,client_account_id,pipeline_stage_id,first_name,last_name,phone,created_at)
        select ('40000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${accountA}',
          '${won}','Recent','Customer '||i,'+15125550101',now() from generate_series(1,201) i;
      insert into public.leads values
        ('50000000-0000-4000-8000-000000000001','${accountA}','${won}',
          'Jordan','Older','+15125550999',date '2020-01-01'),
        ('60000000-0000-4000-8000-000000000001','${accountB}','${won}',
          'Private','Customer','+15125550888',date '2020-01-01');
    `);
    const migration=readFileSync(new URL('../supabase/migrations/20261102_16_portal_won_lead_search.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await db.exec(`set role authenticated;set test.account='${accountA}'`);
    const result=await db.query<{leads:Array<{first_name:string}>}>(
      `select public.portal_won_leads('${accountA}','Jordan') as leads`);
    assert.deepEqual(result.rows[0].leads.map(lead=>lead.first_name),['Jordan']);
    assert.equal((await db.query<{leads:unknown[]}>(
      `select public.portal_won_leads('${accountA}','Private') as leads`)).rows[0].leads.length,0);
    await assert.rejects(db.query(`select public.portal_won_leads('${accountB}','')`),/Won leads unavailable/);
  }finally{await db.close()}
});
