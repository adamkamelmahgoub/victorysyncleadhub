import {test} from 'node:test';
import assert from 'node:assert/strict';

test('agency user can record a sourced review in a selected client account',
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
      const source=(await db.query(`insert into public.review_sources(client_account_id,platform,name,review_url)
        values($1,'google','QA review source','https://example.com/reviews') returning id`,[account])).rows[0].id;
      const review=(await db.query(`insert into public.reviews(client_account_id,source_id,platform,reviewer,rating,text,review_url)
        values($1,$2,'google','QA reviewer',5,'Good service','https://example.com/reviews/1') returning id`,[account,source])).rows[0].id;
      const visible=await db.query('select id,source_id from public.reviews where id=$1',[review]);
      assert.equal(visible.rows[0].source_id,source);
    }finally{await db.query('rollback').catch(()=>undefined);await db.end()}
  });
