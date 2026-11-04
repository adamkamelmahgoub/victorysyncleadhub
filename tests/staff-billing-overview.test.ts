import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('agency staff overview omits MRR and failed payments',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`
      create role anon;
      create role authenticated;
      create table public.sub_accounts(id uuid primary key,name text,slug text,status text,package text,
        logo_url text,last_active_at timestamptz,launch_date date,health_score integer,mrr_cents integer,
        goal_metric text,goal_value integer,account_manager_user_id uuid,settings jsonb);
      create table public.leads(id uuid primary key,client_account_id uuid,created_at timestamptz);
      create table public.company_tasks(client_account_id uuid,status text,due_at timestamptz);
      create table public.invoices(client_account_id uuid,status text);
      create table public.team_members(user_id uuid,name text,email text,is_active boolean);
      create table public.client_automation_jobs(client_account_id uuid,lead_id uuid,kind text,status text,sent_at timestamptz);
      create table public.client_call_details(client_account_id uuid,status text,duration_seconds integer,occurred_at timestamptz);
      create table public.mightycall_sms_messages(client_account_id uuid,direction text,sent_at timestamptz,created_at timestamptz);
      create table public.ai_requests(client_account_id uuid,prompt_tokens integer,completion_tokens integer,created_at timestamptz);
      create function public.auth_role() returns text language sql stable as $$
        select current_setting('test.role',true) $$;
      create function public.is_agency_admin() returns boolean language sql stable as $$
        select public.auth_role()='agency_admin' $$;
      create function public.is_agency() returns boolean language sql stable as $$
        select public.auth_role() in ('agency_admin','agency_staff') $$;
      create function public.can_access_account(uuid) returns boolean language sql stable as $$ select true $$;
      create function public.client_feature_enabled(text) returns boolean language sql stable as $$ select true $$;
      insert into public.sub_accounts(id,name,slug,status,package,health_score,mrr_cents,settings)
        values('10000000-0000-4000-8000-000000000001','Demo Plumbing','demo','active','starter',80,12500,'{}');
      insert into public.invoices(client_account_id,status) values
        ('10000000-0000-4000-8000-000000000001','failed');
    `);
    const migration=readFileSync(new URL('../supabase/migrations/20261107_04_staff_billing_rpc.sql',import.meta.url),'utf8');
    await db.exec(migration);await db.exec(migration);
    await db.exec("set test.role='agency_staff'");
    const staffAccounts=await db.query<{accounts:Array<{failed_payments:number|null}>}>(
      'select public.portal_accounts() accounts');
    assert.equal(staffAccounts.rows[0].accounts[0].failed_payments,null);
    const staffOverview=await db.query<{overview:Array<{mrr_cents:number|null;failed_payments:number|null}>}>(
      'select public.portal_agency_overview() overview');
    assert.equal(staffOverview.rows[0].overview[0].mrr_cents,null);
    assert.equal(staffOverview.rows[0].overview[0].failed_payments,null);
    await db.exec("set test.role='agency_admin'");
    const adminAccounts=await db.query<{accounts:Array<{failed_payments:number}>}>(
      'select public.portal_accounts() accounts');
    assert.equal(adminAccounts.rows[0].accounts[0].failed_payments,1);
    const adminOverview=await db.query<{overview:Array<{mrr_cents:number;failed_payments:number}>}>(
      'select public.portal_agency_overview() overview');
    assert.equal(adminOverview.rows[0].overview[0].mrr_cents,12500);
    assert.equal(adminOverview.rows[0].overview[0].failed_payments,1);
  }finally{await db.close()}
});
