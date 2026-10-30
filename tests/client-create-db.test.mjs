import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('agency admin can create a client and invitation atomically', {skip:!process.env.DATABASE_URL}, async()=>{
  const {Client}=await import('pg');
  const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await db.connect();
  try{
    await db.query('begin');
    const migration=readFileSync(new URL('../supabase/migrations/20261030_04_direct_client_setup.sql',import.meta.url),'utf8')
      .replace(/^begin;\s*/i,'').replace(/\s*commit;\s*$/i,'');
    await db.query(migration);
    await db.query(migration);
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",['a5f6f998-5ed5-4c0c-88ac-9f27d677697a']);
    await db.query("select set_config('request.jwt.claim.role','authenticated',true)");
    await db.query("select set_config('request.jwt.claim.email','adam@victorysync.com',true)");
    const access=await db.query("select public.is_agency_admin() as admin,public.client_feature_enabled('client_accounts') as enabled");
    assert.deepEqual(access.rows[0],{admin:true,enabled:true});
    const result=await db.query("select public.portal_create_client_manual($1,$2,$3,$4,$5,$6) as created",
      ['QA Test Business','+15125550101','https://example.com','starter','qa-client-20261030@example.com','QA Owner']);
    const {accountId,inviteCode}=result.rows[0].created;
    assert.ok(accountId);
    assert.match(inviteCode,/^[0-9a-f]{32}$/);
    const provisioned=await db.query(`select a.name,a.package,a.company_id,
      (select count(*)::int from public.company_tasks t where t.client_account_id=a.id) as tasks,
      (select count(*)::int from public.invite_codes i where i.client_account_id=a.id) as invites
      from public.sub_accounts a where a.id=$1`,[accountId]);
    assert.equal(provisioned.rows[0].name,'QA Test Business');
    assert.equal(provisioned.rows[0].package,'starter');
    assert.ok(provisioned.rows[0].company_id);
    assert.ok(provisioned.rows[0].tasks>0);
    assert.equal(provisioned.rows[0].invites,1);
  }finally{await db.query('rollback').catch(()=>undefined);await db.end()}
});
