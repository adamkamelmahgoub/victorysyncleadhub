import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('nightly account health weighs leads, response, tasks, payment and login',async()=>{
  const db=new PGlite();
  const healthy='10000000-0000-4000-8000-000000000001';
  const atRisk='10000000-0000-4000-8000-000000000002';
  const slowLead='20000000-0000-4000-8000-000000000001';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table public.sub_accounts(id uuid primary key,goal_value integer,
        last_active_at timestamptz,health_score integer);
      create table public.leads(id uuid primary key,client_account_id uuid,created_at timestamptz);
      create table public.client_automation_jobs(client_account_id uuid,lead_id uuid,kind text,
        status text,sent_at timestamptz);
      create table public.company_tasks(client_account_id uuid,status text,due_at timestamptz);
      create table public.invoices(client_account_id uuid,status text);
      insert into public.sub_accounts values
        ('${healthy}',1,now(),0),('${atRisk}',2,now()-interval '40 days',100);
      insert into public.leads values
        ('20000000-0000-4000-8000-000000000002','${healthy}',now()-interval '1 day'),
        ('${slowLead}','${atRisk}',now()-interval '1 day');
      insert into public.client_automation_jobs values
        ('${atRisk}','${slowLead}','lead_followup','sent',now()-interval '1 day'+interval '2 minutes');
      insert into public.company_tasks values('${atRisk}','open',now()-interval '1 day');
      insert into public.invoices values('${atRisk}','past_due');`);
    const migration=readFileSync(new URL('../supabase/migrations/20261030_06_agency_operations.sql',import.meta.url),'utf8');
    const start=migration.indexOf('create or replace function public.refresh_client_health_scores()');
    const end=migration.indexOf('end $$;',start);
    assert.ok(start>=0&&end>start,'migration must define the health refresh');
    await db.exec(migration.slice(start,end+'end $$;'.length));
    await db.exec(`revoke all on function public.refresh_client_health_scores() from public,anon,authenticated;
      grant execute on function public.refresh_client_health_scores() to service_role;`);
    assert.equal((await db.query<{changed:number}>('select public.refresh_client_health_scores() changed')).rows[0].changed,2);
    const scores=await db.query<{id:string;health_score:number}>('select id,health_score from public.sub_accounts order by id');
    assert.deepEqual(scores.rows,[{id:healthy,health_score:100},{id:atRisk,health_score:15}]);
    await db.exec('set role authenticated');
    await assert.rejects(()=>db.query('select public.refresh_client_health_scores()'),/permission denied/);
  }finally{await db.close();}
});
