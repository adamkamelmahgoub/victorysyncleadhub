import fs from 'node:fs';
import pg from 'pg';

const envFile=process.env.SOCIAL_DB_ENV_FILE||'.env';
const line=process.env.DATABASE_URL?null:fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(row=>row.startsWith('DATABASE_URL='));
const connectionString=process.env.DATABASE_URL||line?.slice(13).replace(/^"|"$/g,'');
if(!connectionString)throw new Error('DATABASE_URL is missing');
const client=new pg.Client({connectionString,connectionTimeoutMillis:10000});
try{
  await client.connect();
  await client.query(fs.readFileSync('supabase/migrations/20261024_threads_oauth.sql','utf8'));
  const checked=await client.query(`select c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='social_threads_apps'`);
  if(!checked.rows[0]?.rls)throw new Error('Threads app table RLS missing');
  console.log('Threads OAuth migration applied and RLS verified');
}finally{await client.end();}
