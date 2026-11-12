import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const accountA='10000000-0000-4000-8000-000000000001';
const accountB='10000000-0000-4000-8000-000000000002';
const start='2026-01-01T00:00:00Z';
const end='2026-02-01T00:00:00Z';

test('call pages traverse one account and preserve outcome filters',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role authenticated;create role anon;
      create table public.client_call_details(id uuid primary key,client_account_id uuid,
        external_call_id text,lead_id uuid,occurred_at timestamptz,caller_number text,
        business_number text,status text,direction text,duration_seconds integer,
        recording_url text,agent_name text,outcome text,summary text,booked boolean);
      create function public.portal_page_allowed(text) returns boolean language sql stable as $$select true$$;
      create function public.can_access_account(p_account uuid) returns boolean language sql stable as $$
        select p_account::text=current_setting('test.account',true)$$;
      insert into public.client_call_details(id,client_account_id,external_call_id,occurred_at,outcome,booked)
        select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${accountA}',
          'call-'||i,'2026-01-15T12:00:00Z'::timestamptz,
          case when i<=250 then 'booked' else 'spam' end,i<=250
          from generate_series(1,251) i;
      insert into public.client_call_details(id,client_account_id,external_call_id,occurred_at,outcome,booked)
        values('40000000-0000-4000-8000-000000000001','${accountB}',
          'other','2026-01-15T12:00:00Z','booked',true);
    `);
    const migration=readFileSync(new URL('../supabase/migrations/20261102_15_portal_call_paging.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await db.exec(`set role authenticated;set test.account='${accountA}'`);
    const ids:string[]=[];
    let cursor:{occurred_at:string;id:string}|null=null;
    for(;;){
      const rows=(await db.query<{calls:Array<{id:string;occurred_at:string}>}>(
        `select public.portal_call_page('${accountA}','${start}','${end}','booked',${cursor?`'${cursor.occurred_at}'`:'null'},${cursor?`'${cursor.id}'`:'null'},200) as calls`)).rows[0].calls;
      ids.push(...rows.map(row=>row.id));
      if(rows.length<200)break;
      cursor=rows[rows.length-1];
    }
    assert.equal(ids.length,250);
    assert.equal(new Set(ids).size,250);
    await assert.rejects(db.query(`select public.portal_call_page('${accountB}','${start}','${end}')`),/Call page unavailable/);
    await assert.rejects(db.query(`select public.portal_call_page('${accountA}','${start}','${end}',null,null,null,null)`),/Call page unavailable/);
  }finally{await db.close()}
});
