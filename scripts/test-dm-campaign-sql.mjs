import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

let pg;try{pg=createRequire(import.meta.url)('pg');}catch{pg=createRequire(path.join(process.env.TEMP||'','victorysync-social-audit','package.json'))('pg');}
const line=fs.readFileSync('.env','utf8').split(/\r?\n/).find(value=>value.startsWith('DATABASE_URL='));
if(!line)throw new Error('DATABASE_URL missing');
const db=new pg.Client({connectionString:line.slice(13).replace(/^"|"$/g,''),connectionTimeoutMillis:5000});
try{
  await db.connect();await db.query('begin');
  const lead=await db.query(`select id,coalesce(organization_id,'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid) org
    from public.leads where not dnc and not public.social_is_suppressed_internal(
      coalesce(organization_id,'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1'::uuid),'lead',id) limit 1`);
  if(!lead.rows.length)throw new Error('No eligible lead for rollback test');
  const {id:leadId,org}=lead.rows[0];
  const template=await db.query(`insert into public.dm_templates(organization_id,name,body) values($1,'Rollback template','Hi {{first_name}}') returning id`,[org]);
  const campaign=await db.query(`insert into public.dm_campaigns(organization_id,name,status) values($1,'Rollback campaign','active') returning id`,[org]);
  await db.query(`insert into public.dm_campaign_steps(organization_id,campaign_id,position,day_offset,channel,step_type,template_id)
    values($1,$2,1,0,'instagram','dm',$3)`,[org,campaign.rows[0].id,template.rows[0].id]);
  const enrollment=await db.query(`insert into public.dm_enrollments(organization_id,campaign_id,entity_type,entity_id)
    values($1,$2,'lead',$3) returning id`,[org,campaign.rows[0].id,leadId]);
  assert.ok(enrollment.rows[0].id);
  await db.query(`update public.leads set dnc=true where id=$1`,[leadId]);
  await db.query('savepoint suppressed');let rejected=false;
  try{await db.query(`update public.dm_enrollments set state='queued' where id=$1`,[enrollment.rows[0].id]);}catch{rejected=true;}
  await db.query('rollback to savepoint suppressed');assert.equal(rejected,true);
  console.log('Rollback-only DM campaign checks passed: template, step, enrollment, suppression.');
}finally{await db.query('rollback').catch(()=>{});await db.end().catch(()=>{});}
