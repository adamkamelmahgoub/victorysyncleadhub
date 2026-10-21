import fs from 'node:fs';
import pg from 'pg';

const envFile=process.env.SOCIAL_DB_ENV_FILE||'.env';
const line=process.env.DATABASE_URL?null:fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(row=>row.startsWith('DATABASE_URL='));
const connectionString=process.env.DATABASE_URL||line?.slice(13).replace(/^"|"$/g,'');
if(!connectionString)throw new Error('DATABASE_URL is missing');
const client=new pg.Client({connectionString,ssl:{rejectUnauthorized:false}});
try{
  await client.connect();
  const found=await client.query(`select count(*)::int total from information_schema.columns where table_schema='public'
    and table_name='social_unipile_config' and column_name in ('api_base_url','api_version')`);
  if(found.rows[0].total===0)await client.query(fs.readFileSync('supabase/migrations/20261102_unipile_v1_credentials.sql','utf8'));
  else if(found.rows[0].total!==2)throw new Error('Partial Unipile V1 credential migration');
  const verified=await client.query(`select count(*)::int total from information_schema.columns where table_schema='public'
    and table_name='social_unipile_config' and column_name in ('api_base_url','api_version')`);
  if(verified.rows[0].total!==2)throw new Error('Unipile V1 credential columns missing');
  console.log('Unipile V1 credential migration installed and verified');
}finally{await client.end();}
