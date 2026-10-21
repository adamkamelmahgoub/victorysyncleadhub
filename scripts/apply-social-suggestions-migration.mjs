import fs from 'node:fs';
import pg from 'pg';
const envFile=process.env.SOCIAL_DB_ENV_FILE||'.env';
const line=process.env.DATABASE_URL?null:fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(row=>row.startsWith('DATABASE_URL='));
const connectionString=process.env.DATABASE_URL||line?.slice(13).replace(/^"|"$/g,'');
if(!connectionString)throw new Error('DATABASE_URL is missing');
const client=new pg.Client({connectionString,connectionTimeoutMillis:10000});
try{await client.connect();await client.query(fs.readFileSync('supabase/migrations/20261029_social_suggestions.sql','utf8'));
  const check=await client.query("select 1 from information_schema.columns where table_schema='public' and table_name='conversations' and column_name='suggested_lead_id'");
  if(!check.rowCount)throw new Error('Suggested lead column missing');
  console.log('Social suggestion migration applied and verified');
}finally{await client.end();}
