import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

let pg;
try { pg = createRequire(import.meta.url)('pg'); }
catch { pg = createRequire(path.join(process.env.TEMP || '', 'victorysync-social-audit', 'package.json'))('pg'); }
const envFile = process.env.SOCIAL_DB_ENV_FILE || '.env';
const line = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find((value) => value.startsWith('DATABASE_URL='));
if (!line) throw new Error('DATABASE_URL is missing');
const db = new pg.Client({ connectionString: line.slice(13).replace(/^"|"$/g, ''), connectionTimeoutMillis: 5000 });
try {
  await db.connect();
  for (const name of ['20261021_social_review_status.sql','20261021_z_social_lead_list.sql']) {
    await db.query(fs.readFileSync(path.join('supabase','migrations',name), 'utf8'));
  }
  const result = await db.query(`select count(*)::int total from information_schema.columns
    where table_schema='public' and table_name='social_profiles' and column_name='review_status'`);
  if (result.rows[0].total !== 1) throw new Error('Review status column missing after migration');
  const view=await db.query(`select count(*)::int total from information_schema.views
    where table_schema='public' and table_name='crm_social_leads'`);
  if(view.rows[0].total!==1)throw new Error('Social lead view missing after migration');
  console.log('Social review and list migrations applied and verified');
} finally { await db.end(); }
