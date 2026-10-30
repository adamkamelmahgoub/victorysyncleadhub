import {test} from 'node:test';
import assert from 'node:assert/strict';

test('agency user can create client forms, workflows, sequences, and pipelines through RLS',
  {skip:!process.env.DATABASE_URL},async()=>{
    const {Client}=await import('pg');
    const db=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
    await db.connect();
    try{
      await db.query('begin');
      const account=(await db.query('select id from public.sub_accounts order by id limit 1')).rows[0]?.id;
      assert.ok(account);
      await db.query('set local role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",['a5f6f998-5ed5-4c0c-88ac-9f27d677697a']);
      await db.query("select set_config('request.jwt.claim.role','authenticated',true)");
      await db.query("select set_config('request.jwt.claim.email','adam@victorysync.com',true)");
      await db.query("select set_config('request.jwt.claims',$1,true)",[
        JSON.stringify({sub:'a5f6f998-5ed5-4c0c-88ac-9f27d677697a',role:'authenticated',crm_role:'owner',email:'adam@victorysync.com'})]);
      const checks=[
        ['forms',`insert into public.forms(client_account_id,name,slug,fields) values($1,'QA form','qa-tenant-test-form','[]') returning client_account_id`],
        ['automation_workflows',`insert into public.automation_workflows(client_account_id,name) values($1,'QA workflow') returning client_account_id`],
        ['sequences',`insert into public.sequences(client_account_id,name) values($1,'QA sequence') returning client_account_id`],
        ['pipelines',`insert into public.pipelines(client_account_id,name) values($1,'QA pipeline') returning client_account_id`],
      ];
      for(const [table,sql] of checks){
        const inserted=await db.query(sql,[account]);
        assert.equal(inserted.rows[0].client_account_id,account,table);
      }
    }finally{await db.query('rollback').catch(()=>undefined);await db.end()}
  });
