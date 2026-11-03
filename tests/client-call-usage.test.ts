import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('call usage counts this month’s answered minutes for one account and restricts direct access',async()=>{
  const db=new PGlite();
  const account='10000000-0000-4000-8000-000000000001';
  const other='10000000-0000-4000-8000-000000000002';
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
      create table public.sub_accounts(id uuid primary key,settings jsonb);
      create table public.client_call_details(client_account_id uuid,status text,duration_seconds integer,occurred_at timestamptz);
      create table public.portal_activity_log(actor_id uuid,actor_email text,organization_id uuid,client_account_id text,event_type text,action text,target text,metadata jsonb);
      create function public.can_access_account(uuid) returns boolean language sql as $$ select true $$;
      create function public.portal_page_allowed(text) returns boolean language sql as $$ select true $$;
      create function public.is_agency_admin() returns boolean language sql as $$ select false $$;
      create function public.is_agency() returns boolean language sql as $$ select false $$;
      insert into public.sub_accounts values
        ('${account}','{"included_minutes":100}'),('${other}','{"included_minutes":100}');
      insert into public.client_call_details values
        ('${account}','answered',1800,date_trunc('month',now())+interval '1 day'),
        ('${account}','connected',2941,date_trunc('month',now())+interval '2 days'),
        ('${account}','missed',3600,date_trunc('month',now())+interval '2 days'),
        ('${account}','answered',3600,date_trunc('month',now())-interval '1 day'),
        ('${other}','answered',7200,date_trunc('month',now())+interval '2 days');`);
    const migration=readFileSync(new URL('../supabase/migrations/20261026_12_client_call_usage.sql',import.meta.url),'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const usage=await db.query<{meter:{minutesUsed:number;minutesIncluded:number;agentHours:number}}>(
      'select public.client_usage_meter($1) meter',[account]);
    assert.deepEqual(usage.rows[0]?.meter,{minutesUsed:80,agentHours:1.3,minutesIncluded:100});
    await db.exec('set role authenticated');
    await assert.rejects(()=>db.query('select public.client_usage_meter($1)',[account]),/permission denied/);
    await db.exec('reset role');
  }finally{await db.close();}
});
