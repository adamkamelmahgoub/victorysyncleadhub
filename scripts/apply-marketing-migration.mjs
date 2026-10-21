import fs from 'node:fs';
import pg from 'pg';
const envFile=process.env.SOCIAL_DB_ENV_FILE;
const line=process.env.DATABASE_URL?null:fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(x=>x.startsWith('DATABASE_URL='));
const url=new URL(process.env.DATABASE_URL||line?.slice(13).replace(/^"|"$/g,''));
if(url.hostname.endsWith('.pooler.supabase.com')&&url.port==='5432')url.port='6543';
const db=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000});
const name=process.argv[2]||'20261105_marketing_forms_landing_pages.sql';
if(!['20261105_marketing_forms_landing_pages.sql','20261106_marketing_internal_boundary.sql'].includes(name))throw new Error('Unknown marketing migration');
const migration=fs.readFileSync(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8');
try{await db.connect();await db.query(migration);console.log(`${name} applied.`);}
finally{await db.end().catch(()=>{});}
