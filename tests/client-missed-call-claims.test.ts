import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('missed-call claim is idempotent, account scoped, and restricted to service role',async()=>{
  const db=new PGlite();
  const account='10000000-0000-4000-8000-000000000001';
  const first='30000000-0000-4000-8000-000000000001';
  const second='30000000-0000-4000-8000-000000000002';
  try{
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema if not exists public;
      create table public.sub_accounts(id uuid primary key);
      create table public.client_automation_jobs(id uuid primary key,client_account_id uuid,kind text,status text);
      create table public.mightycall_sms_messages(client_account_id uuid,direction text,metadata jsonb,created_at timestamptz,to_number text);
      insert into public.sub_accounts values('${account}');
      insert into public.client_automation_jobs values
        ('${first}','${account}','missed_call_text','processing'),
        ('${second}','${account}','missed_call_text','processing');`);
    const migration=readFileSync(new URL('../supabase/migrations/20261101_02_missed_call_text_claims.sql',import.meta.url),'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const claim=async(job:string,phone:string)=>{
      const result=await db.query<{claimed:boolean}>(
        `select public.client_claim_missed_call_text($1,$2,$3) claimed`,[account,phone,job]);
      return result.rows[0]?.claimed;
    };
    assert.equal(await claim(first,'+15125550101'),true);
    assert.equal(await claim(second,'+15125550101'),false);
    assert.equal(await claim(second,'+1512555010'),false);
    await db.query('select public.client_mark_missed_call_text_sent($1,$2,$3)',[account,'+15125550101',first]);
    const sent=await db.query<{sent_at:string|null}>(
      'select sent_at from public.client_missed_call_text_windows where client_account_id=$1 and phone=$2',
      [account,'+15125550101']);
    assert.ok(sent.rows[0]?.sent_at);
    await db.exec('set role authenticated');
    await assert.rejects(()=>db.query('select public.client_claim_missed_call_text($1,$2,$3)',
      [account,'+15125550102',second]),/permission denied/);
    await db.exec('reset role');
    await db.query(`update public.client_missed_call_text_windows set claimed_at=now()-interval '25 hours'
      where client_account_id=$1 and phone=$2`,[account,'+15125550101']);
    assert.equal(await claim(second,'+15125550101'),true);
  }finally{await db.close();}
});
