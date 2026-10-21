import fs from 'node:fs';import pg from 'pg';
const envFile=process.env.SOCIAL_DB_ENV_FILE;
const line=process.env.DATABASE_URL?null:fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(x=>x.startsWith('DATABASE_URL='));
const url=new URL(process.env.DATABASE_URL||line?.slice(13).replace(/^"|"$/g,''));
if(url.hostname.endsWith('.pooler.supabase.com')&&url.port==='5432')url.port='6543';
const db=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000,query_timeout:20000});
try{await db.connect();
  const tables=await db.query("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('forms','form_submissions','landing_pages','landing_page_events','form_rate_limits') order by relname");
  const policies=await db.query("select tablename,policyname,cmd,roles,permissive,qual,with_check from pg_policies where schemaname='public' and tablename in ('forms','form_submissions','landing_pages','landing_page_events','form_rate_limits') order by tablename,policyname");
  console.log(JSON.stringify({tables:tables.rows,policies:policies.rows}));
}finally{await db.end().catch(()=>{});}
