import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { mcpPool, type McpIdentity } from "./mcp-auth.js";
import { enrichLead, bulkEnrich, jobStatus, askAboutLead, previewBulk } from "./enrichment-client.js";

const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error("Invalid identifier");
  return `"${s}"`;
};
const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});
const filterSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
const rowSchema = z.record(z.string(), z.unknown());
const tableSchema = z.string().regex(/^[a-z_][a-z0-9_]*$/i);
const idSchema = z.string().uuid();
type Filters = z.infer<typeof filterSchema>;
async function columns(db: PoolClient, table: string) {
  const q = await db.query(
    `select column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,
    [table],
  );
  if (!q.rows.length) throw new Error("Unknown public table");
  return q.rows as {
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
  }[];
}
async function exists(db: PoolClient, table: string) {
  return Boolean(
    (await db.query("select to_regclass($1) as relation", [`public.${table}`]))
      .rows[0]?.relation,
  );
}
function where(filters: Filters, start = 1) {
  const entries = Object.entries(filters);
  if (!entries.length) throw new Error("At least one filter is required");
  let slot = start;
  return {
    sql: entries
      .map(([k, v]) => `${ident(k)} ${v === null ? "is null" : `= $${slot++}`}`)
      .join(" and "),
    values: entries.filter(([, v]) => v !== null).map(([, v]) => v),
  };
}
function valuesFor(row: Record<string, unknown>) {
  const entries = Object.entries(row);
  if (!entries.length) throw new Error("At least one field is required");
  return {
    cols: entries.map(([k]) => ident(k)).join(","),
    slots: entries.map((_, i) => `$${i + 1}`).join(","),
    values: entries.map(([, v]) => v),
  };
}
async function isSuppressed(db: PoolClient, row: Record<string, unknown>) {
  const q = await db.query(
    `select 1 from public.outreach_suppressions where (identity_type='phone' and identity_value=public.outreach_phone($1)) or (identity_type='email' and identity_value=public.outreach_email($2)) limit 1`,
    [row.phone || "", row.email || ""],
  );
  return Boolean(q.rowCount);
}
async function audit(
  db: PoolClient,
  who: McpIdentity,
  tool: string,
  args: unknown,
  rows: number | null,
  status: string,
  error?: string,
) {
  const safeArgs = JSON.parse(
    JSON.stringify(args, (key, value) =>
      /password|token|secret|credential/i.test(key) ? "[redacted]" : value,
    ),
  );
  const q = await db.query(
    `insert into public.mcp_audit_log(user_id,email,client_id,tool,arguments,rows_affected,result_status,error_message) values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
    [
      who.userId,
      who.email,
      who.clientId,
      tool,
      safeArgs,
      rows,
      status,
      error || null,
    ],
  );
  return q.rows[0].id as number;
}
async function execute<T>(
  who: McpIdentity,
  name: string,
  args: unknown,
  write: boolean,
  fn: (db: PoolClient) => Promise<T>,
  timeoutSeconds = 10,
): Promise<T> {
  const db = await mcpPool.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('statement_timeout', $1, true)", [
      `${timeoutSeconds}s`,
    ]);
    const result = await fn(db);
    const affected = Array.isArray(result)
      ? result.length
      : result === null
        ? 0
        : typeof result === "object" && result !== null && "deleted" in result
          ? Number((result as { deleted: number }).deleted)
          : typeof result === "object" &&
              result !== null &&
              "inserted" in result
            ? Number((result as { inserted: unknown[] }).inserted.length)
            : typeof result === "object" && result !== null && "updated" in result
              ? Number((result as { updated: number }).updated)
              : typeof result === "object" && result !== null && "upserted" in result
                ? Number((result as { upserted: number }).upserted)
            : typeof result === "object" &&
                result !== null &&
                "rowCount" in result
              ? Number((result as { rowCount: number | null }).rowCount || 0)
              : 1;
    if (write) await audit(db, who, name, args, affected, "ok");
    await db.query("commit");
    return result;
  } catch (e) {
    await db.query("rollback").catch(() => {});
    if (write)
      await mcpPool
        .query(
          `insert into public.mcp_audit_log(user_id,email,client_id,tool,arguments,result_status,error_message) values($1,$2,$3,$4,$5,'error',$6)`,
          [
            who.userId,
            who.email,
            who.clientId,
            name,
            JSON.stringify(args),
            String((e as Error).message).slice(0, 500),
          ],
        )
        .catch(() => {});
    throw e;
  } finally {
    db.release();
  }
}
function tool(
  server: McpServer,
  who: McpIdentity,
  name: string,
  description: string,
  schema: z.ZodRawShape,
  readOnly: boolean,
  destructive: boolean,
  fn: (db: PoolClient, args: any) => Promise<unknown>,
  timeoutSeconds = 10,
) {
  server.registerTool(
    name,
    {
      description,
      inputSchema: schema,
      annotations: { readOnlyHint: readOnly, destructiveHint: destructive },
    },
    async (args: any) => {
      try {
        return json(
          await execute(who, name, args, !readOnly, (db) => fn(db, args), timeoutSeconds),
        );
      } catch (e) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: (e as Error).message }],
        };
      }
    },
  );
}
export function createCrmMcpServer(who: McpIdentity) {
  const server = new McpServer({ name: "victory-sync-crm", version: "0.1.0" });
  tool(
    server,
    who,
    "list_tables",
    "List public CRM tables, including new tables.",
    {},
    true,
    false,
    async (db) =>
      (
        await db.query(
          `select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`,
        )
      ).rows,
  );
  tool(
    server,
    who,
    "describe_table",
    "Get columns, constraints and policies for a public table.",
    { table: tableSchema },
    true,
    false,
    async (db, a) => ({
      columns: await columns(db, a.table),
      constraints: (
        await db.query(
          `select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid=$1::regclass`,
          [`public.${a.table}`],
        )
      ).rows,
      policies: (
        await db.query(
          `select policyname,cmd,qual,with_check from pg_policies where schemaname='public' and tablename=$1`,
          [a.table],
        )
      ).rows,
    }),
  );
  tool(
    server,
    who,
    "query_rows",
    "Read rows from a public table with equality filters, selected columns, ordering and pagination.",
    {
      table: tableSchema,
      filters: filterSchema.optional(),
      select: z.array(tableSchema).optional(),
      order: tableSchema.optional(),
      descending: z.boolean().optional(),
      limit: z.number().int().min(1).max(1000).default(100),
      offset: z.number().int().min(0).default(0),
    },
    true,
    false,
    async (db, a) => {
      const cols = await columns(db, a.table),
        names = new Set(cols.map((x) => x.column_name));
      const selected = a.select?.length ? a.select : ["*"];
      if (selected.some((x: string) => x !== "*" && !names.has(x)))
        throw new Error("Unknown selected column");
      const f =
        a.filters && Object.keys(a.filters).length ? where(a.filters) : null;
      if (a.filters && Object.keys(a.filters).some((x) => !names.has(x)))
        throw new Error("Unknown filter column");
      if (a.order && !names.has(a.order))
        throw new Error("Unknown order column");
      return (
        await db.query(
          `select ${selected.map((x: string) => (x === "*" ? "*" : ident(x))).join(",")} from public.${ident(a.table)} ${f ? "where " + f.sql : ""} ${a.order ? "order by " + ident(a.order) + (a.descending ? " desc" : " asc") : ""} limit ${a.limit} offset ${a.offset}`,
          f?.values || [],
        )
      ).rows;
    },
  );
  tool(
    server,
    who,
    "insert_rows",
    "Insert rows into a public table and return them. Suppressed leads are skipped.",
    { table: tableSchema, rows: z.array(rowSchema).min(1).max(500) },
    false,
    false,
    async (db, a) => {
      await columns(db, a.table);
      const out = [];
      for (const row of a.rows) {
        if (a.table === "leads" && (await isSuppressed(db, row))) continue;
        const v = valuesFor(row);
        out.push(
          ...(
            await db.query(
              `insert into public.${ident(a.table)}(${v.cols}) values(${v.slots}) returning *`,
              v.values,
            )
          ).rows,
        );
      }
      return out;
    },
  );
  tool(
    server,
    who,
    "update_rows",
    "Update matching public table rows. A nonempty equality filter is required.",
    { table: tableSchema, filters: filterSchema, values: rowSchema, return_rows: z.boolean().default(true) },
    false,
    false,
    async (db, a) => {
      await columns(db, a.table);
      const v = Object.entries(a.values);
      if (!v.length) throw new Error("No changes supplied");
      const w = where(a.filters, v.length + 1);
      const q = await db.query(
        `update public.${ident(a.table)} set ${v.map(([k], i) => `${ident(k)}=$${i + 1}`).join(",")} where ${w.sql}${a.return_rows === false ? "" : " returning *"}`,
        [...v.map(([, x]) => x), ...w.values],
      );
      return a.return_rows === false ? { updated: q.rowCount || 0 } : q.rows;
    },
  );
  tool(
    server,
    who,
    "delete_rows",
    "Delete matching rows and save each row to mcp_deleted_backup first. A nonempty equality filter is required.",
    { table: tableSchema, filters: filterSchema },
    false,
    true,
    async (db, a) => {
      await columns(db, a.table);
      const w = where(a.filters);
      const rows = (
        await db.query(
          `select * from public.${ident(a.table)} where ${w.sql} for update`,
          w.values,
        )
      ).rows;
      for (const row of rows)
        await db.query(
          `insert into public.mcp_deleted_backup(user_id,source_table,source_pk,row_data) values($1,$2,$3,$4)`,
          [who.userId, a.table, row.id ? { id: row.id } : null, row],
        );
      await db.query(
        `delete from public.${ident(a.table)} where ${w.sql}`,
        w.values,
      );
      return { deleted: rows.length };
    },
  );
  tool(
    server,
    who,
    "upsert_rows",
    "Upsert rows using named conflict columns. Suppressed leads are skipped.",
    {
      table: tableSchema,
      rows: z.array(rowSchema).min(1).max(500),
      conflict_columns: z.array(tableSchema).min(1),
      return_rows: z.boolean().default(true),
    },
    false,
    false,
    async (db, a) => {
      await columns(db, a.table);
      const out = [];
      let upserted = 0;
      for (const row of a.rows) {
        if (a.table === "leads" && (await isSuppressed(db, row))) continue;
        const v = valuesFor(row),
          keys = Object.keys(row);
        if (a.conflict_columns.some((x: string) => !keys.includes(x)))
          throw new Error("Conflict columns must be supplied in every row");
        const q = await db.query(
              `insert into public.${ident(a.table)}(${v.cols}) values(${v.slots}) on conflict (${a.conflict_columns.map(ident).join(",")}) do update set ${
                keys
                  .filter((k) => !a.conflict_columns.includes(k))
                  .map((k) => `${ident(k)}=excluded.${ident(k)}`)
                  .join(",") ||
                `${ident(a.conflict_columns[0])}=excluded.${ident(a.conflict_columns[0])}`
              }${a.return_rows === false ? "" : " returning *"}`,
              v.values,
            );
        upserted += q.rowCount || 0;
        if (a.return_rows !== false) out.push(...q.rows);
      }
      return a.return_rows === false ? { upserted } : out;
    },
  );
  tool(
    server,
    who,
    "bulk_tag_leads",
    "Add and remove tags on leads selected by up to 5,000 UUIDs or a SQL WHERE expression. Returns matched and changed counts only. Removals take precedence over additions.",
    {
      lead_ids: z.array(idSchema).min(1).max(5000).optional(),
      sql_where: z.string().min(1).max(10000).optional(),
      add_tags: z.array(z.string()).default([]),
      remove_tags: z.array(z.string()).default([]),
    },
    false,
    false,
    async (db, a) => {
      if (Boolean(a.lead_ids) === Boolean(a.sql_where))
        throw new Error("Supply exactly one of lead_ids or sql_where");
      if (a.sql_where && /;|--|\/\*|\*\/|\$[0-9]+/.test(a.sql_where))
        throw new Error("sql_where must be one SQL expression without comments, semicolons or parameters");
      const predicate = a.lead_ids ? "id = any($1::uuid[])" : `(${a.sql_where})`;
      const args = a.lead_ids
        ? [a.lead_ids, a.add_tags, a.remove_tags]
        : [a.add_tags, a.remove_tags];
      const addSlot = a.lead_ids ? 2 : 1;
      const removeSlot = a.lead_ids ? 3 : 2;
      const q = await db.query(
        `with matched as materialized (
          select id,tags from public.leads where ${predicate} for update
        ), changed as (
          select id, array(
            select tag from unnest(coalesce(tags,'{}'::text[]) || $${addSlot}::text[]) with ordinality as input(tag,ord)
            where tag <> all($${removeSlot}::text[])
            group by tag order by min(ord)
          ) as new_tags from matched
        ), updated as (
          update public.leads l set tags=c.new_tags from changed c
          where l.id=c.id and l.tags is distinct from c.new_tags returning l.id
        )
        select (select count(*)::int from matched) as matched,
               (select count(*)::int from updated) as updated`,
        args,
      );
      return q.rows[0];
    },
    120,
  );
  tool(
    server,
    who,
    "run_sql",
    "Run SQL with a 60-second statement timeout. UPDATE and destructive SQL back up affected public rows before execution.",
    { sql: z.string().min(1).max(100000) },
    false,
    true,
    async (db, a) => {
      const sql = a.sql as string;
      const destructive = /\b(delete|truncate|drop|alter|update)\b/i.test(sql);
      if (destructive) {
        // A plain UPDATE can back up its matching rows in one statement. More
        // complex SQL keeps the broad fallback so it remains recoverable.
        const simpleUpdate = /^\s*update\s+(?:only\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+set\s+[\s\S]+?\s+where\s+([\s\S]+?)(?:\s+returning\s+[\s\S]+)?;?\s*$/i.exec(sql);
        const wholeTableUpdate = !/\b(where|from)\b/i.test(sql)
          ? /^\s*update\s+(?:only\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s+set\s+[\s\S]+?;?\s*$/i.exec(sql)
          : null;
        if ((simpleUpdate || wholeTableUpdate) &&
            !/;|--|\/\*|\*\//.test(sql.trim().replace(/;$/, "")) &&
            !/\bfrom\b/i.test(sql.slice(0, sql.search(/\bwhere\b/i) < 0 ? sql.length : sql.search(/\bwhere\b/i)))) {
          const table = (simpleUpdate || wholeTableUpdate)![1];
          const predicate = simpleUpdate?.[2].replace(/;\s*$/, "") || "true";
          await columns(db, table);
          await db.query(
            `insert into public.mcp_deleted_backup(user_id,source_table,source_pk,row_data) select $1,$2,case when to_jsonb(t) ? 'id' then jsonb_build_object('id',to_jsonb(t)->'id') else null end,to_jsonb(t) from public.${ident(table)} t where ${predicate} for update`,
            [who.userId, table],
          );
        } else {
          const updateOnly = /\bupdate\b/i.test(sql) &&
            !/\b(delete|truncate|drop|alter)\b/i.test(sql);
          const updateTargets = updateOnly
            ? [...sql.matchAll(/\bupdate\s+(?:only\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)]
                .map((match) => match[1])
                .filter((table) => !table.startsWith("mcp_"))
            : [];
          const tables = updateTargets.length
            ? [...new Set(updateTargets)].map((table_name) => ({ table_name }))
            : (await db.query(
                `select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' and table_name not like 'mcp_%'`,
              )).rows;
          for (const { table_name } of tables) {
            await db.query(
              `insert into public.mcp_deleted_backup(user_id,source_table,source_pk,row_data) select $1,$2,null,to_jsonb(t) from public.${ident(table_name)} t`,
              [who.userId, table_name],
            );
          }
        }
      }
      const q = await db.query(sql);
      return { command: q.command, rowCount: q.rowCount, rows: q.rows };
    },
    60,
  );
  tool(
    server,
    who,
    "search_leads",
    "Search leads by name, company, phone, town, status, tags or free text.",
    {
      name: z.string().optional(),
      company: z.string().optional(),
      phone: z.string().optional(),
      town: z.string().optional(),
      status: z.string().optional(),
      tags: z.array(z.string()).optional(),
      text: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50),
    },
    true,
    false,
    async (db, a) => {
      const p: any[] = [],
        parts: string[] = [];
      for (const [key, col] of [
        ["name", "concat_ws(' ',first_name,last_name)"],
        ["company", "company"],
        ["phone", "phone"],
        [
          "town",
          "concat_ws(' ',custom_fields->>'town',custom_fields->>'city')",
        ],
        [
          "text",
          "concat_ws(' ',first_name,last_name,company,phone,email,title)",
        ],
      ] as const) {
        if (a[key]) {
          p.push("%" + a[key] + "%");
          parts.push(`${col} ilike $${p.length}`);
        }
      }
      if (a.status) {
        p.push(a.status);
        parts.push(`status=$${p.length}`);
      }
      if (a.tags?.length) {
        p.push(a.tags);
        parts.push(`tags @> $${p.length}::text[]`);
      }
      return (
        await db.query(
          `select * from public.leads ${parts.length ? "where " + parts.join(" and ") : ""} order by created_at desc limit ${a.limit}`,
          p,
        )
      ).rows;
    },
  );
  tool(
    server,
    who,
    "get_lead",
    "Read a lead with call history, notes, tasks, emails and linked CRM deals.",
    { id: idSchema },
    true,
    false,
    async (db, a) => {
      const q = await db.query(
        "select l.*,s.name stage_name from public.leads l left join public.pipeline_stages s on s.id=l.pipeline_stage_id where l.id=$1",
        [a.id],
      );
      if (!q.rowCount) throw new Error("Lead not found");
      return {
        lead: q.rows[0],
        calls: (
          await db.query(
            `select * from public.outreach_audit where lead_id=$1 and reason='call_logged' order by created_at desc`,
            [a.id],
          )
        ).rows,
        notes: (
          await db.query(
            "select * from public.notes where lead_id=$1 order by created_at desc",
            [a.id],
          )
        ).rows,
        tasks: (
          await db.query(
            "select * from public.contact_tasks where lead_id=$1 order by due_date nulls last",
            [a.id],
          )
        ).rows,
        emails: (
          await db.query(
            "select * from public.email_logs where lead_id=$1 order by sent_at desc",
            [a.id],
          )
        ).rows,
        deals: (await exists(db, "crm_deals"))
          ? (
              await db.query(
                "select * from public.crm_deals where source_lead_id=$1",
                [a.id],
              )
            ).rows
          : [],
      };
    },
  );
  tool(
    server,
    who,
    "create_lead",
    "Create a lead, skipping suppressed identities.",
    { row: rowSchema },
    false,
    false,
    async (db, a) => {
      if (await isSuppressed(db, a.row))
        return { skipped: true, reason: "suppressed" };
      const v = valuesFor(a.row);
      return (
        await db.query(
          `insert into public.leads(${v.cols}) values(${v.slots}) returning *`,
          v.values,
        )
      ).rows[0];
    },
  );
  tool(
    server,
    who,
    "update_lead",
    "Update a lead; booking triggers handle Meeting Booked and Slack.",
    { id: idSchema, values: rowSchema },
    false,
    false,
    async (db, a) => {
      const v = Object.entries(a.values);
      if (!v.length) throw new Error("No changes");
      const q = await db.query(
        `update public.leads set ${v.map(([k], i) => `${ident(k)}=$${i + 2}`).join(",")} where id=$1 returning *`,
        [a.id, ...v.map(([, x]) => x)],
      );
      return q.rows[0] || null;
    },
  );
  tool(
    server,
    who,
    "change_lead_status",
    "Change lead status with normal booking and Slack triggers; meeting_at is required for Meeting Booked.",
    {
      id: idSchema,
      status: z.string(),
      meeting_at: z.string().datetime().optional(),
      meeting_timezone: z.string().optional(),
    },
    false,
    false,
    async (db, a) => {
      const q = await db.query(
        `update public.leads set status=$2,meeting_at=coalesce($3::timestamptz,meeting_at),meeting_timezone=coalesce($4,meeting_timezone),updated_by=$5 where id=$1 returning *`,
        [
          a.id,
          a.status,
          a.meeting_at || null,
          a.meeting_timezone || null,
          who.userId,
        ],
      );
      return q.rows[0] || null;
    },
  );
  tool(
    server,
    who,
    "add_note",
    "Add a note to a lead.",
    { lead_id: idSchema, content: z.string().min(1) },
    false,
    false,
    async (db, a) =>
      (
        await db.query(
          "insert into public.notes(lead_id,content) values($1,$2) returning *",
          [a.lead_id, a.content],
        )
      ).rows[0],
  );
  tool(
    server,
    who,
    "create_task",
    "Create a lead follow-up task.",
    {
      lead_id: idSchema,
      title: z.string().min(1),
      description: z.string().optional(),
      due_date: z.string().datetime().optional(),
      priority: z.string().default("medium"),
    },
    false,
    false,
    async (db, a) =>
      (
        await db.query(
          "insert into public.contact_tasks(lead_id,title,description,due_date,priority) values($1,$2,$3,$4,$5) returning *",
          [
            a.lead_id,
            a.title,
            a.description || null,
            a.due_date || null,
            a.priority,
          ],
        )
      ).rows[0],
  );
  tool(
    server,
    who,
    "list_tasks",
    "List lead follow-up tasks.",
    {
      lead_id: idSchema.optional(),
      completed: z.boolean().optional(),
      limit: z.number().int().min(1).max(500).default(100),
    },
    true,
    false,
    async (db, a) =>
      (
        await db.query(
          "select * from public.contact_tasks where ($1::uuid is null or lead_id=$1) and ($2::boolean is null or is_completed=$2) order by due_date nulls last limit $3",
          [a.lead_id || null, a.completed ?? null, a.limit],
        )
      ).rows,
  );
  tool(
    server,
    who,
    "complete_task",
    "Mark a lead task completed.",
    { id: idSchema },
    false,
    false,
    async (db, a) =>
      (
        await db.query(
          "update public.contact_tasks set is_completed=true,completed_at=now() where id=$1 returning *",
          [a.id],
        )
      ).rows[0] || null,
  );
  tool(
    server,
    who,
    "move_deal_stage",
    "Move a CRM deal or lead to a stage. Lead Meeting Booked triggers remain active.",
    {
      record_type: z.enum(["deal", "lead"]).default("deal"),
      record_id: idSchema,
      stage_id: idSchema,
      meeting_at: z.string().datetime().optional(),
    },
    false,
    false,
    async (db, a) =>
      a.record_type === "deal"
        ? (
            await db.query(
              "update public.crm_deals set stage_id=$2,stage_changed_at=now() where id=$1 returning *",
              [a.record_id, a.stage_id],
            )
          ).rows[0] || null
        : (
            await db.query(
              "update public.leads set pipeline_stage_id=$2,meeting_at=coalesce($3::timestamptz,meeting_at),updated_by=$4 where id=$1 returning *",
              [a.record_id, a.stage_id, a.meeting_at || null, who.userId],
            )
          ).rows[0] || null,
  );
  tool(
    server,
    who,
    "list_pipeline",
    "List both app lead stages and deployed CRM deal stages with counts.",
    {},
    true,
    false,
    async (db) => ({
      lead_stages: (
        await db.query(
          `select p.id pipeline_id,p.name pipeline,s.id stage_id,s.name stage,s.position,count(l.id)::int lead_count from public.pipelines p join public.pipeline_stages s on s.pipeline_id=p.id left join public.leads l on l.pipeline_stage_id=s.id group by p.id,p.name,s.id,s.name,s.position order by p.name,s.position`,
        )
      ).rows,
      deal_stages: (await exists(db, "crm_deals"))
        ? (
            await db.query(
              `select s.organization_id,s.id stage_id,s.name stage,s.position,count(d.id)::int deal_count from public.crm_pipeline_stages s left join public.crm_deals d on d.stage_id=s.id group by s.organization_id,s.id,s.name,s.position order by s.organization_id,s.position`,
            )
          ).rows
        : [],
    }),
  );
  tool(
    server,
    who,
    "list_sequences",
    "List cold email sequences.",
    {},
    true,
    false,
    async (db) =>
      (
        await db.query(
          "select * from public.sequences order by created_at desc",
        )
      ).rows,
  );
  tool(
    server,
    who,
    "list_email_activity",
    "List recent legacy email logs and current outreach jobs for one lead.",
    { lead_id: idSchema, limit: z.number().int().min(1).max(500).default(100) },
    true,
    false,
    async (db, a) => ({
      logs: (
        await db.query(
          "select * from public.email_logs where lead_id=$1 order by sent_at desc limit $2",
          [a.lead_id, a.limit],
        )
      ).rows,
      jobs: (
        await db.query(
          "select * from public.outreach_email_jobs where lead_id=$1 order by created_at desc limit $2",
          [a.lead_id, a.limit],
        )
      ).rows,
    }),
  );
  tool(
    server,
    who,
    "check_dnc",
    "Check whether a phone or email is suppressed.",
    { phone: z.string().optional(), email: z.string().optional() },
    true,
    false,
    async (db, a) => {
      if (!a.phone && !a.email) throw new Error("Supply phone or email");
      return (
        await db.query(
          `select * from public.outreach_suppressions where (identity_type='phone' and identity_value=public.outreach_phone($1)) or (identity_type='email' and identity_value=public.outreach_email($2))`,
          [a.phone || null, a.email || null],
        )
      ).rows;
    },
  );
  tool(
    server,
    who,
    "add_to_dnc",
    "Permanently suppress a phone or email from outreach.",
    { phone: z.string().optional(), email: z.string().optional() },
    false,
    true,
    async (db, a) => {
      if (!a.phone && !a.email) throw new Error("Supply phone or email");
      const out = [];
      if (a.phone)
        out.push(
          ...(
            await db.query(
              `insert into public.outreach_suppressions(identity_type,identity_value,reason) values('phone',public.outreach_phone($1),'dnc') on conflict do nothing returning *`,
              [a.phone],
            )
          ).rows,
        );
      if (a.email)
        out.push(
          ...(
            await db.query(
              `insert into public.outreach_suppressions(identity_type,identity_value,reason) values('email',public.outreach_email($1),'dnc') on conflict do nothing returning *`,
              [a.email],
            )
          ).rows,
        );
      return out;
    },
  );
  tool(
    server,
    who,
    "pipeline_summary",
    "Summarize lead and CRM deal counts by stage.",
    {},
    true,
    false,
    async (db) => ({
      leads: (
        await db.query(
          `select p.name pipeline,s.name stage,count(l.id)::int leads from public.pipelines p join public.pipeline_stages s on s.pipeline_id=p.id left join public.leads l on l.pipeline_stage_id=s.id group by p.name,s.name,s.position order by p.name,s.position`,
        )
      ).rows,
      deals: (await exists(db, "crm_deals"))
        ? (
            await db.query(
              `select s.organization_id,s.name stage,count(d.id)::int deals from public.crm_pipeline_stages s left join public.crm_deals d on d.stage_id=s.id group by s.organization_id,s.name,s.position order by s.organization_id,s.position`,
            )
          ).rows
        : [],
    }),
  );
  tool(
    server,
    who,
    "log_call",
    "Record a call through the atomic outreach function; saves outcome, next action and activity.",
    {
      lead_id: idSchema,
      outcome: z.enum([
        "no_answer",
        "voicemail",
        "gatekeeper",
        "wrong_number",
        "not_interested",
        "callback_scheduled",
        "meeting_booked",
        "dnc",
      ]),
      notes: z.string().default(""),
      next_action_at: z.string().datetime().nullable().optional(),
      duration_seconds: z.number().int().min(0).optional(),
    },
    false,
    false,
    async (db, a) =>
      (
        await db.query(
          "select public.outreach_log_call($1,$2,$3,$4,$5,$6,$7) result",
          [
            a.lead_id,
            a.outcome,
            a.next_action_at || null,
            a.notes +
              (a.duration_seconds !== undefined
                ? ` [duration ${a.duration_seconds}s]`
                : ""),
            randomUUID(),
            who.userId,
            null,
          ],
        )
      ).rows[0].result,
  );
  tool(
    server,
    who,
    "bulk_import_leads",
    "Import leads, skipping DNC identities and existing phone plus company matches.",
    { rows: z.array(rowSchema).min(1).max(500) },
    false,
    false,
    async (db, a) => {
      const inserted = [],
        skipped = [];
      for (const row of a.rows) {
        const phone = String(row.phone || ""),
          company = String(row.company || "");
        const conflict = await db.query(
          `select 1 from public.leads where coalesce(normalized_phone,phone)=coalesce(public.outreach_phone($1),$1) and lower(trim(company))=lower(trim($2)) limit 1`,
          [phone, company],
        );
        const dnc = await isSuppressed(db, row);
        if (conflict.rowCount || dnc) {
          skipped.push({
            phone,
            company,
            reason: dnc ? "suppressed" : "duplicate",
          });
          continue;
        }
        const v = valuesFor(row);
        inserted.push(
          (
            await db.query(
              `insert into public.leads(${v.cols}) values(${v.slots}) returning id`,
              v.values,
            )
          ).rows[0],
        );
      }
      return { inserted, skipped };
    },
  );
  tool(
    server,
    who,
    "enroll_lead_in_sequence",
    "Enroll one lead using the existing guarded sequence enrollment function.",
    { lead_id: idSchema, sequence_id: idSchema },
    false,
    false,
    async (db, a) =>
      (
        await db.query(
          "select public.outreach_sequence_bulk_enroll($1,$2,$3,$4) result",
          [a.sequence_id, [a.lead_id], who.userId, null],
        )
      ).rows[0].result,
  );
  tool(
    server,
    who,
    "pause_sequence",
    "Pause a sequence; existing state triggers cancel or pause queued work.",
    { sequence_id: idSchema },
    false,
    false,
    async (db, a) =>
      (
        await db.query(
          `update public.sequences set status='paused' where id=$1 returning *`,
          [a.sequence_id],
        )
      ).rows[0] || null,
  );
  tool(
    server,
    who,
    "daily_scorecard",
    "Report daily call and booking counts for a UTC date range, up to 366 days.",
    { from: z.string().date(), to: z.string().date() },
    true,
    false,
    async (db, a) => {
      if (
        a.to < a.from ||
        Date.parse(a.to) - Date.parse(a.from) > 366 * 86400000
      )
        throw new Error("Choose a date range up to 366 days");
      return (
        await db.query(
          `select d.day::date,
    count(distinct a.id) filter(where a.reason='call_logged')::int dials,
    count(distinct a.id) filter(where a.reason='call_logged' and o.connected)::int connects,
    count(distinct a.id) filter(where a.reason='call_logged' and o.conversation)::int conversations,
    count(distinct a.id) filter(where a.reason='call_logged' and a.details->'result'->>'disposition'='meeting_booked')::int audits_booked,
    count(distinct a.id) filter(where o.meeting_held_at is not null)::int audits_held,
    null::integer sprints_closed
    from generate_series($1::date,$2::date,interval '1 day') d(day)
    left join public.outreach_audit a on a.created_at::date=d.day::date
    left join public.outreach_call_outcomes o on o.call_id=a.id
    group by d.day order by d.day`,
          [a.from, a.to],
        )
      ).rows;
    },
  );
  if (process.env.ENRICHMENT_ENABLED === "true") {
  tool(server, who, "enrich_lead",
    "Run Google Places research, OpenRouter web research, or both for one CRM lead. Google results are returned for immediate use; only its place ID is saved under standard Places terms. AI research is saved.",
    { lead_id: idSchema, mode: z.enum(["google", "ai", "both"]), grid: z.union([z.literal(3), z.literal(5)]).default(5) },
    false, false, async (_db, a) => enrichLead(a.lead_id, a.mode, a.grid), 180);
  tool(server, who, "bulk_enrich",
    "Queue enrichment for a segment, a tag or tag intersection, or lead IDs. Returns a resumable job ID and conservative cost estimate.",
    { segment_id: idSchema.optional(), tag: z.string().optional(), tags: z.array(z.string()).optional(),
      lead_ids: z.array(idSchema).min(1).max(5000).optional(), mode: z.enum(["google", "ai", "both"]),
      grid: z.union([z.literal(3), z.literal(5)]).default(3), max_cost_usd: z.number().positive().optional() },
    false, false, async (_db, a) => bulkEnrich(a, a.mode, a.grid, a.max_cost_usd ?? null, who.userId));
  tool(server, who, "enrichment_job_status",
    "Show a queued enrichment job's progress, cost, failures and lead tag counts.",
    { job_id: idSchema }, true, false, async (_db, a) => jobStatus(a.job_id));
  tool(server, who, "ask_about_lead",
    "Ask OpenRouter a sourced question about a lead using public web search. This may incur search API cost.",
    { lead_id: idSchema, question: z.string().min(1).max(2000) },
    false, false, async (_db, a) => askAboutLead(a.lead_id, a.question), 180);
  tool(server, who, "enrichment_cost_preview",
    "Estimate the lead count and maximum budget reservation before a bulk enrichment job.",
    { segment_id: idSchema.optional(), tag: z.string().optional(), tags: z.array(z.string()).optional(),
      lead_ids: z.array(idSchema).min(1).max(5000).optional(), mode: z.enum(["google", "ai", "both"]),
      grid: z.union([z.literal(3), z.literal(5)]).default(3) },
    true, false, async (_db, a) => previewBulk(a, a.mode, a.grid));
  }
  return server;
}
