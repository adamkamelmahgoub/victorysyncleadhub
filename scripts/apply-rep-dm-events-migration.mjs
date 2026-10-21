import fs from 'node:fs';
import pg from 'pg';
const envFile=process.env.SOCIAL_DB_ENV_FILE||'.env';
const line=process.env.DATABASE_URL?null:fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(row=>row.startsWith('DATABASE_URL='));
const connectionString=process.env.DATABASE_URL||line?.slice(13).replace(/^"|"$/g,'');
if(!connectionString)throw new Error('DATABASE_URL is missing');
const client=new pg.Client({connectionString,connectionTimeoutMillis:10000});
try{await client.connect();await client.query(fs.readFileSync('supabase/migrations/20261027_rep_dm_events.sql','utf8'));
  const triggers=await client.query(`select tgname from pg_trigger where tgname in ('social_message_fact','social_task_fact','social_intent_fact')`);
  if(triggers.rows.length!==3)throw new Error('Rep event triggers missing');
  console.log('Rep DM event triggers applied and verified');
}finally{await client.end();}
