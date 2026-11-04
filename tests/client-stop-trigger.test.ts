import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('inbound STOP marks only the matching account lead DNC and stops queued work once',async()=>{
  const db=new PGlite();
  const account='10000000-0000-4000-8000-000000000001';
  const other='10000000-0000-4000-8000-000000000002';
  const phone='+15125550101';
  try{
    await db.exec(`create table public.leads(id uuid primary key,client_account_id uuid,
      phone text,dnc boolean default false,updated_at timestamptz);
      create table public.client_automation_jobs(id uuid primary key default gen_random_uuid(),
        client_account_id uuid,lead_id uuid,kind text,source_id text,status text default 'pending',
        last_error text,payload jsonb default '{}'::jsonb,unique(kind,source_id));
      create table public.sequence_enrollments(id uuid primary key,client_account_id uuid,
        lead_id uuid,status text,stopped_reason text);
      create table public.mightycall_sms_messages(id uuid primary key,client_account_id uuid,
        direction text,message_text text,body text,message text,from_number text,sender text);`);
    const migration=readFileSync(new URL('../supabase/migrations/20261026_07_client_workflow_triggers.sql',import.meta.url),'utf8');
    const start=migration.indexOf('create or replace function public.stop_client_texts()');
    const end=migration.indexOf('end $$;',start);
    assert.ok(start>=0&&end>start,'migration must define STOP trigger');
    await db.exec(migration.slice(start,end+'end $$;'.length));
    await db.exec(`create trigger client_sms_stop after insert or update of client_account_id
      on public.mightycall_sms_messages for each row execute function public.stop_client_texts();`);
    await db.query(`insert into public.leads(id,client_account_id,phone) values
      ('20000000-0000-4000-8000-000000000001',$1,$3),
      ('20000000-0000-4000-8000-000000000002',$2,$3)`,[account,other,phone]);
    await db.query(`insert into public.client_automation_jobs(client_account_id,lead_id,kind,source_id) values
      ($1,'20000000-0000-4000-8000-000000000001','lead_nudge','a'),
      ($2,'20000000-0000-4000-8000-000000000002','lead_nudge','b')`,[account,other]);
    await db.query(`insert into public.sequence_enrollments values
      ('30000000-0000-4000-8000-000000000001',$1,'20000000-0000-4000-8000-000000000001','active',null),
      ('30000000-0000-4000-8000-000000000002',$2,'20000000-0000-4000-8000-000000000002','active',null)`,[account,other]);
    await db.query(`insert into public.mightycall_sms_messages(id,client_account_id,direction,message_text,from_number)
      values('40000000-0000-4000-8000-000000000001',$1,'inbound','STOP please',$2)`,[account,phone]);
    await db.query(`insert into public.mightycall_sms_messages(id,client_account_id,direction,message_text,from_number)
      values('40000000-0000-4000-8000-000000000002',$1,'inbound','UNSUBSCRIBE',$2)`,[account,phone]);
    const leads=await db.query<{client_account_id:string;dnc:boolean}>('select client_account_id,dnc from public.leads order by id');
    assert.deepEqual(leads.rows.map(x=>x.dnc),[true,false]);
    const jobs=await db.query<{kind:string;status:string}>(
      'select kind,status from public.client_automation_jobs where client_account_id=$1 order by kind',[account]);
    assert.deepEqual(jobs.rows,[{kind:'lead_nudge',status:'cancelled'},{kind:'stop_confirmation',status:'pending'}]);
    assert.equal((await db.query(`select status from public.client_automation_jobs where client_account_id=$1`,[other])).rows[0].status,'pending');
    assert.equal((await db.query(`select status from public.sequence_enrollments where client_account_id=$1`,[account])).rows[0].status,'stopped');
    assert.equal((await db.query(`select status from public.sequence_enrollments where client_account_id=$1`,[other])).rows[0].status,'active');
  }finally{await db.close();}
});
