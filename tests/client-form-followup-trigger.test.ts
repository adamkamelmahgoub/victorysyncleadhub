import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const accountA='10000000-0000-4000-8000-000000000001';
const accountB='10000000-0000-4000-8000-000000000002';
const leadA='20000000-0000-4000-8000-000000000001';
const leadB='20000000-0000-4000-8000-000000000002';
const submissionA='30000000-0000-4000-8000-000000000001';

test('submitted form enqueues one account-scoped speed-to-lead set and skips duplicates',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create table public.automation_workflows(
      id uuid primary key,client_account_id uuid,trigger_type text,is_active boolean,actions jsonb);
      create table public.client_automation_jobs(
        client_account_id uuid,lead_id uuid,workflow_id uuid,kind text,source_id text,
        run_at timestamptz,unique(kind,source_id));
      create table public.form_submissions(id uuid primary key,client_account_id uuid,lead_id uuid);
      create function public.client_delivery_enabled(p_account uuid) returns boolean
        language sql stable as $$select p_account='${accountA}'::uuid$$;`);
    const migration=readFileSync(new URL('../supabase/migrations/20261026_07_client_workflow_triggers.sql',import.meta.url),'utf8');
    const start=migration.indexOf('create or replace function public.enqueue_form_followup()');
    const end=migration.indexOf('end $$;',start);
    assert.ok(start>=0&&end>start,'migration must define the form trigger');
    await db.exec(migration.slice(start,end+'end $$;'.length));
    await db.exec(`create trigger form_followup_job after insert or update of lead_id on public.form_submissions
      for each row execute function public.enqueue_form_followup();`);
    const actions=JSON.stringify([{type:'sms_followup'},{type:'email_followup'},
      {type:'sms_nudge',day:1},{type:'sms_nudge',day:3},{type:'owner_alert'},{type:'agent_call_task'}]);
    await db.query(`insert into public.automation_workflows values
      ('40000000-0000-4000-8000-000000000001',$1,'form_submitted',true,$3::jsonb),
      ('40000000-0000-4000-8000-000000000002',$2,'form_submitted',true,$3::jsonb)`,
      [accountA,accountB,actions]);
    await db.query('insert into public.form_submissions values($1,$2,$3),($4,$5,$6)',
      [submissionA,accountA,leadA,'30000000-0000-4000-8000-000000000002',accountB,leadB]);
    const jobs=await db.query<{client_account_id:string;lead_id:string;kind:string;source_id:string;delay_seconds:number}>(`
      select client_account_id,lead_id,kind,source_id,
        extract(epoch from run_at-now())::integer delay_seconds
      from public.client_automation_jobs order by kind,source_id`);
    assert.equal(jobs.rows.length,6);
    assert.ok(jobs.rows.every(job=>job.client_account_id===accountA&&job.lead_id===leadA));
    assert.deepEqual(jobs.rows.map(job=>job.kind),[
      'agent_call_task','lead_email','lead_followup','lead_nudge','lead_nudge','owner_alert']);
    assert.deepEqual(jobs.rows.filter(job=>job.kind==='lead_nudge').map(job=>job.source_id),
      [`${submissionA}:day1`,`${submissionA}:day3`]);
    for(const job of jobs.rows){
      const expected=job.source_id.endsWith(':day3')?3*86400:job.source_id.endsWith(':day1')?86400:0;
      assert.ok(Math.abs(job.delay_seconds-expected)<60,`${job.kind} should run at its configured delay`);
    }
    await db.query('update public.form_submissions set lead_id=$1 where id=$2',[leadA,submissionA]);
    assert.equal((await db.query('select count(*)::integer n from public.client_automation_jobs')).rows[0].n,6);
  }finally{await db.close();}
});
