import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const accountA='10000000-0000-4000-8000-000000000001';
const accountB='10000000-0000-4000-8000-000000000002';

test('report archive includes every account report and excludes other accounts',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role authenticated;create role anon;
      create table public.report_sends(id uuid primary key,client_account_id uuid,type text,
        period_start date,period_end date,status text,work_done text,whats_next text,
        sent_at timestamptz,pdf_path text);
      create function public.portal_page_allowed(text) returns boolean language sql stable as $$select true$$;
      create function public.can_access_account(p_account uuid) returns boolean language sql stable as $$
        select p_account::text=current_setting('test.account',true)$$;
      insert into public.report_sends(id,client_account_id,type,period_start,period_end,status)
        select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'${accountA}',
          'monthly',date '2026-01-01',date '2026-01-31','sent' from generate_series(1,125) i;
      insert into public.report_sends(id,client_account_id,type,period_start,period_end,status)
        values('40000000-0000-4000-8000-000000000001','${accountB}',
          'monthly',date '2026-01-01',date '2026-01-31','sent');
    `);
    const migration=readFileSync(new URL('../supabase/migrations/20261102_14_portal_report_archive.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await db.exec(`set role authenticated;set test.account='${accountA}'`);
    const result=await db.query<{archive:Array<{id:string}>}>(
      `select public.portal_reports('${accountA}') as archive`);
    assert.equal(result.rows[0].archive.length,125);
    assert.ok(result.rows[0].archive.every(row=>row.id.startsWith('30000000-')));
    await assert.rejects(db.query(`select public.portal_reports('${accountB}')`),/Access denied/);
  }finally{await db.close()}
});
