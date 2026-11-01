import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('dashboard and PDF aggregate counts all rows and excludes the next period',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.sub_accounts(id uuid primary key,name text,package text,logo_url text,brand jsonb,goal_metric text,goal_value integer);
      create table public.leads(client_account_id uuid,created_at timestamptz,source text);
      create table public.booking_appointments(client_account_id uuid,status text,start_at timestamptz);
      create table public.client_call_details(client_account_id uuid,status text,occurred_at timestamptz);
      create table public.client_automation_jobs(client_account_id uuid,source_id text,kind text,status text,sent_at timestamptz);
      create table public.reviews(client_account_id uuid,rating integer,created_at timestamptz);
      create table public.ad_spend_entries(client_account_id uuid,amount_cents integer,month date);
      insert into public.sub_accounts(id,name) values('10000000-0000-4000-8000-000000000001','Demo');
      insert into public.leads select '10000000-0000-4000-8000-000000000001',
        '2026-10-15T12:00:00Z'::timestamptz,'website' from generate_series(1,1205);
      insert into public.leads values
        ('10000000-0000-4000-8000-000000000001','2026-11-01T00:00:00Z','website'),
        ('10000000-0000-4000-8000-000000000002','2026-10-15T12:00:00Z','website');
      insert into public.reviews values
        ('10000000-0000-4000-8000-000000000001',4,'2026-10-15T12:00:00Z'),
        ('10000000-0000-4000-8000-000000000001',5,'2026-10-15T12:00:00Z'),
        ('10000000-0000-4000-8000-000000000001',1,'2026-11-01T00:00:00Z');
      insert into public.ad_spend_entries values
        ('10000000-0000-4000-8000-000000000001',50000,'2026-10-01'),
        ('10000000-0000-4000-8000-000000000001',99999,'2026-11-01');
    `);
    const migration=await readFile(new URL('../supabase/migrations/20261101_01_shared_client_metrics.sql',import.meta.url),'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const result=await db.query<{metrics:Record<string,unknown>}>(`select public.client_dashboard_metric_values(
      '10000000-0000-4000-8000-000000000001','2026-10-01T00:00:00Z','2026-11-01T00:00:00Z') as metrics`);
    const metrics=result.rows[0]?.metrics;
    assert.equal(metrics?.newLeads,1205);
    assert.equal(metrics?.reviewsReceived,2);
    assert.equal(metrics?.averageRating,4.5);
    assert.equal(metrics?.adSpendCents,50000);
    assert.deepEqual(metrics?.sourceBreakdown,{website:1205});
    await db.exec('begin; set local role authenticated;');
    await assert.rejects(()=>db.query(`select public.client_dashboard_metric_values(
      '10000000-0000-4000-8000-000000000001','2026-10-01T00:00:00Z','2026-11-01T00:00:00Z')`),
    /permission denied/);
    await db.exec('rollback;');
  }finally{await db.close()}
});
