import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const temporaryPg = path.join(process.env.TEMP || '', 'victorysync-social-audit', 'package.json');
let pg;
try { pg = createRequire(import.meta.url)('pg'); }
catch { pg = createRequire(temporaryPg)('pg'); }

const line = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find((value) => value.startsWith('DATABASE_URL='));
if (!line) throw new Error('DATABASE_URL is missing');
const connectionString = line.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
const tables = ['crm_companies', 'crm_contacts', 'leads', 'social_profiles', 'connected_accounts', 'conversations', 'messages', 'webhook_inbox', 'outreach_inbound_messages', 'mightycall_sms_messages', 'integration_alerts'];
try {
  await client.connect();
  const columns = await client.query(`select table_name, column_name, data_type from information_schema.columns where table_schema='public' and table_name=any($1) order by table_name, ordinal_position`, [tables]);
  const counts = await client.query(`select 'crm_contacts' source, count(*)::int total from public.crm_contacts union all select 'crm_companies', count(*)::int from public.crm_companies union all select 'leads', count(*)::int from public.leads`);
  const socials = await client.query(`select count(*) filter (where custom_fields ?| array['instagram','ig','facebook','fb','linkedin','x','twitter','tiktok','website'])::int as custom_fields_social_or_website, count(*) filter (where raw_payload ?| array['instagram','ig','facebook','fb','linkedin','x','twitter','tiktok','website'])::int as raw_payload_social_or_website from public.leads`);
  const alerts = await client.query(`select column_name,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name='integration_alerts' order by ordinal_position`);
  const inbound = await client.query(`select 'email' source,count(*)::int total from public.outreach_inbound_messages union all select 'sms',count(*)::int from public.mightycall_sms_messages`);
  const smsDirections = await client.query(`select direction,count(*)::int total from public.mightycall_sms_messages group by direction order by total desc limit 10`);
  const stages = await client.query(`select key,name from public.pipeline_stages order by position limit 30`);
  console.log(JSON.stringify({ columns: columns.rows, counts: counts.rows, social_candidates: socials.rows[0], integration_alerts: alerts.rows, inbound_counts: inbound.rows, sms_directions: smsDirections.rows, lead_stages: stages.rows }, null, 2));
} catch (error) {
  console.error(`Database audit unavailable: ${error.code || error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
