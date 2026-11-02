import { test } from 'node:test';
import assert from 'node:assert/strict';

const tables = [
  'leads', 'landing_pages', 'landing_page_events', 'marketing_landing_pages',
  'marketing_landing_page_events', 'forms', 'form_submissions', 'sequences',
  'sequence_enrollments', 'automation_workflows', 'review_requests', 'reviews',
  'review_sources', 'booking_appointments', 'call_reports', 'mightycall_reports',
  'mightycall_sms_messages', 'report_sends', 'invoices', 'conversations', 'messages',
  'company_tasks', 'contact_tasks', 'pipelines', 'pipeline_stages', 'sequence_steps',
  'invoice_items', 'mightycall_webhook_inbox', 'report_recipients',
];

test('client tenancy is enforced in the database', { skip: !process.env.DATABASE_URL }, async () => {
  const { Client } = await import('pg');
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const rows = await db.query(`
      select c.relname as name, c.relrowsecurity as rls_enabled,
        exists (select 1 from pg_policies p where p.schemaname = 'public'
          and p.tablename = c.relname and p.policyname = 'client_tenancy_guard'
          and p.permissive = 'RESTRICTIVE') as has_guard,
        exists (select 1 from information_schema.columns col
          where col.table_schema = 'public' and col.table_name = c.relname
          and col.column_name = 'client_account_id') as has_account
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any($1::text[])
    `, [tables]);
    assert.equal(rows.rowCount, tables.length);
    for (const row of rows.rows) {
      assert.equal(row.rls_enabled, true, `${row.name} must enable RLS`);
      assert.equal(row.has_guard, true, `${row.name} must have a restrictive guard`);
      assert.equal(row.has_account, true, `${row.name} must carry a client account`);
    }
    const accessTables = await db.query(`
      select c.relname as name, c.relrowsecurity as rls_enabled,
        exists (select 1 from pg_policies p where p.schemaname = 'public'
          and p.tablename = c.relname and p.policyname = 'team_directory_tenancy'
          and p.permissive = 'RESTRICTIVE') as has_team_guard,
        has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_can_select
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('team_members', 'invite_codes')
    `);
    assert.equal(accessTables.rowCount, 2);
    const team = accessTables.rows.find(row => row.name === 'team_members');
    const invites = accessTables.rows.find(row => row.name === 'invite_codes');
    assert.equal(team.rls_enabled, true);
    assert.equal(team.has_team_guard, true);
    assert.equal(invites.rls_enabled, true);
    assert.equal(invites.authenticated_can_select, false);
    await db.query('begin');
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", ['00000000-0000-4000-8000-000000000000']);
    const access = await db.query(`select public.auth_role() as role,
      public.can_access_account($1::uuid) as can_access,
      public.client_feature_enabled('client_portal') as enabled`,
      ['00000000-0000-4000-8000-000000000001']);
    assert.equal(access.rows[0].role, 'no_access');
    assert.equal(access.rows[0].can_access, false);
    assert.equal(typeof access.rows[0].enabled, 'boolean');
  } finally {
    await db.query('rollback').catch(() => undefined);
    await db.end();
  }
});

test('a client owner cannot read another client or agency prospects', {skip:!process.env.DATABASE_URL}, async()=>{
  const {Client}=await import('pg');
  const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await db.connect();
  try{
    await db.query('begin');
    const accounts=await db.query('select id from public.sub_accounts order by id limit 2');
    assert.equal(accounts.rowCount,2,'test needs two existing client accounts');
    const first=accounts.rows[0].id,second=accounts.rows[1].id;
    const testUser='f9b4126e-78a5-4cdc-92e8-d7f49fb8be5b';
    await db.query(`insert into public.team_members(org_id,client_account_id,role,name,email,status,is_active,auth_user_id)
      values('cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',$1,'client_owner','Tenant test','tenant-test@example.invalid','active',true,$2)`,[first,testUser]);
    await db.query(`insert into public.user_feature_access(org_id,user_id,feature_key,enabled)
      values('cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',null,'client_portal',true)
      on conflict(org_id,feature_key) where user_id is null do update set enabled=true`,[]);
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[testUser]);
    await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:testUser,email:'tenant-test@example.invalid',role:'authenticated'})]);
    const own=await db.query('select public.can_access_account($1) as allowed',[first]);
    const other=await db.query('select public.can_access_account($1) as allowed',[second]);
    assert.equal(own.rows[0].allowed,true);
    assert.equal(other.rows[0].allowed,false);
    const visible=await db.query('select public.portal_accounts() as accounts');
    assert.deepEqual(visible.rows[0].accounts.map(a=>a.id),[first]);
    const prospects=await db.query('select count(*)::int as n from public.leads where client_account_id is null');
    assert.equal(prospects.rows[0].n,0);
    await db.query('savepoint forbidden');
    await assert.rejects(db.query("select public.portal_snapshot($1,'leads')",[second]));
    await db.query('rollback to savepoint forbidden');
  }finally{await db.query('rollback').catch(()=>undefined);await db.end()}
});
