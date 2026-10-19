import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
let pg;try{pg=createRequire(import.meta.url)('pg');}catch{pg=createRequire(path.join(process.env.TEMP||'','victorysync-social-audit','package.json'))('pg');}
const line=fs.readFileSync('.env','utf8').split(/\r?\n/).find((value)=>value.startsWith('DATABASE_URL='));
const org=process.env.SOCIAL_ACCOUNT_ORG_ID;
if(!line||!org)throw new Error('DATABASE_URL and SOCIAL_ACCOUNT_ORG_ID are required');
if(!process.argv.includes('--apply')){console.log('Dry run: sample campaign has 6 manual-assisted steps. Pass --apply to create a draft.');process.exit(0);}
const db=new pg.Client({connectionString:line.slice(13).replace(/^"|"$/g,''),connectionTimeoutMillis:5000});
try{await db.connect();await db.query('begin');
  const existing=await db.query(`select id from public.dm_campaigns where organization_id=$1 and name='Social intro (sample)' limit 1`,[org]);
  if(existing.rows.length){await db.query('rollback');console.log('Sample campaign already exists.');process.exit(0);}
  const first=await db.query(`insert into public.dm_templates(organization_id,name,body,allow_spintax)
    values($1,'Social intro','{Hi|Hello} {{first_name}}, I came across {{company}} in {{city}}. Would you be open to a quick conversation?',true) returning id`,[org]);
  const followup=await db.query(`insert into public.dm_templates(organization_id,name,body)
    values($1,'Social follow-up','Hi {{first_name}}, following up on my earlier note about {{company}}. Happy to share a short idea if useful.') returning id`,[org]);
  const campaign=await db.query(`insert into public.dm_campaigns(organization_id,name,status)
    values($1,'Social intro (sample)','draft') returning id`,[org]);
  const steps=[
    [1,0,'instagram','follow',null], [2,1,'instagram','engage_post',null],
    [3,2,'instagram','dm',first.rows[0].id], [4,5,'instagram','followup_dm',followup.rows[0].id],
    [5,8,'email','email',null], [6,10,'other','call_task',null],
  ];
  for(const [position,day,channel,type,template] of steps)await db.query(`insert into public.dm_campaign_steps
    (organization_id,campaign_id,position,day_offset,channel,step_type,template_id) values($1,$2,$3,$4,$5,$6,$7)`,
    [org,campaign.rows[0].id,position,day,channel,type,template]);
  await db.query('commit');console.log('Sample draft campaign and templates created.');
}catch(error){await db.query('rollback').catch(()=>{});throw error;}finally{await db.end().catch(()=>{});}
