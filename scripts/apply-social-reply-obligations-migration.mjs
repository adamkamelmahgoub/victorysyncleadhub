import fs from 'node:fs';
import pg from 'pg';
const envFile=process.env.SOCIAL_DB_ENV_FILE||'.env';
const line=process.env.DATABASE_URL?null:fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(row=>row.startsWith('DATABASE_URL='));
const connectionString=process.env.DATABASE_URL||line?.slice(13).replace(/^"|"$/g,'');
if(!connectionString)throw new Error('DATABASE_URL is missing');
const client=new pg.Client({connectionString,connectionTimeoutMillis:10000});
try{await client.connect();await client.query(fs.readFileSync('supabase/migrations/20261030_social_reply_obligations.sql','utf8'));
  const check=await client.query("select 1 from pg_trigger where tgname='social_reply_obligation_fact'");
  if(!check.rowCount)throw new Error('Reply obligation trigger missing');
  console.log('Reply obligations migration applied and verified');
}finally{await client.end();}
