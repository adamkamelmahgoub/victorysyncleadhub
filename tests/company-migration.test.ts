import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

for (const existingEmail of [false, true]) {
  test(`migration preserves data and permissions with existing email=${existingEmail}`, async () => {
    const db = new PGlite({ extensions: { btree_gist } });
    const user = "00000000-0000-4000-8000-000000000001";
    const other = "00000000-0000-4000-8000-000000000002";
    try {
      await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims', true)::jsonb $$;
      create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
      grant usage on schema auth to authenticated;
      create table leads(id integer primary key, name text);
      insert into leads values (42, 'Existing contact');`);
      await db.exec(
        await readFile(
          new URL(
            "../supabase/migrations/20260905_company_trials.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      assert.deepEqual((await db.query("select * from leads")).rows, [
        { id: 42, name: "Existing contact" },
      ]);
      await db.exec(`create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert,delete on storage.objects to authenticated;
      insert into companies(name) values ('Before workspace migration');`);
      if (existingEmail) {
        await db.exec(
          "alter table companies add column email text; update companies set email='existing@example.com'",
        );
      }
      const workspaceMigration = await readFile(
        new URL(
          "../supabase/migrations/20260906_company_workspace.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await db.exec(workspaceMigration);
      await db.exec(workspaceMigration);
      assert.deepEqual(
        (
          await db.query(
            "select name,tags,contacts,email from companies where name='Before workspace migration'",
          )
        ).rows,
        [
          {
            name: "Before workspace migration",
            tags: [],
            contacts: [],
            email: existingEmail ? "existing@example.com" : "",
          },
        ],
      );
      async function setUser(metadata: Record<string, unknown>) {
        await db.query("select set_config('request.jwt.claims', $1, false)", [
          JSON.stringify({ sub: user, user_metadata: metadata }),
        ]);
      }
      await setUser({ role: "owner" });
      await db.exec("set role authenticated");
      const insert = (
        name: string,
        start: string,
        stage = "trial_booked",
        type = "inbound",
        slot = "solo-inbound",
      ) =>
        db.query<{ id: string }>(
          `insert into companies(name,trial_type,trial_start_date,trial_end_date,trial_capacity_slot,stage)
      values($1,$2,$3,crm_trial_end($3::date),$4,$5) returning id`,
          [name, type, start, slot, stage],
        );
      const {
        rows: [company],
      } = await insert("First inbound", "2026-09-10");
      const task = (
        await db.query<{ id: string }>(
          "insert into company_tasks(company_id,title,kind,due_at) values($1,'Close call','close_call','2026-09-15T12:00:00Z') returning id",
          [company.id],
        )
      ).rows[0];
      await db.query(
        "update company_tasks set status='completed' where id=$1",
        [task.id],
      );
      await assert.rejects(
        db.query("update company_tasks set created_by=$1 where id=$2", [
          other,
          task.id,
        ]),
        (e: any) => e.code === "42501",
      );
      await assert.rejects(
        db.query(
          "insert into company_tasks(company_id,title,created_by) values($1,'Forged',$2)",
          [company.id, other],
        ),
        (e: any) => e.code === "42501",
      );
      await db.query(
        "insert into company_files(company_id,file_name,storage_path,mime_type,size_bytes) values($1,'test.pdf',$2,'application/pdf',100)",
        [company.id, `${company.id}/test.pdf`],
      );
      await assert.rejects(
        db.query(
          "insert into company_files(company_id,file_name,storage_path,mime_type,size_bytes) values($1,'wrong.pdf',$2,'application/pdf',100)",
          [company.id, `${other}/wrong.pdf`],
        ),
        (e: any) => e.code === "23514",
      );
      await db.query(
        "insert into storage.objects(bucket_id,name,owner_id) values('company-files',$1,$2)",
        [`${company.id}/test.pdf`, user],
      );
      await assert.rejects(
        insert("Overlap", "2026-09-14"),
        (e: any) => e.code === "23P01",
      );
      await assert.rejects(
        insert(
          "Slot bypass",
          "2026-09-14",
          "trial_booked",
          "inbound",
          "other-slot",
        ),
        (e: any) => e.code === "23514",
      );
      await assert.rejects(
        insert("Weekend", "2026-09-12"),
        (e: any) => e.code === "23514",
      );
      await assert.rejects(
        db.query(
          "update companies set trial_end_date = '2026-09-15' where id=$1",
          [company.id],
        ),
        (e: any) => e.code === "23514",
      );
      await assert.rejects(
        db.exec(
          "insert into companies(name,stage) values ('Missing dates','trial_booked')",
        ),
        (e: any) => e.code === "23514",
      );
      await insert("Adjacent", "2026-09-15", "trial_active");
      await insert(
        "Outbound simultaneous",
        "2026-09-10",
        "trial_booked",
        "outbound",
        "outbound",
      );
      const draft = (await insert("Draft", "2026-09-10", "qualified")).rows[0];
      await assert.rejects(
        db.query("update companies set stage='trial_active' where id=$1", [
          draft.id,
        ]),
        (e: any) => e.code === "23P01",
      );
      await db.query(
        "update companies set stage='trial_completed' where id=$1",
        [company.id],
      );
      await insert("Released capacity", "2026-09-10");
      await db.query(
        `insert into company_activities(company_id,direction,outcome,response_time_minutes,occurred_at) values
      ($1,'inbound','conversation',0,'2026-09-11T03:00:00Z'),
      ($1,'inbound','appointment_booked',10,'2026-09-11T03:30:00Z'),
      ($1,'inbound','conversation',null,'2026-09-11T03:40:00Z'),
      ($1,'outbound','no_answer',null,'2026-09-11T04:30:00Z')`,
        [company.id],
      );
      await assert.rejects(
        db.query(
          "insert into company_activities(company_id,direction,outcome,logged_by) values($1,'inbound','conversation',$2)",
          [company.id, other],
        ),
        (e: any) => e.code === "42501",
      );
      await assert.rejects(
        db.query(
          "insert into company_activities(company_id,direction,outcome,response_time_minutes) values($1,'inbound','conversation',-1)",
          [company.id],
        ),
        (e: any) => e.code === "23514",
      );
      await assert.rejects(
        db.query(
          "insert into company_activities(company_id,direction,outcome,response_time_minutes) values($1,'outbound','conversation',1)",
          [company.id],
        ),
        (e: any) => e.code === "23514",
      );
      const report = (
        await db.query<{ report: any }>(
          "select company_crm_kpis('2026-09-10','2026-09-12','America/New_York') report",
        )
      ).rows[0].report;
      assert.equal(report.trials_active, 1);
      assert.equal(report.trials_awaiting_close, 1);
      assert.deepEqual(
        report.daily.map((day: any) => [
          day.day,
          day.inbound_leads,
          day.outbound_dials,
          day.average_response_minutes,
          day.appointments_booked,
          day.response_samples,
        ]),
        [
          ["2026-09-10", 3, 0, 5, 1, 2],
          ["2026-09-11", 0, 1, null, 0, 0],
          ["2026-09-12", 0, 0, null, 0, 0],
        ],
      );
      // Reapplying after real records exist must preserve all data and access rules.
      await db.exec("reset role");
      const tables = [
        "companies",
        "company_tasks",
        "company_files",
        "storage.objects",
      ];
      const before = await Promise.all(
        tables.map((table) => db.query(`select * from ${table} order by id`)),
      );
      await db.exec(workspaceMigration);
      const after = await Promise.all(
        tables.map((table) => db.query(`select * from ${table} order by id`)),
      );
      assert.deepEqual(
        after.map((result) => result.rows),
        before.map((result) => result.rows),
      );
      await db.exec("set role authenticated");
      await setUser({ role: "viewer" });
      await assert.rejects(
        db.query(
          "insert into company_tasks(company_id,title) values($1,'Viewer task')",
          [company.id],
        ),
        (e: any) => e.code === "42501",
      );
      await assert.rejects(
        db.query(
          "insert into storage.objects(bucket_id,name,owner_id) values('company-files',$1,$2)",
          [`${company.id}/viewer.pdf`, user],
        ),
        (e: any) => e.code === "42501",
      );
      assert.ok((await db.query("select * from companies")).rows.length > 0);
      await assert.rejects(
        db.exec("insert into companies(name) values ('Viewer write')"),
        (e: any) => e.code === "42501",
      );
      await assert.rejects(
        db.exec("delete from companies"),
        (e: any) => e.code === "42501",
      );
      for (const metadata of [
        { role: "member", page_permissions: [] },
        { role: "owner", client_account_id: "client" },
        { role: "owner", status: "inactive" },
      ]) {
        await setUser(metadata);
        assert.equal(
          (await db.query("select * from companies")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from company_tasks")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from company_files")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          0,
        );
        assert.equal(
          (await db.query("select * from company_activities")).rows.length,
          0,
        );
      }
    } finally {
      await db.close();
    }
  });
}
