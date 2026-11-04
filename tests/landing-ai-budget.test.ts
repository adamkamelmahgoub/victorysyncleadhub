import assert from 'node:assert/strict';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {aiPageLimitsSql,assertAiPageLimits,aiUsageCostCents} from '../lib/landing-ai-budget.js';

test('AI usage requires a finite nonnegative provider cost',()=>{
  assert.equal(aiUsageCostCents({cost:0.25}),25);
  assert.equal(aiUsageCostCents({cost:0}),0);
  assert.throws(()=>aiUsageCostCents(undefined),/valid cost/);
  assert.throws(()=>aiUsageCostCents({cost:NaN}),/valid cost/);
  assert.throws(()=>aiUsageCostCents({cost:-1}),/valid cost/);
});

test('AI budget aggregates every account in the organization for the current month',async()=>{
  const db=new PGlite();
  const org='10000000-0000-4000-8000-000000000001';
  const otherOrg='10000000-0000-4000-8000-000000000002';
  const user='20000000-0000-4000-8000-000000000001';
  try{
    await db.exec(`create table public.organizations(id uuid primary key,settings jsonb);
      create table public.sub_accounts(id uuid primary key,organization_id uuid);
      create table public.ai_requests(user_id uuid,client_account_id uuid,
        cost_cents numeric,created_at timestamptz);`);
    await db.query(`insert into public.organizations values($1,'{"ai_monthly_budget_cents":100}'),($2,'{}')`,
      [org,otherOrg]);
    await db.query(`insert into public.sub_accounts values
      ('30000000-0000-4000-8000-000000000001',$1),
      ('30000000-0000-4000-8000-000000000002',$1),
      ('30000000-0000-4000-8000-000000000003',$2)`,[org,otherOrg]);
    await db.query(`insert into public.ai_requests values
      ($1,'30000000-0000-4000-8000-000000000001',60,now()),
      ($1,'30000000-0000-4000-8000-000000000002',50,now()),
      ($1,'30000000-0000-4000-8000-000000000003',900,now()),
      ($1,'30000000-0000-4000-8000-000000000001',700,date_trunc('month',now())-interval '1 day')`,[user]);
    const result=await db.query<{requests:number;spent:number;budget:number|null}>(aiPageLimitsSql,[user,org]);
    assert.equal(result.rows[0].spent,110);
    assert.equal(result.rows[0].budget,100);
    assert.equal(result.rows[0].requests,3);
    assert.throws(()=>assertAiPageLimits(result.rows[0]),/Monthly AI budget reached/);
    const other=await db.query<{requests:number;spent:number;budget:number|null}>(aiPageLimitsSql,[user,otherOrg]);
    assert.equal(other.rows[0].spent,900);
    assert.equal(other.rows[0].budget,null);
    assert.doesNotThrow(()=>assertAiPageLimits(other.rows[0]));
    assert.throws(()=>assertAiPageLimits({requests:30,spent:0,budget:null}),/AI request limit reached/);
  }finally{await db.close();}
});
