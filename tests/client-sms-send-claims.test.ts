import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('SMS claim reserves a processing job once before provider delivery',async()=>{
  const db=new PGlite();
  const account='10000000-0000-4000-8000-000000000001';
  const other='10000000-0000-4000-8000-000000000002';
  const job='20000000-0000-4000-8000-000000000001';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table public.sub_accounts(id uuid primary key);
      create table public.client_automation_jobs(id uuid primary key,
        client_account_id uuid,kind text,status text);
      insert into public.sub_accounts values('${account}'),('${other}');
      insert into public.client_automation_jobs values
        ('${job}','${account}','review_request','processing'),
        ('20000000-0000-4000-8000-000000000002','${account}','lead_followup','pending');`);
    const sql=readFileSync(new URL('../supabase/migrations/20261107_09_sms_job_claims.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql);
    const claim=async(accountId:string,phone:string,jobId=job)=>{
      const result=await db.query<{claimed:boolean}>(
        'select public.client_claim_sms_send($1,$2,$3) claimed',[accountId,phone,jobId]);
      return result.rows[0].claimed;
    };
    assert.equal(await claim(other,'+15125550101'),false);
    assert.equal(await claim(account,'5125550101'),false);
    assert.equal(await claim(account,'+15125550101','20000000-0000-4000-8000-000000000002'),false);
    assert.equal(await claim(account,'+15125550101'),true);
    assert.equal(await claim(account,'+15125550101'),false);
    assert.equal(await claim(account,'+15125550102'),false);
    await db.query('select public.client_mark_sms_send_sent($1,$2,$3)',[account,'+15125550101',job]);
    const recorded=await db.query<{sent_at:string|null}>(
      'select sent_at from public.client_sms_send_claims where job_id=$1',[job]);
    assert.ok(recorded.rows[0].sent_at);
    await db.exec('set role authenticated');
    await assert.rejects(()=>db.query('select public.client_claim_sms_send($1,$2,$3)',
      [account,'+15125550103',job]),/permission denied/);
  }finally{await db.close();}
});
