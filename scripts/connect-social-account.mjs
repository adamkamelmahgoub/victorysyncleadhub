import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { encryptToken } from '../lib/social-crypto.ts';
let pg;
try { pg=createRequire(import.meta.url)('pg'); }
catch { pg=createRequire(path.join(process.env.TEMP||'','victorysync-social-audit','package.json'))('pg'); }
const line=fs.readFileSync('.env','utf8').split(/\r?\n/).find((value)=>value.startsWith('DATABASE_URL='));
if(!line)throw new Error('DATABASE_URL is missing');
const platform=process.env.SOCIAL_ACCOUNT_PLATFORM;
const externalId=process.env.SOCIAL_ACCOUNT_EXTERNAL_ID;
const label=process.env.SOCIAL_ACCOUNT_LABEL;
const organizationId=process.env.SOCIAL_ACCOUNT_ORG_ID;
const token=process.env.SOCIAL_ACCOUNT_TOKEN;
if(!['facebook','instagram','whatsapp'].includes(platform)||!externalId||!label||!organizationId||!token)
  throw new Error('Set SOCIAL_ACCOUNT_PLATFORM, SOCIAL_ACCOUNT_EXTERNAL_ID, SOCIAL_ACCOUNT_LABEL, SOCIAL_ACCOUNT_ORG_ID, and SOCIAL_ACCOUNT_TOKEN');
if(!process.argv.includes('--apply')){console.log('Dry run: account input is complete. Pass --apply to store an encrypted token.');process.exit(0);}
const client=new pg.Client({connectionString:line.slice(13).replace(/^"|"$/g,''),connectionTimeoutMillis:5000});
try{
  await client.connect();await client.query('begin');
  const result=await client.query(`insert into public.connected_accounts(organization_id,platform,label,external_account_id)
    values($1,$2,$3,$4) on conflict(organization_id,platform,external_account_id)
    do update set label=excluded.label,status='active',updated_at=now() returning id`,[organizationId,platform,label,externalId]);
  await client.query(`insert into public.connected_account_secrets(connected_account_id,encrypted_access_token)
    values($1,$2) on conflict(connected_account_id) do update set encrypted_access_token=excluded.encrypted_access_token,updated_at=now()`,
    [result.rows[0].id,encryptToken(token)]);
  await client.query('commit');
  console.log('Connected account stored with an encrypted server-only token.');
}catch(error){await client.query('rollback').catch(()=>{});throw error;}
finally{await client.end().catch(()=>{});}
