import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('manual review requests require a review link and an eligible account lead',async()=>{
  const db=new PGlite();
  const account='10000000-0000-4000-8000-000000000001';
  const other='10000000-0000-4000-8000-000000000002';
  const lead='20000000-0000-4000-8000-000000000001';
  try{
    await db.exec(`create role anon;create role authenticated;
      create table public.sub_accounts(id uuid primary key,settings jsonb,google_review_link text);
      create table public.leads(id uuid primary key,client_account_id uuid,created_at timestamptz default now(),
        phone text,dnc boolean,opt_in_source text,source text);
      create table public.review_requests(id uuid primary key default gen_random_uuid(),client_account_id uuid,
        lead_id uuid,contact_name text,contact_phone text,channel text,platform text,status text);
      create table public.client_automation_jobs(client_account_id uuid,lead_id uuid,kind text,
        source_id text,run_at timestamptz);
      create function public.can_access_account(uuid) returns boolean language sql stable as $$select true$$;
      create function public.portal_page_allowed(text) returns boolean language sql stable as $$select true$$;
      create function public.auth_role() returns text language sql stable as $$select 'client_owner'::text$$;
      create function public.client_delivery_enabled(uuid) returns boolean language sql stable as $$select true$$;
      create function public.client_phone_dnc(uuid,text) returns boolean language sql stable as $$select false$$;`);
    const sql=readFileSync(new URL('../supabase/migrations/20261107_10_review_request_readiness.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql);
    await db.query(`insert into public.sub_accounts values($1,'{"review_delay_hours":3}',null),($2,'{}','https://google.example/review')`,
      [account,other]);
    await db.query(`insert into public.leads(id,client_account_id,phone,opt_in_source,source)
      values($1,$2,'+15125550101','form','website'),
        ('20000000-0000-4000-8000-000000000002',$3,'+15125550101','form','website')`,
      [lead,account,other]);
    const request=(id:string,phone:string)=>db.query<{portal_request_review:string}>(
      'select public.portal_request_review($1,$2,$3,null)',[id,'Alex Customer',phone]);
    await assert.rejects(request(account,'+15125550101'),/Add a Google review link/);
    assert.equal((await db.query('select count(*)::integer n from public.client_automation_jobs')).rows[0].n,0);
    await db.query('update public.sub_accounts set google_review_link=$1 where id=$2',
      ['https://google.example/review',account]);
    await assert.rejects(request(account,'+15125550999'),/An opted-in lead/);
    const result=await request(account,'+15125550101');
    assert.ok(result.rows[0].portal_request_review);
    const jobs=await db.query<{client_account_id:string;lead_id:string;delay_seconds:number}>(`
      select client_account_id,lead_id,extract(epoch from run_at-now())::integer delay_seconds
      from public.client_automation_jobs`);
    assert.equal(jobs.rows.length,1);
    assert.equal(jobs.rows[0].client_account_id,account);
    assert.equal(jobs.rows[0].lead_id,lead);
    assert.ok(Math.abs(jobs.rows[0].delay_seconds-3*3600)<60);
  }finally{await db.close();}
});
