import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('due lead and missed-call jobs dispatch immediately; delayed jobs wait',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;
      create table public.client_automation_jobs (
        id uuid primary key default gen_random_uuid(),kind text not null,
        status text not null default 'pending',run_at timestamptz not null default now());
      create table public.delivery_poll_calls(n integer not null default 0);
      insert into public.delivery_poll_calls values(0);
      create function public.client_delivery_poll() returns void language plpgsql as $$
      begin update public.delivery_poll_calls set n=n+1; end $$;`);
    const sql=readFileSync(new URL('../supabase/migrations/20261102_11_immediate_client_delivery.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql);
    await db.exec(`insert into public.client_automation_jobs(kind) values
      ('lead_followup'),('lead_email'),('missed_call_text'),('owner_alert'),('stop_confirmation');
      insert into public.client_automation_jobs(kind,run_at) values
      ('lead_nudge',now()),('lead_followup',now()+interval '1 day');
      insert into public.client_automation_jobs(kind,status) values('lead_followup','cancelled');`);
    const result=await db.query<{n:number}>('select n from public.delivery_poll_calls');
    assert.equal(result.rows[0].n,1,'a batch of due jobs should dispatch one worker request');
    await db.exec(`create or replace function public.client_delivery_poll() returns void language plpgsql as $$
      begin raise exception 'dispatch unavailable'; end $$;
      insert into public.client_automation_jobs(kind) values('missed_call_text');`);
    const count=await db.query<{n:number}>(`select count(*)::integer n from public.client_automation_jobs`);
    assert.equal(count.rows[0].n,9,'dispatch failure must not reject the captured lead or call');
  }finally{await db.close();}
});
