import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
let pg;
try { pg = createRequire(import.meta.url)('pg'); }
catch { pg = createRequire(path.join(process.env.TEMP || '', 'victorysync-social-audit', 'package.json'))('pg'); }
const line = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find((value) => value.startsWith('DATABASE_URL='));
if (!line) throw new Error('DATABASE_URL is missing');
const client = new pg.Client({ connectionString: line.slice(13).replace(/^"|"$/g, ''), connectionTimeoutMillis: 5000 });
const files = ['20261020_social_dm_foundation.sql', '20261020_z_social_dm_guards.sql'];
try {
  await client.connect();
  await client.query('begin');
  for (const name of files) {
    const sql = fs.readFileSync(path.join('supabase', 'migrations', name), 'utf8')
      .replace(/^\s*begin\s*;/i, '').replace(/commit\s*;\s*$/i, '');
    await client.query(sql);
    console.log(`${name}: parsed and executed in rollback transaction`);
  }
  const check = await client.query(`select count(*)::int as new_tables from information_schema.tables
    where table_schema='public' and table_name=any($1)`, [[
      'social_profiles','connected_accounts','connected_account_secrets','conversations','messages',
      'dm_templates','dm_campaigns','dm_campaign_steps','dm_enrollments','dm_tasks',
      'social_webhook_events','social_sync_cursors',
    ]]);
  console.log(JSON.stringify(check.rows[0]));
} finally {
  await client.query('rollback').catch(() => {});
  await client.end().catch(() => {});
}
