import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
let pg;try{pg=createRequire(import.meta.url)('pg');}catch{pg=createRequire(path.join(process.env.TEMP||'','victorysync-social-audit','package.json'))('pg');}
const envFile=process.env.SOCIAL_DB_ENV_FILE||'.env';
const line=fs.readFileSync(envFile,'utf8').split(/\r?\n/).find((value)=>value.startsWith('DATABASE_URL='));
if(!line)throw new Error('DATABASE_URL is missing');
const db=new pg.Client({connectionString:line.slice(13).replace(/^"|"$/g,''),connectionTimeoutMillis:5000});
try{
  await db.connect();await db.query('begin');
  const selected=await db.query(`select id,coalesce(organization_id,'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid) org,
    public.outreach_email(email) email from public.leads where email is not null and not dnc and
    not public.social_is_suppressed_internal(coalesce(organization_id,'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid),'lead',id)
    limit 1`);
  if(!selected.rows.length)throw new Error('No eligible lead for rollback-only test');
  const {id,org,email}=selected.rows[0];
  const campaign=await db.query(`insert into public.dm_campaigns(organization_id,name,status) values($1,'Rollback cascade','active') returning id`,[org]);
  const step=await db.query(`insert into public.dm_campaign_steps(organization_id,campaign_id,position,day_offset,channel,step_type)
    values($1,$2,1,0,'instagram','dm') returning id`,[org,campaign.rows[0].id]);
  const enrollment=await db.query(`insert into public.dm_enrollments(organization_id,campaign_id,entity_type,entity_id)
    values($1,$2,'lead',$3) returning id`,[org,campaign.rows[0].id,id]);
  await db.query(`insert into public.dm_tasks(organization_id,enrollment_id,step_id,due_at) values($1,$2,$3,now())`,
    [org,enrollment.rows[0].id,step.rows[0].id]);
  await db.query(`update public.dm_enrollments set state='replied' where id=$1`,[enrollment.rows[0].id]);
  let result=await db.query(`select status from public.dm_tasks where enrollment_id=$1`,[enrollment.rows[0].id]);
  assert.equal(result.rows[0].status,'skipped');
  const second=await db.query(`insert into public.dm_campaigns(organization_id,name,status) values($1,'Rollback suppression','active') returning id`,[org]);
  const secondStep=await db.query(`insert into public.dm_campaign_steps(organization_id,campaign_id,position,day_offset,channel,step_type)
    values($1,$2,1,0,'instagram','dm') returning id`,[org,second.rows[0].id]);
  const secondEnrollment=await db.query(`insert into public.dm_enrollments(organization_id,campaign_id,entity_type,entity_id)
    values($1,$2,'lead',$3) returning id`,[org,second.rows[0].id,id]);
  await db.query(`insert into public.dm_tasks(organization_id,enrollment_id,step_id,due_at) values($1,$2,$3,now())`,
    [org,secondEnrollment.rows[0].id,secondStep.rows[0].id]);
  await db.query(`insert into public.outreach_suppressions(identity_type,identity_value,reason) values('email',$1,'manual_exclude')`,[email]);
  result=await db.query(`select e.state,t.status from public.dm_enrollments e join public.dm_tasks t on t.enrollment_id=e.id where e.id=$1`,[secondEnrollment.rows[0].id]);
  assert.deepEqual(result.rows[0],{state:'suppressed',status:'skipped'});
  console.log('Rollback-only cascade checks passed: reply cancellation and suppression propagation.');
}finally{await db.query('rollback').catch(()=>{});await db.end().catch(()=>{});}
