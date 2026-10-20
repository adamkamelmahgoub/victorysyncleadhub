import fs from 'node:fs';
import pg from 'pg';

const envFile=process.env.SOCIAL_DB_ENV_FILE||'.env';
const line=process.env.DATABASE_URL?null:fs.readFileSync(envFile,'utf8').split(/\r?\n/).find((row)=>row.startsWith('DATABASE_URL='));
const connectionString=process.env.DATABASE_URL||line?.slice(13).replace(/^"|"$/g,'');
if(!connectionString)throw new Error('DATABASE_URL is missing');
const client=new pg.Client({connectionString,connectionTimeoutMillis:5000});
try{
  await client.connect();
  const tables=['social_oauth_apps','social_oauth_states','social_team_permissions','social_posts','social_post_targets','social_workspace_audit'];
  const existing=await client.query(`select count(*)::int total from information_schema.tables
    where table_schema='public' and table_name=any($1::text[])`,[tables]);
  if(existing.rows[0].total===0)await client.query(fs.readFileSync('supabase/migrations/20261022_social_workspace.sql','utf8'));
  else if(existing.rows[0].total!==tables.length)throw new Error('Partial social workspace migration requires manual inspection');
  const verified=await client.query(`select count(*)::int total from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any($1::text[]) and c.relrowsecurity`,[tables]);
  if(verified.rows[0].total!==tables.length)throw new Error('Workspace tables or RLS missing');
  console.log('Social workspace migration installed and RLS verified');
}finally{await client.end();}
