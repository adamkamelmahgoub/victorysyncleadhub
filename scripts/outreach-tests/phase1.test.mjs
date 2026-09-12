import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { stripTypeScriptTypes } from "node:module";
const modelSource = await readFile(
  new URL("../../lib/outreach.ts", import.meta.url),
  "utf8",
);
const model = await import(
  `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(modelSource)).toString("base64")}`
);
const { PGlite } = await import(
  process.env.PGLITE_MODULE || "@electric-sql/pglite"
);
const up = await readFile(
  new URL(
    "../../supabase/migrations/20260911_outreach_phase1.sql",
    import.meta.url,
  ),
  "utf8",
);
const down = await readFile(
  new URL(
    "../../supabase/rollbacks/20260911_outreach_phase1.sql",
    import.meta.url,
  ),
  "utf8",
);
async function fixture(uuid = false) {
  const db = new PGlite();
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  const idType = uuid ? "uuid" : "integer";
  await db.exec(`create table leads(id ${uuid ? "uuid primary key default gen_random_uuid()" : "serial primary key"},first_name text not null default 'Test',last_name text not null default 'Lead',email text not null,phone text,company text,custom_fields jsonb not null default '{}',disposition text,contact_attempts int not null default 0,client_account_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
 create table activities(id serial primary key,lead_id ${idType} references leads(id) on delete cascade,type text not null,description text not null,created_at timestamptz default now());
 create table sequence_enrollments(id serial primary key,lead_id ${idType},status text not null default 'active');
 create table email_logs(id serial primary key,lead_id ${idType},status text not null default 'queued');
 create table campaign_leads(id serial primary key,lead_id ${idType},status text not null default 'queued');`);
  await db.exec(
    "insert into leads(email,phone,disposition,contact_attempts) values ('legacy@example.test','2125550123','Custom legacy',2)",
  );
  await db.exec("insert into leads(email,phone,disposition) values ('bridge@example.test','3125550101','dnc'),('bridge@example.test','3125550102',null),('bridge-end@example.test','3125550102',null)");
  await db.exec(up);
  await db.exec(
    "grant usage on schema public to service_role; grant select,insert,update,delete on leads,activities,sequence_enrollments,email_logs,campaign_leads to service_role; grant usage,select on all sequences in schema public to service_role;",
  );
  return db;
}
async function insert(
  db,
  email = "fresh@example.test",
  phone = "2125550144",
  extras = {},
) {
  const data = { email, phone, ...extras };
  const fields = Object.keys(data);
  return (
    await db.query(
      `insert into leads(${fields.join(",")}) values(${fields.map((_, i) => `$${i + 1}`).join(",")}) returning *`,
      Object.values(data),
    )
  ).rows[0];
}
async function call(
  db,
  id,
  disposition = "no_answer",
  next = new Date(Date.now() + 86400000).toISOString(),
  request = randomUUID(),
  scope = null,
) {
  return (
    await db.query("select outreach_log_call($1,$2,$3,$4,$5,$6,$7) as result", [
      String(id),
      disposition,
      next,
      "notes",
      request,
      "operator",
      scope,
    ])
  ).rows[0].result;
}
for (const uuid of [false, true])
  test(`Phase 1 actual PostgreSQL functions with ${uuid ? "UUID" : "integer"} CRM IDs`, async (t) => {
    const db = await fixture(uuid);
    try {
      await t.test(
        "public clients cannot call server-only RPCs; server role can read the queue",
        async () => {
          await db.exec("set role authenticated");
          await assert.rejects(
            () => db.query("select outreach_call_queue()"),
            /permission denied/,
          );
          await db.exec("reset role; set role service_role");
          assert.ok(
            (await db.query("select outreach_call_queue() as q")).rows[0].q,
          );
          await db.exec("reset role");
        },
      );
      await t.test(
        "legacy values retained and unknown outcomes held",
        async () => {
          assert.equal((await db.query("select dnc from leads where email='bridge-end@example.test'")).rows[0].dnc,true);
          const row = (
            await db.query(
              "select * from leads where email='legacy@example.test'",
            )
          ).rows[0];
          assert.equal(row.suppressed_reason, "manual_exclude");
          assert.equal(row.attempt_count, 2);
          assert.equal(
            (await db.query("select disposition from outreach_legacy_leads"))
              .rows[0].disposition,
            "Custom legacy",
          );
        },
      );
      await t.test(
        "next-action and fixed-enum constraints reject invalid inserts",
        async () => {
          await assert.rejects(
            () =>
              insert(db, "null@example.test", "2125550144", {
                next_action_at: null,
              }),
            /outreach_fresh_next_action/,
          );
          await assert.rejects(
            () =>
              insert(db, "null2@example.test", "2125550144", {
                disposition: "no_answer",
                next_action_at: null,
              }),
            /outreach_next_action/,
          );
          await assert.rejects(
            () =>
              insert(db, "bad@example.test", "2125550144", {
                disposition: "custom",
              }),
            /invalid input value for enum/,
          );
          await insert(db, "terminal@example.test", "2125550144", {
            disposition: "wrong_number",
            next_action_at: null,
          });
        },
      );
      await t.test(
        "suppression survives deletion/reimport by normalized email OR phone",
        async () => {
          const l = await insert(db, " NoSend@Example.Test ", "(312) 555-0123");
          await db.query("update leads set dnc=true where id=$1", [l.id]);
          await assert.rejects(
            () => db.query("update leads set dnc=false where id=$1", [l.id]),
            /permanent/,
          );
          await db.query("delete from leads where id=$1", [l.id]);
          const email = await insert(db, "nosend@example.test", "2125550199");
          const phone = await insert(
            db,
            "different@example.test",
            "+1 312 555 0123",
          );
          assert.equal(email.dnc, true);
          assert.equal(phone.dnc, true);
          const extension = await insert(
            db,
            "extension@example.test",
            "(312) 555-0123 ext. 99",
          );
          assert.equal(extension.dnc, true);
          assert.equal(
            (
              await db.query(
                "select * from outreach_eligible_leads where id=$1 or id=$2",
                [email.id, phone.id],
              )
            ).rows.length,
            0,
          );
          await assert.rejects(
            () => db.query("delete from outreach_suppressions"),
            /append only/,
          );
          await assert.rejects(
            () =>
              db.query("insert into sequence_enrollments(lead_id) values($1)", [
                phone.id,
              ]),
            /not eligible/,
          );
          await assert.rejects(() => call(db, email.id), /suppressed/);
        },
      );
      await t.test(
        "call is atomic and duplicate requests count once",
        async () => {
          const l = await insert(db, "atomic@example.test", "2125550166");
          await assert.rejects(
            () => call(db, l.id, "no_answer", null),
            /future next action/,
          );
          assert.equal(
            (
              await db.query("select attempt_count from leads where id=$1", [
                l.id,
              ])
            ).rows[0].attempt_count,
            0,
          );
          const request = randomUUID();
          const result = await call(
            db,
            l.id,
            "no_answer",
            new Date(Date.now() + 86400000).toISOString(),
            request,
          );
          const retry = await call(db, l.id, "no_answer", null, request);
          assert.equal(result.attempt_count, 1);
          assert.deepEqual(retry, result);
          assert.equal(
            (
              await db.query(
                "select * from activities where lead_id=$1 and type='call'",
                [l.id],
              )
            ).rows.length,
            1,
          );
          await assert.rejects(
            () =>
              db.query("update leads set contact_attempts=20 where id=$1", [
                l.id,
              ]),
            /atomic call logging/,
          );
          await assert.rejects(
            () =>
              db.query(
                "insert into activities(lead_id,type,description) values($1,'call','bypass')",
                [l.id],
              ),
            /call queue/,
          );
        },
      );
      await t.test(
        "six attempts AND ten elapsed days closes only retry outcomes and audits revisit",
        async () => {
          const old = await insert(db, "old@example.test", "2125550167", {
            attempt_count: 5,
            first_attempt_at: new Date(
              Date.now() - 11 * 86400000,
            ).toISOString(),
            disposition: "no_answer",
          });
          const result = await call(db, old.id);
          assert.equal(result.disposition, "not_interested");
          assert.equal(result.next_action_at, null);
          assert.ok(
            Math.abs(
              Date.parse(result.revisit_at) - Date.now() - 90 * 86400000,
            ) < 10000,
          );
          assert.equal(
            (
              await db.query(
                "select * from outreach_audit where lead_id=$1 and actor='system' and reason='attempt_policy_exhausted'",
                [String(old.id)],
              )
            ).rows.length,
            1,
          );
          const recent = await insert(db, "recent@example.test", "2125550168", {
            attempt_count: 5,
            first_attempt_at: new Date(Date.now() - 9 * 86400000).toISOString(),
            disposition: "no_answer",
          });
          assert.equal((await call(db, recent.id)).disposition, "no_answer");
          const booked = await insert(db, "booked@example.test", "2125550169", {
            attempt_count: 6,
            first_attempt_at: new Date(
              Date.now() - 11 * 86400000,
            ).toISOString(),
            disposition: "no_answer",
          });
          await db.query(
            "insert into sequence_enrollments(lead_id) values($1)",
            [booked.id],
          );
          assert.equal(
            (await call(db, booked.id, "meeting_booked")).disposition,
            "meeting_booked",
          );
          assert.equal(
            (
              await db.query(
                "select status from sequence_enrollments where lead_id=$1",
                [booked.id],
              )
            ).rows[0].status,
            "stopped",
          );
        },
      );
      await t.test(
        "US and Cairo DST use named timezones independent of DB session timezone",
        async () => {
          const cases = [
            ["2026-03-07T11:59:59Z", "America/New_York", false],
            ["2026-03-07T12:00:00Z", "America/New_York", true],
            ["2026-03-08T10:59:59Z", "America/New_York", false],
            ["2026-03-08T11:00:00Z", "America/New_York", true],
            ["2026-11-01T11:00:00Z", "America/New_York", false],
            ["2026-11-01T12:00:00Z", "America/New_York", true],
            ["2026-07-01T22:00:00Z", "America/New_York", false],
            ["2026-07-01T14:00:00Z", "America/Phoenix", true],
            ["2026-07-01T14:00:00Z", "America/Los_Angeles", true],
          ];
          for (const session of ["UTC", "Africa/Cairo"]) {
            await db.exec(`set timezone='${session}'`);
            for (const [at, tz, expected] of cases)
              assert.equal(
                (
                  await db.query("select outreach_call_window($1,$2) as ok", [
                    at,
                    tz,
                  ])
                ).rows[0].ok,
                expected,
                `${session} ${at} ${tz}`,
              );
          }
          for (const [at, expectedLocal] of [
            ["2026-04-23T21:59:59Z", "2026-04-23 23:59:59"],
            ["2026-04-23T22:00:00Z", "2026-04-24 01:00:00"],
            ["2026-10-29T20:59:59Z", "2026-10-29 23:59:59"],
            ["2026-10-29T21:00:00Z", "2026-10-29 23:00:00"],
          ]) {
            const { rows } = await db.query(
              "select ($1::timestamptz at time zone 'Africa/Cairo')::text as local, outreach_call_window($1,'America/New_York') as ok",
              [at],
            );
            const jsHour = Number(
              new Intl.DateTimeFormat("en-US", {
                timeZone: "America/New_York",
                hour: "2-digit",
                hourCycle: "h23",
              }).format(new Date(at)),
            );
            assert.equal(rows[0].local, expectedLocal);
            assert.equal(rows[0].ok, jsHour >= 7 && jsHour < 18);
          }
        },
      );
      await t.test(
        "unknown timezone stays out; state and area code derivation work",
        async () => {
          const unknown = await insert(
            db,
            "unknown@example.test",
            "8005550100",
          );
          assert.equal(unknown.timezone_confirmed, false);
          assert.equal(
            (
              await insert(db, "ca@example.test", "4155550100", {
                custom_fields: { state: "CA" },
              })
            ).timezone,
            "America/Los_Angeles",
          );
          const client = randomUUID();
          const q = (
            await db.query("select outreach_call_queue(null,$1) as q", [client])
          ).rows[0].q;
          assert.deepEqual(q.due, []);
          assert.deepEqual(q.fresh, []);
          await assert.rejects(
            () =>
              call(
                db,
                unknown.id,
                "no_answer",
                new Date(Date.now() + 86400000).toISOString(),
                randomUUID(),
                client,
              ),
            /not found/,
          );
        },
      );
      await t.test(
        "queue separates due retries from fresh leads and applies time, terminal, and account filters",
        async () => {
          const client = randomUUID();
          const zones = [
            "America/New_York",
            "America/Chicago",
            "America/Denver",
            "America/Los_Angeles",
            "America/Anchorage",
            "Pacific/Honolulu",
          ];
          const open = (
            await db.query(
              "select unnest(enum_range(null::outreach_timezone))::text as tz",
            )
          ).rows;
          let timezone = "America/New_York";
          for (const { tz } of open) {
            if (
              zones.includes(tz) &&
              (
                await db.query("select outreach_call_window(now(),$1) as ok", [
                  tz,
                ])
              ).rows[0].ok
            ) {
              timezone = tz;
              break;
            }
          }
          const extra = {
            client_account_id: client,
            timezone,
            timezone_confirmed: true,
          };
          const a = await insert(db, "queue-a@example.test", "2125550181", {
            ...extra,
            disposition: "voicemail",
            attempt_count: 1,
            first_attempt_at: new Date(Date.now() - 86400000).toISOString(),
            next_action_at: new Date(Date.now() - 7200000).toISOString(),
          });
          const b = await insert(db, "queue-b@example.test", "2125550182", {
            ...extra,
            disposition: "callback_scheduled",
            attempt_count: 1,
            first_attempt_at: new Date(Date.now() - 86400000).toISOString(),
            next_action_at: new Date(Date.now() - 3600000).toISOString(),
          });
          const fresh = await insert(
            db,
            "queue-fresh@example.test",
            "2125550183",
            extra,
          );
          await insert(db, "queue-future@example.test", "2125550184", {
            ...extra,
            next_action_at: new Date(Date.now() + 86400000).toISOString(),
          });
          await insert(db, "queue-terminal@example.test", "2125550185", {
            ...extra,
            disposition: "not_interested",
            next_action_at: null,
          });
          const q = (
            await db.query("select outreach_call_queue($1,$2) as q", [
              timezone,
              client,
            ])
          ).rows[0].q;
          const isOpen = (
            await db.query("select outreach_call_window(now(),$1) as ok", [
              timezone,
            ])
          ).rows[0].ok;
          assert.deepEqual(
            q.due.map((l) => l.id),
            isOpen ? [a.id, b.id] : [],
          );
          assert.deepEqual(
            q.fresh.map((l) => l.id),
            isOpen ? [fresh.id] : [],
          );
        },
      );
      await t.test(
        "rollback restores schema and preserved legacy disposition",
        async () => {
          await db.exec(down);
          assert.equal(
            (
              await db.query(
                "select disposition from leads where email='legacy@example.test'",
              )
            ).rows[0].disposition,
            "Custom legacy",
          );
          assert.equal(
            (
              await db.query(
                "select count(*)::int n from information_schema.columns where table_name='leads' and column_name='attempt_count'",
              )
            ).rows[0].n,
            0,
          );
        },
      );
    } finally {
      await db.close();
    }
  });
test("model validates enum, next action, timezone boundary and discovery inputs", () => {
  assert.throws(
    () => model.validateNextAction("no_answer", null),
    /next action/,
  );
  assert.throws(() => model.validateNextAction(null, null), /next action/);
  assert.throws(
    () => model.validateNextAction("meeting_booked", null),
    /next action/,
  );
  assert.doesNotThrow(() => model.validateNextAction("dnc", null));
  assert.throws(
    () => model.parseCall({ disposition: "custom", requestId: randomUUID() }),
    /fixed/,
  );
  assert.throws(
    () =>
      model.parseCall({
        disposition: "voicemail",
        requestId: randomUUID(),
        nextActionAt: "2026-11-01T01:30:00",
      }),
    /timezone offset/,
  );
  assert.equal(
    model.parseCall({
      disposition: "voicemail",
      requestId: randomUUID(),
      nextActionAt: "2026-11-01T01:30:00-04:00",
    }).p_next_action_at,
    "2026-11-01T01:30:00-04:00",
  );
  assert.throws(
    () => model.parseOutreachUpdate({ timezone: "UTC" }),
    /supported US timezone/,
  );
  assert.throws(
    () => model.parseOutreachUpdate({ missedCallsPerWeek: 2.5 }),
    /non-negative/,
  );
  assert.throws(
    () => model.parseOutreachUpdate({ suppressedReason: null }),
    /Invalid suppression/,
  );
  assert.deepEqual(model.parseOutreachUpdate({ timezone: "America/Phoenix" }), {
    timezone: "America/Phoenix",
    timezone_confirmed: true,
  });
});
