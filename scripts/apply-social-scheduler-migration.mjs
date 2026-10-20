import fs from 'node:fs';
import pg from 'pg';

const envFile = process.env.SOCIAL_DB_ENV_FILE || '.env';
const line = process.env.DATABASE_URL ? null : fs.readFileSync(envFile, 'utf8')
  .split(/\r?\n/).find((value) => value.startsWith('DATABASE_URL='));
const connectionString = process.env.DATABASE_URL || line?.slice(13).replace(/^"|"$/g, '');
if (!connectionString) throw new Error('DATABASE_URL is missing');
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await client.query(fs.readFileSync('supabase/migrations/20261021_zzz_social_scheduler.sql', 'utf8'));
  const jobs = await client.query(`select jobname,schedule from cron.job
    where jobname in ('victorysync-social-worker','victorysync-social-daily') order by jobname`);
  if (jobs.rows.length !== 2 || jobs.rows[0].schedule !== '0 5 * * *' ||
      jobs.rows[1].schedule !== '*/5 * * * *') throw new Error('Social cron jobs were not installed');
  console.log('Social pg_cron jobs installed and verified');
} finally { await client.end(); }
