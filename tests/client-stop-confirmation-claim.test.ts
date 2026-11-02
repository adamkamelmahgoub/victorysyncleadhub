import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('STOP confirmation claim is one-time, account-scoped and service-only',async()=>{
  const db=new PGlite();
  const account='10000000-0000-4000-8000-000000000001';
  const job='30000000-0000-4000-8000-000000000001';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table public.sub_accounts(id uuid primary key);
      create table public.client_automation_jobs(id uuid primary key,client_account_id uuid,
        kind text,status text,payload jsonb);
      insert into public.sub_accounts values('${account}');
      insert into public.client_automation_jobs values('${job}','${account}',
        'stop_confirmation','processing','{"phone":"5125550101"}');`);
    const sql=readFileSync(new URL('../supabase/migrations/20261102_12_stop_confirmation_claim.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql);
    const claim=async(phone:string,accountId=account)=>{
      const result=await db.query<{claimed:boolean}>(
        'select public.client_claim_stop_confirmation($1,$2,$3) claimed',[accountId,phone,job]);
      return result.rows[0].claimed;
    };
    assert.equal(await claim('+1512555010'),false);
    assert.equal(await claim('+15125550101','10000000-0000-4000-8000-000000000002'),false);
    assert.equal(await claim('+15125550101'),true);
    assert.equal(await claim('+15125550101'),false);
    await db.query('select public.client_mark_stop_confirmation_sent($1,$2,$3)',
      [account,'+15125550101',job]);
    const sent=await db.query<{sent_at:string|null}>(
      'select sent_at from public.client_stop_confirmation_claims where client_account_id=$1',[account]);
    assert.ok(sent.rows[0].sent_at);
    await db.exec('set role authenticated');
    await assert.rejects(()=>db.query('select public.client_claim_stop_confirmation($1,$2,$3)',
      [account,'+15125550102',job]),/permission denied/);
  }finally{await db.close();}
});
