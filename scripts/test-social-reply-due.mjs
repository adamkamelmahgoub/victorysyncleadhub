import fs from 'node:fs';
import assert from 'node:assert/strict';
import pg from 'pg';
const envFile=process.env.SOCIAL_DB_ENV_FILE||'.env';
const line=process.env.DATABASE_URL?null:fs.readFileSync(envFile,'utf8').split(/\r?\n/).find(row=>row.startsWith('DATABASE_URL='));
const connectionString=process.env.DATABASE_URL||line?.slice(13).replace(/^"|"$/g,'');
if(!connectionString)throw new Error('DATABASE_URL is missing');
const client=new pg.Client({connectionString,connectionTimeoutMillis:10000});
try{
  await client.connect();
  for(const [received,expected] of [
    ['2026-10-23T20:00:00Z','2026-10-26T14:00:00.000Z'],
    ['2026-10-26T13:00:00Z','2026-10-26T15:00:00.000Z'],
    ['2026-10-24T16:00:00Z','2026-10-26T15:00:00.000Z'],
  ]){
    const result=await client.query("select public.social_reply_due($1::timestamptz,'America/New_York') due_at",[received]);
    assert.equal(result.rows[0].due_at.toISOString(),expected);
  }
  console.log('Working-hour reply deadlines verified');
}finally{await client.end();}
