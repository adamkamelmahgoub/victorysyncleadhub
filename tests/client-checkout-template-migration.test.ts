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
      await client.query('create extension if not exists pgcrypto with schema extensions');
      await client.query(`create or replace function extensions.gen_random_bytes(integer) returns bytea
        language sql as $$ select public.gen_random_bytes($1) $$`);
      await client.query(`create or replace function extensions.digest(text,text) returns bytea
        language sql as $$ select public.digest($1,$2) $$`);
      await client.query(`create or replace function auth.role() returns text language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$`);
      const sql=readFileSync(new URL('../supabase/migrations/20261103_04_checkout_account_template.sql',import.meta.url),'utf8')
        .replace(/^--[^\n]*\n/,'').replace(/^begin;\s*/i,'').replace(/\s*commit;\s*$/i,'');
      await client.query(sql);
      await client.query(sql);
      const stagesSql=readFileSync(new URL('../supabase/migrations/20261103_05_client_pipeline_default_stages.sql',import.meta.url),'utf8')
        .replace(/^begin;\s*/i,'').replace(/\s*commit;\s*$/i,'');
      await client.query(stagesSql);
      await client.query(stagesSql);
      const creationSql=readFileSync(new URL('../supabase/migrations/20261103_06_client_snapshot_single_source.sql',import.meta.url),'utf8')
        .replace(/^--[^\n]*\n/,'').replace(/^begin;\s*/i,'').replace(/\s*commit;\s*$/i,'');
      await client.query(creationSql);
      await client.query(creationSql);
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
      for(const packageName of ['starter','scale','domination','overflow','business_hours','coverage_247',
        'appt_part_time','appt_full_time','revive','custom']){
        await client.query('savepoint package_case');
        await client.query('update public.sub_accounts set package=$1,plan=$1 where id=$2',
          [packageName,'10000000-0000-4000-8000-000000000001']);
        const first=(await client.query('select public.portal_apply_account_template($1,$2) result',
          ['10000000-0000-4000-8000-000000000001',packageName])).rows[0].result;
        const second=(await client.query('select public.portal_apply_account_template($1,$2) result',
          ['10000000-0000-4000-8000-000000000001',packageName])).rows[0].result;
        assert.deepEqual(second,first,`${packageName} must apply once`);
        assert.equal(first.forms,1);
        assert.equal(first.pages,1);
        assert.equal(first.sequences,2);
        assert.ok(first.tasks>=11);
        const stageRows=(await client.query('select name,key from public.pipeline_stages where pipeline_id=$1',
          [first.pipelineId])).rows;
        assert.deepEqual(stageRows.map(stage=>stage.key).sort(),
          ['new','contacted','quoted','booked','won','lost'].sort(),JSON.stringify({packageName,stageRows}));
        const expectedWorkflows=Number((await client.query(
          "select jsonb_array_length(payload->'workflows') count from public.account_templates where key=$1",
          [packageName])).rows[0].count);
        assert.equal(first.workflows,expectedWorkflows);
        await client.query('rollback to savepoint package_case');
      }
      await client.query(`insert into public.organizations(id,name)
        values('60000000-0000-4000-8000-000000000001','Other Agency')`);
      await client.query(`insert into public.sub_accounts(id,name,slug,owner_email,owner_name,package,plan,organization_id)
        values('60000000-0000-4000-8000-000000000002','Other Plumbing','other-plumbing',
          'other@example.test','Other Owner','starter','starter','60000000-0000-4000-8000-000000000001')`);
      await client.query('savepoint other_agency');
      await assert.rejects(client.query("select public.portal_apply_account_template('60000000-0000-4000-8000-000000000002','starter')"),
        /Access denied/);
      await client.query('rollback to savepoint other_agency');
      const agencyPipeline=(await client.query("insert into public.pipelines(name) values('QA prospect pipeline') returning id")).rows[0].id;
      const meeting=(await client.query("select count(*) from public.pipeline_stages where pipeline_id=$1 and key='meeting_booked'",
        [agencyPipeline])).rows[0].count;
      assert.equal(Number(meeting),1,'agency prospect pipelines retain the meeting stage');
      await client.query(`insert into public.companies(id,name,stage,source,phone,website,email,contact_name)
        values('70000000-0000-4000-8000-000000000001','Checkout HVAC','client','checkout',
          '+15125550100','https://example.test','checkout@example.test','Checkout Owner')`);
      const created=(await client.query("select public.portal_create_client('70000000-0000-4000-8000-000000000001','starter','checkout@example.test','Checkout Owner') result")).rows[0].result;
      const beforeSnapshot=(await client.query(`select
        (select count(*)::integer from public.company_tasks where client_account_id=$1) tasks,
        (select count(*)::integer from public.automation_workflows where client_account_id=$1) workflows`,
        [created.accountId])).rows[0];
      assert.deepEqual(beforeSnapshot,{tasks:0,workflows:0});
      await client.query('select public.portal_apply_account_template($1,$2)',[created.accountId,'starter']);
      const duplicateTasks=(await client.query(`select title,count(*)::integer as count from public.company_tasks
        where client_account_id=$1 group by title having count(*)>1`,[created.accountId])).rows;
      assert.deepEqual(duplicateTasks,[]);
      const actualTasks=Number((await client.query('select count(*) from public.company_tasks where client_account_id=$1',
        [created.accountId])).rows[0].count);
      const templateTasks=Number((await client.query(
        "select jsonb_array_length(payload->'onboarding_tasks') count from public.account_templates where key='starter'"
      )).rows[0].count);
      assert.equal(actualTasks,templateTasks,'new clients receive one onboarding checklist');
      const actualWorkflows=Number((await client.query('select count(*) from public.automation_workflows where client_account_id=$1',
        [created.accountId])).rows[0].count);
      const templateWorkflows=Number((await client.query(
        "select jsonb_array_length(payload->'workflows') count from public.account_templates where key='starter'"
      )).rows[0].count);
      assert.equal(actualWorkflows,templateWorkflows,'new clients receive one workflow set');
    }finally{await client.query('rollback').catch(()=>undefined);await client.end();}
  });
