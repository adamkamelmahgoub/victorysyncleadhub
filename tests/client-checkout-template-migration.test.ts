import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import pg from 'pg';

test('checkout template migration is repeatable and gates service provisioning',
  {skip:!process.env.LOCAL_MIGRATION_URL},async()=>{
    const target=new URL(process.env.LOCAL_MIGRATION_URL!);
    assert.ok(['127.0.0.1','localhost','::1'].includes(target.hostname),'Use a local disposable database');
    const client=new pg.Client({connectionString:process.env.LOCAL_MIGRATION_URL});
    await client.connect();
    try{
      await client.query('begin');
      await client.query(`create or replace function auth.role() returns text language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$`);
      const sql=readFileSync(new URL('../supabase/migrations/20261103_04_checkout_account_template.sql',import.meta.url),'utf8')
        .replace(/^--[^\n]*\n/,'').replace(/^begin;\s*/i,'').replace(/\s*commit;\s*$/i,'');
      await client.query(sql);
      await client.query(sql);
      await client.query("select set_config('request.jwt.claim.role','service_role',true)");
      await client.query('savepoint disabled_flag');
      await client.query("update public.user_feature_access set enabled=false where user_id is null and feature_key='client_accounts'");
      await assert.rejects(client.query("select public.portal_apply_account_template('10000000-0000-4000-8000-000000000001','starter')"),
        /Access denied/);
      await client.query('rollback to savepoint disabled_flag');
      await client.query("update public.user_feature_access set enabled=true where user_id is null and feature_key='client_accounts'");
      await client.query("select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true)");
      await client.query('savepoint missing_account');
      await assert.rejects(client.query("select public.portal_apply_account_template('10000000-0000-4000-8000-000000000001','starter')"),
        /Client account not found/);
      await client.query('rollback to savepoint missing_account');
      await client.query(`insert into public.organizations(id,name)
        values('cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1','Victory Sync')
        on conflict (id) do nothing`);
      await client.query(`insert into public.sub_accounts(id,name,slug,owner_email,owner_name,package,plan,organization_id)
        values('10000000-0000-4000-8000-000000000001','QA Plumbing','qa-plumbing',
          'owner@example.test','QA Owner','starter','starter','cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1')`);
      const first=(await client.query("select public.portal_apply_account_template('10000000-0000-4000-8000-000000000001','starter') result")).rows[0].result;
      const second=(await client.query("select public.portal_apply_account_template('10000000-0000-4000-8000-000000000001','starter') result")).rows[0].result;
      assert.deepEqual(second,first);
      assert.equal(first.forms,1);
      assert.equal(first.pages,1);
      assert.equal(first.sequences,2);
      await client.query(`insert into public.organizations(id,name)
        values('60000000-0000-4000-8000-000000000001','Other Agency')`);
      await client.query(`insert into public.sub_accounts(id,name,slug,owner_email,owner_name,package,plan,organization_id)
        values('60000000-0000-4000-8000-000000000002','Other Plumbing','other-plumbing',
          'other@example.test','Other Owner','starter','starter','60000000-0000-4000-8000-000000000001')`);
      await client.query('savepoint other_agency');
      await assert.rejects(client.query("select public.portal_apply_account_template('60000000-0000-4000-8000-000000000002','starter')"),
        /Access denied/);
      await client.query('rollback to savepoint other_agency');
    }finally{await client.query('rollback').catch(()=>undefined);await client.end();}
  });
