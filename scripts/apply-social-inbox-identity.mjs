import fs from 'node:fs';
import pg from 'pg';

const envFile=process.env.SOCIAL_DB_ENV_FILE||'.env';
const line=process.env.DATABASE_URL?null:fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(row=>row.startsWith('DATABASE_URL='));
const connectionString=process.env.DATABASE_URL||line?.slice(13).replace(/^"|"$/g,'');
if(!connectionString)throw new Error('DATABASE_URL is missing');
const db=new pg.Client({connectionString,ssl:{rejectUnauthorized:false}});
try{
  await db.connect();
  await db.query('begin');
  await db.query(fs.readFileSync('supabase/migrations/20261103_social_inbox_identity.sql','utf8'));
  await db.query('commit');
  const result=await db.query(`select count(*)::integer outbound,count(*) filter(where direction='inbound')::integer inbound
    from public.messages m join public.conversations c on c.id=m.conversation_id
    join public.connected_accounts a on a.id=c.connected_account_id where a.provider='unipile'`);
  console.log('Social inbox identity migration applied',result.rows[0]);
}catch(error){await db.query('rollback').catch(()=>{});throw error;}finally{await db.end();}
