import fs from 'node:fs';
import pg from 'pg';

const envFile=process.env.SOCIAL_DB_ENV_FILE||'.env';
const line=process.env.DATABASE_URL?null:fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(row=>row.startsWith('DATABASE_URL='));
const connectionString=process.env.DATABASE_URL||line?.slice(13).replace(/^"|"$/g,'');
if(!connectionString)throw new Error('DATABASE_URL is missing');
const client=new pg.Client({connectionString,ssl:{rejectUnauthorized:false}});
try{
  await client.connect();
  const existing=await client.query(`select count(*)::int total from pg_trigger where tgname in
    ('social_native_workflow_message','social_native_workflow_intent') and not tgisinternal`);
  if(existing.rows[0].total===0)await client.query(fs.readFileSync('supabase/migrations/20261101_social_workflow_triggers.sql','utf8'));
  else if(existing.rows[0].total!==2)throw new Error('Partial social workflow trigger migration');
  const verified=await client.query(`select count(*)::int total from pg_trigger where tgname in
    ('social_native_workflow_message','social_native_workflow_intent') and not tgisinternal`);
  if(verified.rows[0].total!==2)throw new Error('Social workflow triggers missing');
  console.log('Social workflow triggers installed and verified');
}finally{await client.end();}
