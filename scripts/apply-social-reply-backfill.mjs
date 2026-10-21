import fs from 'node:fs';
import pg from 'pg';
const envFile=process.env.SOCIAL_DB_ENV_FILE||'.env';
const line=process.env.DATABASE_URL?null:fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(row=>row.startsWith('DATABASE_URL='));
const connectionString=process.env.DATABASE_URL||line?.slice(13).replace(/^"|"$/g,'');
if(!connectionString)throw new Error('DATABASE_URL is missing');
const client=new pg.Client({connectionString,connectionTimeoutMillis:10000});
try{await client.connect();await client.query(fs.readFileSync('supabase/migrations/20261031_social_reply_backfill.sql','utf8'));
  const result=await client.query('select count(*)::integer open_replies from public.social_reply_obligations where completed_at is null');
  console.log(`Reply obligation backfill applied; ${result.rows[0].open_replies} open replies`);
}finally{await client.end();}
