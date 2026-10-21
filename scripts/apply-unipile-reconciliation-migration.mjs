import fs from 'node:fs';
import pg from 'pg';
const envFile=process.env.SOCIAL_DB_ENV_FILE||'.env';
const line=process.env.DATABASE_URL?null:fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(row=>row.startsWith('DATABASE_URL='));
const connectionString=process.env.DATABASE_URL||line?.slice(13).replace(/^"|"$/g,'');
if(!connectionString)throw new Error('DATABASE_URL is missing');
const client=new pg.Client({connectionString,connectionTimeoutMillis:10000});
try{
  await client.connect();
  await client.query(fs.readFileSync('supabase/migrations/20261028_unipile_reconciliation.sql','utf8'));
  const check=await client.query("select relrowsecurity from pg_class where oid='public.social_unipile_sync_state'::regclass");
  if(!check.rows[0]?.relrowsecurity)throw new Error('Sync state RLS is disabled');
  console.log('Unipile reconciliation migration applied and verified');
}finally{await client.end();}
