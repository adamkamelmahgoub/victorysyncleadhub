import fs from 'node:fs';
import pg from 'pg';

const envFile=process.env.SOCIAL_DB_ENV_FILE||'.env';
const line=process.env.DATABASE_URL?null:fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(row=>row.startsWith('DATABASE_URL='));
const connectionString=process.env.DATABASE_URL||line?.slice(13).replace(/^"|"$/g,'');
if(!connectionString)throw new Error('DATABASE_URL is missing');
const client=new pg.Client({connectionString,connectionTimeoutMillis:10000});
try{
  await client.connect();
  await client.query(fs.readFileSync('supabase/migrations/20261025_rep_dm_tracking.sql','utf8'));
  const checked=await client.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('social_unipile_config','social_unipile_connect_attempts','rep_territories')`);
  if(checked.rows.length!==3||checked.rows.some(row=>!row.relrowsecurity))throw new Error('Rep DM tables missing RLS');
  console.log('Rep DM migration applied and RLS verified');
}finally{await client.end();}
