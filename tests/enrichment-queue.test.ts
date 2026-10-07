import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("enrichment budget and resumable queue", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role service_role; create role anon; create role authenticated;
      create table public.leads(id uuid primary key, tags text[] not null default '{}');
      create table public.segments(id uuid primary key);
      create table public.org_settings(org_id uuid primary key, service_level_target_seconds integer not null,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      insert into public.org_settings(org_id,service_level_target_seconds)
        values('00000000-0000-0000-0000-000000000099',300);`);
    const migration = (await readFile(new URL("../supabase/migrations/20261009_lead_enrichment.sql", import.meta.url), "utf8"))
      // PGlite has no pg_cron or pg_net; the production scheduler is reviewed separately.
      .replace(/select cron\.schedule\([\s\S]*?\$cron\$\);/, "");
    await db.exec(migration);
    assert.equal((await db.query("select service_level_target_seconds from public.org_settings")).rows[0].service_level_target_seconds, 300);
    await db.exec(`update public.enrichment_settings set enrichment_budget_usd=2;
      insert into public.leads(id,tags) values
        ('00000000-0000-0000-0000-000000000001',array['top3-fit']::text[]),
        ('00000000-0000-0000-0000-000000000002',array['franchise']::text[]);
      insert into public.enrichment_jobs(id,lead_ids,mode,grid,total) values
        ('00000000-0000-0000-0000-000000000003',
        array['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002']::uuid[],
        'both',3,2);
      insert into public.enrichment_job_items(job_id,lead_id)
        select '00000000-0000-0000-0000-000000000003',unnest(array[
          '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002']::uuid[]);`);
    const reserve = async (cost: number) => (await db.query<{ ok: boolean }>(
      "select public.enrichment_reserve_cost($1) as ok", [cost])).rows[0].ok;
    assert.equal(await reserve(1), true);
    assert.equal(await reserve(1.5), false);
    await db.query("select public.enrichment_release_cost(0.5)");
    assert.equal(await reserve(1.5), true);

    const claimed = (await db.query<{ job_id: string; lead_id: string }>(
      "select * from public.enrichment_claim_batch(10)")).rows;
    assert.equal(claimed.length, 2);
    assert.equal((await db.query("select * from public.enrichment_claim_batch(10)")).rows.length, 0);
    for (const [index, item] of claimed.entries()) {
      const finished = (await db.query<{ finished: boolean }>(
        "select public.enrichment_complete_item($1,$2,0.4,true,null) as finished",
        [item.job_id, item.lead_id])).rows[0].finished;
      assert.equal(finished, index === 1);
    }
    const job = (await db.query<{ status: string; done: number; failed: number; cost_usd: string }>(
      "select status,done,failed,cost_usd from public.enrichment_jobs")).rows[0];
    assert.deepEqual([job.status, job.done, job.failed, Number(job.cost_usd)], ["completed", 2, 0, 0.8]);
    const tags = (await db.query<{ counts: Record<string, number> }>(
      "select public.enrichment_job_tag_counts('00000000-0000-0000-0000-000000000003') as counts")).rows[0].counts;
    assert.deepEqual(tags, { "top3-fit": 1, franchise: 1 });
  } finally { await db.close(); }
});
