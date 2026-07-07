import {
  assertRequiredTables,
  createPool,
  defaultEmailTemplates,
  defaultPipelineStages,
  expectedTables,
  getTableNames,
} from "./db-common.js";

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

async function countRows(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, table: string) {
  const result = await client.query(`select count(*)::int as count from ${table}`);
  return Number(result.rows[0]?.count ?? 0);
}

async function main() {
  const pool = createPool();
  const client = await pool.connect();
  const checks: Check[] = [];

  try {
    const tables = await getTableNames(client);
    const missingTables = assertRequiredTables(tables);
    checks.push({
      name: "expected public tables",
      ok: missingTables.length === 0,
      detail: missingTables.length
        ? `missing: ${missingTables.join(", ")}`
        : `${expectedTables.length} tables present`,
    });

    if (tables.has("pipeline_stages")) {
      const result = await client.query<{ name: string }>("select name from pipeline_stages");
      const stageNames = new Set(result.rows.map((row) => row.name.toLowerCase()));
      const missingStages = defaultPipelineStages
        .map((stage) => stage.name)
        .filter((name) => !stageNames.has(name.toLowerCase()));
      checks.push({
        name: "default pipeline stages",
        ok: missingStages.length === 0,
        detail: missingStages.length ? `missing: ${missingStages.join(", ")}` : "all default stages present",
      });
    }

    if (tables.has("email_templates")) {
      const result = await client.query<{ name: string }>("select name from email_templates where is_default = true");
      const templateNames = new Set(result.rows.map((row) => row.name.toLowerCase()));
      const missingTemplates = defaultEmailTemplates
        .map((template) => template.name)
        .filter((name) => !templateNames.has(name.toLowerCase()));
      checks.push({
        name: "default email templates",
        ok: missingTemplates.length === 0,
        detail: missingTemplates.length ? `missing: ${missingTemplates.join(", ")}` : "default templates present",
      });
    }

    if (tables.has("onboarding_progress")) {
      const result = await client.query<{ count: number }>(
        "select count(*)::int as count from onboarding_progress where sub_account_id = 1",
      );
      checks.push({
        name: "default onboarding progress",
        ok: Number(result.rows[0]?.count ?? 0) > 0,
        detail: Number(result.rows[0]?.count ?? 0) > 0 ? "sub_account_id=1 present" : "missing sub_account_id=1",
      });
    }

    for (const table of ["leads", "campaigns", "forms", "sequences", "integrations", "api_keys"]) {
      if (tables.has(table)) {
        checks.push({
          name: `${table} accessible`,
          ok: true,
          detail: `${await countRows(client, table)} rows`,
        });
      }
    }

    for (const check of checks) {
      console.log(`${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.detail}`);
    }

    const failed = checks.filter((check) => !check.ok);
    if (failed.length) {
      console.error(`Database verification failed with ${failed.length} issue(s). Run migrations and seed, then verify again.`);
      process.exit(1);
    }

    console.log("Database verification passed.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
