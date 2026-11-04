import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const accountA='10000000-0000-4000-8000-000000000001';
const accountB='10000000-0000-4000-8000-000000000002';

test('report recipients are scoped, idempotent, auditable and unavailable to client staff',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role authenticated;create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select '20000000-0000-4000-8000-000000000001'::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select '{"email":"owner@example.test"}'::jsonb $$;
      create table public.report_recipients(id uuid primary key,client_account_id uuid,
        email text,name text,active boolean,daily boolean,weekly boolean);
      create table public.portal_activity_log(actor_id uuid,actor_email text,organization_id uuid,
        client_account_id text,event_type text,action text,target text);
      create function public.portal_page_allowed(text) returns boolean language sql stable as $$select true$$;
      create function public.can_access_account(p_account uuid) returns boolean language sql stable as $$
        select p_account::text=current_setting('test.account',true)$$;
      create function public.auth_role() returns text language sql stable as $$
        select current_setting('test.role',true)$$;
      grant usage on schema public,auth to authenticated;
      grant execute on all functions in schema public,auth to authenticated;
      grant select on public.report_recipients,public.portal_activity_log to authenticated;
    `);
    const migration=readFileSync(new URL('../supabase/migrations/20261107_08_report_recipient_management.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await db.exec(`set role authenticated;set test.account='${accountA}';set test.role='client_owner'`);
    const first=await db.query<{id:string}>(`select public.portal_set_report_recipient(
      '${accountA}',' Owner@Example.Test ','Owner',true) id`);
    const second=await db.query<{id:string}>(`select public.portal_set_report_recipient(
      '${accountA}','owner@example.test','Owner',false) id`);
    assert.equal(first.rows[0].id,second.rows[0].id);
    const recipients=await db.query<{rows:Array<{email:string;active:boolean}>}>(
      `select public.portal_report_recipients('${accountA}') rows`);
    assert.deepEqual(recipients.rows[0].rows.map(row=>[row.email,row.active]),[['owner@example.test',false]]);
    assert.equal((await db.query('select id from public.report_recipients')).rows.length,1);
    assert.equal((await db.query('select target from public.portal_activity_log')).rows.length,2);
    await assert.rejects(db.query(`select public.portal_report_recipients('${accountB}')`),/Access denied/);
    await assert.rejects(db.query(`select public.portal_set_report_recipient(
      '${accountB}','other@example.test','Other',true)`),/Access denied/);
    await assert.rejects(db.query(`select public.portal_set_report_recipient(
      '${accountA}','not-an-email','Invalid',true)`),/Access denied/);
    await db.exec("set test.role='client_staff'");
    await assert.rejects(db.query(`select public.portal_report_recipients('${accountA}')`),/Access denied/);
    await assert.rejects(db.query(`select public.portal_set_report_recipient(
      '${accountA}','other@example.test','Other',true)`),/Access denied/);
  }finally{await db.close()}
});
