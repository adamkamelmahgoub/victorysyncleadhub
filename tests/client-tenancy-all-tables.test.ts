import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {Client} from 'pg';

type QaDb={exec:(sql:string)=>Promise<unknown>;query:<T=Record<string,unknown>>(
  sql:string,params?:unknown[])=>Promise<{rows:T[]}>;close:()=>Promise<void>};
async function openQaDb():Promise<QaDb>{
  const connection=process.env.LOCAL_POSTGRES_URL;
  if(!connection)return new PGlite() as unknown as QaDb;
  const url=new URL(connection);
  if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/victorysync_tenancy_qa')
    throw new Error('Native RLS tests require the local victorysync_tenancy_qa database');
  const client=new Client({connectionString:connection,ssl:false});
  await client.connect();
  await client.query('drop schema if exists auth cascade; drop schema if exists public cascade; create schema public');
  return {exec:async sql=>{await client.query(sql)},query:async(sql,params)=>{
    const result=await client.query(sql,params);
    return {rows:result.rows};
  },close:async()=>{await client.end()}};
}

const org='cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
const accountA='10000000-0000-4000-8000-000000000001';
const accountB='10000000-0000-4000-8000-000000000002';
const clientA='20000000-0000-4000-8000-000000000001';
const clientB='20000000-0000-4000-8000-000000000002';
const staff='20000000-0000-4000-8000-000000000003';
const admin='20000000-0000-4000-8000-000000000004';
const clientStaff='20000000-0000-4000-8000-000000000005';
const unassignedStaff='20000000-0000-4000-8000-000000000006';
const scopedTables=[
  'leads','landing_pages','landing_page_events','marketing_landing_pages',
  'marketing_landing_page_events','forms','form_submissions','sequences',
  'sequence_steps','sequence_enrollments','automation_workflows','review_requests',
  'reviews','review_sources','booking_appointments','call_reports',
  'mightycall_reports','mightycall_sms_messages','mightycall_webhook_inbox',
  'report_sends','invoices','invoice_items','conversations','messages',
  'company_tasks','contact_tasks','pipelines','pipeline_stages',
] as const;

test('the tenancy migrations restrict every client table for clients and assigned staff',async()=>{
  const db=await openQaDb();
  try{
    await db.exec(`
      do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then
        create role authenticated; end if;
        if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      end $$;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function public.wf_role() returns text language sql stable as $$ select 'none'::text $$;
      create table public.organizations(id uuid primary key);
      create table public.companies(id uuid primary key);
      create table public.sub_accounts(id uuid primary key,name text,slug text);
      create table public.team_members(id uuid primary key,user_id uuid,auth_user_id text,
        client_account_id uuid,role text,is_active boolean,created_at timestamptz default now());
      create table public.user_feature_access(org_id uuid,user_id uuid,feature_key text,enabled boolean);
      insert into public.organizations values('${org}');
      insert into auth.users values('${clientA}'),('${clientB}'),('${staff}'),('${admin}'),
        ('${clientStaff}'),('${unassignedStaff}');
      insert into public.sub_accounts values
        ('${accountA}','Account A','account-a'),('${accountB}','Account B','account-b');
      insert into public.team_members values
        ('30000000-0000-4000-8000-000000000001','${clientA}',null,'${accountA}','client_owner',true,now()),
        ('30000000-0000-4000-8000-000000000002','${clientB}',null,'${accountB}','client_owner',true,now()),
        ('30000000-0000-4000-8000-000000000003','${staff}',null,null,'agency_staff',true,now()),
        ('30000000-0000-4000-8000-000000000004','${admin}',null,null,'agency_admin',true,now()),
        ('30000000-0000-4000-8000-000000000005','${clientStaff}',null,'${accountA}','client_staff',true,now()),
        ('30000000-0000-4000-8000-000000000006','${unassignedStaff}',null,null,'agency_staff',true,now());
      insert into public.user_feature_access values('${org}',null,'client_portal',true);
    `);
    for(const table of scopedTables){
      const extra=table==='pipeline_stages'?',pipeline_id uuid':
        table==='sequence_steps'?',sequence_id uuid':
        table==='invoice_items'?',invoice_id uuid':
        table==='form_submissions'?',form_id uuid,marketing_page_id uuid,landing_page_id uuid':'';
      await db.exec(`create table public.${table}(id uuid primary key${table==='leads'?',client_account_id uuid':''}${extra});
        alter table public.${table} enable row level security;
        create policy existing_access on public.${table} for all to authenticated
          using(true) with check(true);
        grant select,insert,update,delete on public.${table} to authenticated;`);
    }
    await db.exec(`create table public.landing_page_versions(id uuid primary key,page_id uuid not null);
      alter table public.landing_page_versions enable row level security;
      grant select,insert,update,delete on public.landing_page_versions to authenticated;
      create table public.ai_requests(id uuid primary key,user_id uuid not null,client_account_id uuid);
      alter table public.ai_requests enable row level security;
      grant select on public.ai_requests to authenticated;`);
    await db.exec(`grant usage on schema public,auth to authenticated;
      grant execute on all functions in schema public,auth to authenticated;
      grant select on public.sub_accounts,public.team_members,public.user_feature_access to authenticated;
      alter table public.sub_accounts enable row level security;
      create policy existing_accounts on public.sub_accounts for select to authenticated using(true);`);
    const foundation=readFileSync(new URL('../supabase/migrations/20261026_01_client_tenancy_foundation.sql',import.meta.url),'utf8');
    const accountGuard=readFileSync(new URL('../supabase/migrations/20261102_02_sub_account_rls.sql',import.meta.url),'utf8');
    const mfaGuard=readFileSync(new URL('../supabase/migrations/20261102_09_agency_mfa_rls.sql',import.meta.url),'utf8');
    await db.exec(foundation);await db.exec(foundation);
    await db.exec(accountGuard);await db.exec(accountGuard);
    await db.exec(mfaGuard);await db.exec(mfaGuard);
    await db.exec(`insert into public.sub_account_assignments(sub_account_id,user_id,role_in_account)
      values('${accountA}','${staff}','marketing');`);
    for(const [index,table] of scopedTables.entries()){
      for(const [number,account] of [[1,accountA],[2,accountB],[3,null]] as const){
        const id=`40000000-0000-4000-8000-${String(index*10+number).padStart(12,'0')}`;
        if(table==='form_submissions'){
          const formId=account===null?null:`40000000-0000-4000-8000-${String(
            scopedTables.indexOf('forms')*10+number).padStart(12,'0')}`;
          await db.query(`insert into public.form_submissions(id,client_account_id,form_id)
            values($1,$2,$3)`,[id,account,formId]);
        }else{
          await db.query(`insert into public.${table}(id,client_account_id) values($1,$2)`,[id,account]);
        }
      }
    }
    await db.exec(`insert into public.landing_page_versions(id,page_id) values
      ('60000000-0000-4000-8000-000000000001',
       '40000000-0000-4000-8000-${String(scopedTables.indexOf('landing_pages')*10+1).padStart(12,'0')}');
      insert into public.ai_requests(id,user_id,client_account_id) values
      ('60000000-0000-4000-8000-000000000002','${staff}','${accountA}');`);
    const cases=[
      {user:clientA,expected:[accountA]},
      {user:clientB,expected:[accountB]},
      {user:clientStaff,expected:[accountA]},
      {user:staff,expected:[accountA,null]},
      {user:unassignedStaff,expected:[null]},
      {user:admin,expected:[accountA,accountB,null]},
    ];
    for(const {user,expected} of cases){
      const aal=user===staff||user===unassignedStaff||user===admin?'aal2':'aal1';
      await db.exec(`set request.jwt.claim.sub = '${user}';
        set request.jwt.claims = '{"aal":"${aal}"}'; set role authenticated;`);
      const accounts=await db.query<{id:string}>('select id from public.sub_accounts order by id');
      assert.deepEqual(accounts.rows.map(row=>row.id),expected.filter(Boolean),`sub_accounts for ${user}`);
      for(const table of scopedTables){
        const rows=await db.query<{client_account_id:string|null}>(
          `select client_account_id from public.${table} order by client_account_id nulls last`);
        assert.deepEqual(rows.rows.map(row=>row.client_account_id),expected,`${table} for ${user}`);
        if(user===clientA){
          const changed=await db.query(`update public.${table} set client_account_id=$1
            where client_account_id=$2 returning id`,[accountA,accountB]);
          assert.equal(changed.rows.length,0,`${table} cross-account update`);
          const id=`50000000-0000-4000-8000-${String(scopedTables.indexOf(table)+1).padStart(12,'0')}`;
          const columns=table==='form_submissions'?'id,client_account_id,form_id':'id,client_account_id';
          const values=table==='form_submissions'?'$1,$2,$3':'$1,$2';
          const params=table==='form_submissions'?[id,accountB,
            `40000000-0000-4000-8000-${String(scopedTables.indexOf('forms')*10+2).padStart(12,'0')}`]:
            [id,accountB];
          await assert.rejects(db.query(`insert into public.${table}(${columns}) values(${values})`,params),
            /row-level security/,`${table} cross-account insert`);
        }
      }
      if(user===staff){
        assert.equal((await db.query('select id from public.landing_page_versions')).rows.length,1);
        assert.equal((await db.query('select id from public.ai_requests')).rows.length,1);
        await db.query(`insert into public.landing_page_versions(id,page_id) values($1,$2)`,[
          '60000000-0000-4000-8000-000000000003',
          `40000000-0000-4000-8000-${String(scopedTables.indexOf('landing_pages')*10+1).padStart(12,'0')}`]);
      }
      await db.exec('reset role');
    }
    for(const user of [staff,admin]){
      await db.exec(`set request.jwt.claim.sub = '${user}';
        set request.jwt.claims = '{"aal":"aal1"}'; set role authenticated;`);
      const accounts=await db.query('select id from public.sub_accounts');
      assert.equal(accounts.rows.length,0,`agency ${user} must enroll MFA before seeing accounts`);
      for(const table of scopedTables){
        const rows=await db.query(`select id from public.${table}`);
        assert.equal(rows.rows.length,0,`${table} must be hidden from agency ${user} at AAL1`);
      }
      assert.equal((await db.query('select id from public.landing_page_versions')).rows.length,0);
      assert.equal((await db.query('select id from public.ai_requests')).rows.length,0);
      await assert.rejects(db.query(`insert into public.landing_page_versions(id,page_id) values($1,$2)`,[
        '60000000-0000-4000-8000-000000000004',
        `40000000-0000-4000-8000-${String(scopedTables.indexOf('landing_pages')*10+1).padStart(12,'0')}`]),
      /row-level security/);
      await db.exec(`set request.jwt.claims = '{}'`);
      const noClaim=await db.query<{allowed:boolean}>(`select public.is_agency() as allowed`);
      assert.equal(noClaim.rows[0].allowed,false,'a missing AAL claim must deny agency access');
      assert.equal((await db.query('select id from public.sub_accounts')).rows.length,0);
      await db.exec('reset role');
    }
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.leads'));
  }finally{await db.close()}
});
