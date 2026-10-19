import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
let pg;try{pg=createRequire(import.meta.url)('pg');}catch{pg=createRequire(path.join(process.env.TEMP||'','victorysync-social-audit','package.json'))('pg');}
const line=fs.readFileSync('.env','utf8').split(/\r?\n/).find((value)=>value.startsWith('DATABASE_URL='));
if(!line)throw new Error('DATABASE_URL is missing');
const db=new pg.Client({connectionString:line.slice(13).replace(/^"|"$/g,''),connectionTimeoutMillis:5000});
const files=['20261020_social_dm_foundation.sql','20261020_z_social_dm_guards.sql'];
async function mustFail(sql,args){await db.query('savepoint expected_failure');let failed=false;
  try{await db.query(sql,args);}catch{failed=true;}await db.query('rollback to savepoint expected_failure');
  await db.query('release savepoint expected_failure');assert.equal(failed,true,`Expected SQL rejection: ${sql}`);}
try{
  await db.connect();await db.query('begin');
  for(const file of files){const sql=fs.readFileSync(path.join('supabase','migrations',file),'utf8')
    .replace(/^\s*begin\s*;/i,'').replace(/commit\s*;\s*$/i,'');await db.query(sql);}
  const lead=await db.query(`select id,coalesce(organization_id,'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid) org
    from public.leads where not dnc and not public.social_is_suppressed_internal(
      coalesce(organization_id,'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid),'lead',id) limit 1`);
  if(!lead.rows.length)throw new Error('No unsuppressed lead available for rollback-only SQL test');
  const {id:leadId,org}=lead.rows[0];
  const account=await db.query(`insert into public.connected_accounts(organization_id,platform,label,external_account_id,daily_followup_cap)
    values($1,'facebook','Rollback test','rollback-test',1) returning id`,[org]);
  const conversation=await db.query(`insert into public.conversations(organization_id,channel,connected_account_id,external_thread_id,
    participant_platform_id,lead_id,last_inbound_at) values($1,'facebook',$2,'rollback-thread','rollback-participant',$3,now()-interval '25 hours') returning id`,
    [org,account.rows[0].id,leadId]);
  const conversationId=conversation.rows[0].id;
  await mustFail(`select public.social_reserve_reply($1,null)`,[conversationId]);
  const profile=await db.query(`insert into public.social_profiles(organization_id,entity_type,entity_id,platform,handle,normalized_handle,is_primary)
    values($1,'lead',$2,'facebook','rollback-profile','rollback-profile',true) returning id`,[org,leadId]);
  const manual=await db.query(`insert into public.conversations(organization_id,channel,connected_account_id,external_thread_id,lead_id)
    values($1,'facebook',$2,'manual:rollback',$3) returning id`,[org,account.rows[0].id,leadId]);
  await db.query(`insert into public.messages(organization_id,conversation_id,direction,body,sent_via,status)
    values($1,$2,'outbound','Unique rollback message','manual_assisted','sent')`,[org,manual.rows[0].id]);
  const unknownEcho=await db.query(`select public.social_match_manual_echo($1,'rollback-recipient','Unique rollback message','echo-unknown') id`,[account.rows[0].id]);
  assert.equal(unknownEcho.rows[0].id,null);
  await db.query(`update public.social_profiles set platform_user_id='rollback-recipient' where id=$1`,[profile.rows[0].id]);
  const echo=await db.query(`select public.social_match_manual_echo($1,'rollback-recipient','Unique rollback message','echo-1') id`,[account.rows[0].id]);
  assert.equal(echo.rows[0].id,manual.rows[0].id);
  const updated=await db.query(`select platform_user_id from public.social_profiles where id=$1`,[profile.rows[0].id]);
  assert.equal(updated.rows[0].platform_user_id,'rollback-recipient');
  await db.query(`update public.conversations set last_inbound_at=now()-interval '1 hour' where id=$1`,[conversationId]);
  const first=await db.query(`select public.social_reserve_reply($1,null) id`,[conversationId]);assert.ok(first.rows[0].id);
  await mustFail(`select public.social_reserve_reply($1,null)`,[conversationId]);
  await db.query(`update public.connected_accounts set daily_followup_cap=2 where id=$1`,[account.rows[0].id]);
  await db.query(`update public.leads set dnc=true where id=$1`,[leadId]);
  const suppressed=await db.query(`select public.social_is_suppressed_internal($1,'lead',$2) blocked`,[org,leadId]);assert.equal(suppressed.rows[0].blocked,true);
  await mustFail(`select public.social_reserve_reply($1,null)`,[conversationId]);
  console.log('Rollback-only SQL checks passed: reply window, daily cap, echo matching, suppression.');
}finally{await db.query('rollback').catch(()=>{});await db.end().catch(()=>{});}
