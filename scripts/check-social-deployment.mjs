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
  const jobs = await client.query(`select jobname,schedule from cron.job
    where jobname in ('victorysync-social-worker','victorysync-social-daily')`);
  if (jobs.rows.length !== 2) throw new Error('Social scheduler jobs are missing');
  const request = await client.query(`select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='victorysync_leadgen_origin') || '/api/social-worker',
    headers := jsonb_build_object('Authorization','Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name='victorysync_native_worker_token'),
      'Content-Type','application/json'), body := '{}'::jsonb, timeout_milliseconds := 120000) as id`);
  const id = request.rows[0]?.id;
  if (!id) throw new Error('Could not invoke social worker');
  let status;
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const response = await client.query('select status_code,error_msg from net._http_response where id=$1', [id]);
    if (response.rows.length) {
      status = response.rows[0].status_code;
      if (!status) throw new Error(`Social worker network error: ${response.rows[0].error_msg || 'unknown'}`);
      break;
    }
  }
  if (status !== 200) throw new Error(`Social worker returned ${status || 'no response'} for pg_net request ${id}`);
  console.log('Production social worker responded 200 through Supabase pg_net; two pg_cron jobs active');
} finally { await client.end(); }
