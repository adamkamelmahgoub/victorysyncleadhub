import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('report RPC saves drafts but queues only complete reports with a recipient',async()=>{
  const db=new PGlite();
  const account='10000000-0000-4000-8000-000000000001';
  const report='20000000-0000-4000-8000-000000000001';
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table public.sub_accounts(id uuid primary key,owner_email text);
      create table public.report_recipients(client_account_id uuid,email text,active boolean);
      create table public.report_sends(id uuid primary key,client_account_id uuid,status text,
        work_done text,whats_next text);
      create table public.client_automation_jobs(client_account_id uuid,kind text,source_id text,
        unique(kind,source_id));
      create table public.portal_activity_log(actor_id uuid,actor_email text,organization_id uuid,
        client_account_id text,event_type text,action text,target text);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
      create function public.can_access_account(uuid) returns boolean language sql stable as $$select true$$;
      create function public.auth_role() returns text language sql stable as $$select 'agency_admin'::text$$;
      create function public.client_delivery_enabled(uuid) returns boolean language sql stable as $$select true$$;`);
    const sql=readFileSync(new URL('../supabase/migrations/20261107_11_report_send_readiness.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql);
    await db.query('insert into public.sub_accounts values($1,null)',[account]);
    await db.query("insert into public.report_sends values($1,$2,'draft',null,null)",[report,account]);
    const update=(done:string,next:string,send:boolean)=>db.query(
      'select public.portal_update_report($1,$2,$3,$4,$5)',[account,report,done,next,send]);
    await update('','',false);
    await assert.rejects(update('Work completed','',true),/Complete both report narrative fields/);
    await assert.rejects(update('Work completed','Next steps',true),/Add a report recipient/);
    assert.equal((await db.query('select count(*)::integer n from public.client_automation_jobs')).rows[0].n,0);
    assert.equal((await db.query<{status:string}>('select status from public.report_sends')).rows[0].status,'draft');
    await db.query('insert into public.report_recipients values($1,$2,true)',[account,'owner@example.test']);
    await update('Work completed','Next steps',true);
    assert.equal((await db.query<{status:string}>('select status from public.report_sends')).rows[0].status,'queued');
    assert.equal((await db.query('select count(*)::integer n from public.client_automation_jobs')).rows[0].n,1);
    await assert.rejects(update('Work completed','Next steps',true),/Draft unavailable/);
  }finally{await db.close();}
});
