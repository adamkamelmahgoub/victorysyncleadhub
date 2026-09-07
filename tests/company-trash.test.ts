import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { companyCrmRequest } from "../artifacts/api-server/src/lib/company-crm.js";

test("Trash preserves linked records, hides them via RLS, releases trials and safely restores", async () => {
  const db = new PGlite({ extensions: { btree_gist } });
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth to authenticated;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert,delete on storage.objects to authenticated;`);
    const migrations = [
      "20260905_company_trials.sql",
      "20260906_company_workspace.sql",
      "20260907_company_trash.sql",
    ];
    for (const name of migrations)
      await db.exec(
        await readFile(
          new URL(`../supabase/migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
    // Safe to rerun without changing any existing rows or policies.
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20260907_company_trash.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const user = "00000000-0000-4000-8000-000000000001";
    const claims = async (metadata: object) =>
      db.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ sub: user, user_metadata: metadata }),
      ]);
    await claims({ role: "owner" });
    await db.exec("set role authenticated");
    const company = (
      await db.query<{
        id: string;
      }>(`insert into companies(name,stage,trial_type,trial_start_date,trial_end_date,trial_capacity_slot,contacts)
      values('Keep history','trial_active','inbound','2026-09-07','2026-09-09','solo-inbound','[{"name":"Alex","role":"Owner","email":"","phone":""}]') returning id`)
    ).rows[0];
    await db.query(
      "insert into company_tasks(company_id,title) values($1,'Follow up')",
      [company.id],
    );
    await db.query(
      "insert into company_activities(company_id,direction,outcome) values($1,'inbound','appointment_booked')",
      [company.id],
    );
    await db.query(
      "insert into company_files(company_id,file_name,storage_path,mime_type,size_bytes) values($1,'note.txt',$2,'text/plain',10)",
      [company.id, `${company.id}/note.txt`],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name,owner_id) values('company-files',$1,$2)",
      [`${company.id}/note.txt`, user],
    );
    await assert.rejects(
      db.query("update companies set deleted_at=now() where id=$1", [
        company.id,
      ]),
      (error: any) => error.code === "42501",
    );
    await db.query(
      "select * from crm_set_company_trash(array[$1::uuid],false)",
      [company.id],
    );
    for (const table of [
      "companies",
      "company_tasks",
      "company_activities",
      "company_files",
      "storage.objects",
    ])
      assert.equal(
        (await db.query(`select * from ${table}`)).rows.length,
        0,
        table,
      );
    assert.equal(
      (await db.query("select * from crm_deleted_companies()")).rows.length,
      1,
    );
    const kpi = (
      await db.query<{ report: any }>(
        "select company_crm_kpis('2026-09-07','2026-09-09','UTC') report",
      )
    ).rows[0].report;
    assert.equal(kpi.trials_active, 0);
    await assert.rejects(
      db.query(
        "insert into company_tasks(company_id,title) values($1,'Hidden write')",
        [company.id],
      ),
      (error: any) => error.code === "42501",
    );
    const replacement = (
      await db.query<{
        id: string;
      }>(`insert into companies(name,stage,trial_type,trial_start_date,trial_end_date,trial_capacity_slot)
      values('Replacement','trial_booked','inbound','2026-09-07','2026-09-09','solo-inbound') returning id`)
    ).rows[0];
    await assert.rejects(
      db.query("select * from crm_set_company_trash(array[$1::uuid],true)", [
        company.id,
      ]),
      (error: any) => error.code === "23P01",
    );
    await db.query(
      "select * from crm_set_company_trash(array[$1::uuid],false)",
      [replacement.id],
    );
    await db.query(
      "select * from crm_set_company_trash(array[$1::uuid],true)",
      [company.id],
    );
    for (const table of [
      "companies",
      "company_tasks",
      "company_activities",
      "company_files",
      "storage.objects",
    ])
      assert.equal(
        (await db.query(`select * from ${table}`)).rows.length,
        1,
        table,
      );
    assert.equal(
      (await db.query<any>("select contacts from companies")).rows[0]
        .contacts[0].name,
      "Alex",
    );
    for (const metadata of [
      { role: "viewer" },
      { role: "owner", status: "inactive" },
      { role: "owner", client_account_id: "client" },
      { role: "member", page_permissions: [] },
    ]) {
      await claims(metadata);
      await assert.rejects(
        db.query("select * from crm_set_company_trash(array[$1::uuid],false)", [
          company.id,
        ]),
        (error: any) => error.code === "42501",
      );
      await assert.rejects(
        db.exec("select * from crm_deleted_companies()"),
        (error: any) => error.code === "42501",
      );
    }
    await db.exec("reset role");
    assert.equal((await db.query("select * from companies")).rows.length, 2);
    assert.equal(
      (await db.query("select * from company_files")).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});

test("delete API validates IDs and permissions, forwards JWT and explains missing migration", async () => {
  process.env.SUPABASE_URL = "https://trash-test.invalid";
  process.env.SUPABASE_ANON_KEY = "test-key";
  const original = globalThis.fetch;
  const id = "00000000-0000-4000-8000-000000000001";
  const user = { id, user_metadata: { role: "owner" } };
  let missing = false,
    writes = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer test",
    );
    if (missing) return Response.json({ code: "PGRST202" }, { status: 404 });
    assert.ok(String(url).endsWith("rpc/crm_set_company_trash"));
    assert.deepEqual(JSON.parse(String(init?.body)), {
      company_ids: [id],
      restore: false,
    });
    writes++;
    return Response.json([{ id }]);
  };
  try {
    const request = (ids: unknown[], role = "owner") =>
      companyCrmRequest(
        "DELETE",
        "/api/companies",
        "Bearer test",
        { ...user, user_metadata: { role } },
        async () => ({ ids }),
      );
    assert.equal((await request([id])).status, 200);
    assert.equal((await request([id], "viewer")).status, 403);
    assert.equal((await request(["bad"])).status, 400);
    assert.equal((await request([])).status, 400);
    assert.equal(writes, 1);
    missing = true;
    const result = await request([id]);
    assert.equal(result.status, 503);
    assert.match(JSON.stringify(result.data), /20260907_company_trash.sql/);
  } finally {
    globalThis.fetch = original;
  }
});
