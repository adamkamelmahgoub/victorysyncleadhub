import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';

const files=['20261030_05_account_templates_ops.sql','20261030_06_agency_operations.sql'];
const sql=file=>readFileSync(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8')
  .replace(/^begin;\s*/i,'').replace(/\s*commit;\s*$/i,'');

test('package templates and agency operations remain idempotent and tenant scoped',
  {skip:!process.env.DATABASE_URL},async()=>{
    const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
    await client.connect();
    try {
      await client.query('begin');
      const before=Number((await client.query('select count(*) from public.sub_accounts')).rows[0].count);
      assert.ok(before>=3,'existing client accounts must remain present');
      for(const file of files) await client.query(sql(file));
      for(const file of files) await client.query(sql(file));
      const templates=await client.query('select package from public.account_templates');
      for(const packageName of ['starter','scale','domination','overflow','business_hours','coverage_247','appt_part_time','appt_full_time','revive','custom'])
        assert.ok(templates.rows.some(row=>row.package===packageName),`${packageName} template missing`);
      const account=(await client.query('select id from public.sub_accounts order by created_at limit 1')).rows[0];
      const admin=(await client.query("select user_id from public.team_members where role in ('owner','admin','agency_admin') and user_id is not null limit 1")).rows[0];
      assert.ok(account&&admin);
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)",[admin.user_id]);
      await client.query("select set_config('request.jwt.claim.role','authenticated',true)");
      for(const packageName of templates.rows.map(row=>row.package)) {
        await client.query('savepoint template_case');
        const first=(await client.query('select public.portal_apply_account_template($1,$2) result',[account.id,packageName])).rows[0].result;
        const second=(await client.query('select public.portal_apply_account_template($1,$2) result',[account.id,packageName])).rows[0].result;
        assert.deepEqual(second,first,`${packageName} must create every item once`);
        assert.equal(first.forms,1);
        assert.equal(first.pages,1);
        assert.equal(first.sequences,2);
        assert.ok(first.tasks>=11);
        await client.query('rollback to savepoint template_case');
      }
      const overview=(await client.query('select public.portal_agency_overview() result')).rows[0].result;
      assert.equal(overview.length,before);
      assert.ok(overview.every(row=>typeof row.health_score==='number'&&typeof row.mrr_cents==='number'));
      assert.ok(Array.isArray((await client.query('select public.portal_failed_automations() result')).rows[0].result));
      assert.equal((await client.query('select public.portal_set_account_mrr($1,$2) result',[account.id,12500])).rows[0].result,true);
      assert.equal((await client.query('select mrr_cents from public.sub_accounts where id=$1',[account.id])).rows[0].mrr_cents,12500);
      await client.query('reset role');
      await client.query("insert into public.user_feature_access(org_id,user_id,feature_key,enabled) select 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',null,'delivery_automation',true where not exists(select 1 from public.user_feature_access where user_id is null and feature_key='delivery_automation')");
      await client.query("update public.user_feature_access set enabled=true where feature_key='delivery_automation'");
      const job=(await client.query("insert into public.client_automation_jobs(client_account_id,kind,source_id,status,attempts) values($1,'lead_followup',$2,'failed',5) returning id",[account.id,`test-${Date.now()}`])).rows[0];
      const run=(await client.query("insert into public.automation_runs(client_account_id,job_id,status,step,error) values($1,$2,'failed','test','provider error') returning id",[account.id,job.id])).rows[0];
      await client.query('set local role authenticated');
      assert.equal((await client.query('select public.portal_retry_automation($1) result',[run.id])).rows[0].result,true);
      assert.equal((await client.query('select status from public.client_automation_jobs where id=$1',[job.id])).rows[0].status,'pending');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)",['00000000-0000-4000-8000-000000000001']);
      assert.deepEqual((await client.query('select public.portal_agency_overview() result')).rows[0].result,[]);
      assert.deepEqual((await client.query('select public.portal_failed_automations() result')).rows[0].result,[]);
      await assert.rejects(client.query('select public.portal_apply_account_template($1,$2)',[account.id,'starter']),/Access denied/);
    } finally {await client.query('rollback');await client.end();}
  });

