import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('Won stage schedules one review job after the configured delay',async()=>{
  const db=new PGlite();
  const account='10000000-0000-4000-8000-000000000001';
  const other='10000000-0000-4000-8000-000000000002';
  const newStage='20000000-0000-4000-8000-000000000001';
  const wonStage='20000000-0000-4000-8000-000000000002';
  const lead='30000000-0000-4000-8000-000000000001';
  try{
    await db.exec(`create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create table public.sub_accounts(id uuid primary key,settings jsonb);
      create table public.pipeline_stages(id uuid primary key,name text);
      create table public.leads(id uuid primary key,client_account_id uuid,source text,
        pipeline_stage_id uuid,notes text);
      create table public.client_lead_events(client_account_id uuid,lead_id uuid,event_type text,
        body text,metadata jsonb,actor_id uuid);
      create table public.client_automation_jobs(client_account_id uuid,lead_id uuid,kind text,
        source_id text,run_at timestamptz,unique(kind,source_id));
      create function public.client_delivery_enabled(p_account uuid) returns boolean
        language sql stable as $$select p_account='${account}'::uuid$$;`);
    const migration=readFileSync(new URL('../supabase/migrations/20261026_07_client_workflow_triggers.sql',import.meta.url),'utf8');
    const start=migration.indexOf('create or replace function public.log_client_lead_change()');
    const end=migration.indexOf('end $$;',start);
    assert.ok(start>=0&&end>start,'migration must define the Won stage trigger');
    await db.exec(migration.slice(start,end+'end $$;'.length));
    await db.exec(`create trigger client_lead_change_trigger
      after insert or update of pipeline_stage_id,notes on public.leads
      for each row execute function public.log_client_lead_change();`);
    await db.query(`insert into public.sub_accounts values($1,'{"review_delay_hours":4}'),($2,'{}')`,[account,other]);
    await db.query('insert into public.pipeline_stages values($1,$2),($3,$4)',
      [newStage,'New',wonStage,'Won']);
    await db.query('insert into public.leads values($1,$2,$3,$4,$5),($6,$7,$8,$4,$5)',
      [lead,account,'form',newStage,null,'30000000-0000-4000-8000-000000000002',other,'form']);
    await db.query('update public.leads set pipeline_stage_id=$1 where id=$2 or client_account_id=$3',
      [wonStage,lead,other]);
    const result=await db.query<{client_account_id:string;lead_id:string;kind:string;source_id:string;delay_seconds:number}>(`
      select client_account_id,lead_id,kind,source_id,
        extract(epoch from run_at-now())::integer delay_seconds
      from public.client_automation_jobs`);
    assert.equal(result.rows.length,1);
    assert.equal(result.rows[0].client_account_id,account);
    assert.equal(result.rows[0].lead_id,lead);
    assert.equal(result.rows[0].kind,'review_request');
    assert.equal(result.rows[0].source_id,`lead:${lead}`);
    assert.ok(Math.abs(result.rows[0].delay_seconds-4*3600)<60);
    await db.query('update public.leads set notes=$1 where id=$2',['Customer called back',lead]);
    await db.query('update public.leads set pipeline_stage_id=$1 where id=$2',[newStage,lead]);
    await db.query('update public.leads set pipeline_stage_id=$1 where id=$2',[wonStage,lead]);
    assert.equal((await db.query('select count(*)::integer n from public.client_automation_jobs')).rows[0].n,1);
    assert.equal((await db.query("select count(*)::integer n from public.client_lead_events where event_type='note'")).rows[0].n,1);
  }finally{await db.close();}
});
