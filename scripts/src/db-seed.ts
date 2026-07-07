import { createPool, defaultEmailTemplates, defaultPipelineStages, getTableNames } from "./db-common.js";

async function main() {
  const pool = createPool();
  const client = await pool.connect();

  try {
    const tables = await getTableNames(client);

    if (tables.has("pipeline_stages")) {
      for (const stage of defaultPipelineStages) {
        await client.query(
          `
          insert into pipeline_stages (name, color, position)
          select $1, $2, $3
          where not exists (
            select 1 from pipeline_stages where lower(name) = lower($1)
          )
          `,
          [stage.name, stage.color, stage.position],
        );
      }
    }

    if (tables.has("email_templates")) {
      for (const template of defaultEmailTemplates) {
        await client.query(
          `
          insert into email_templates (name, subject, body, preview_text, category, tags, is_default)
          select $1, $2, $3, $4, $5, '[]'::jsonb, true
          where not exists (
            select 1 from email_templates where lower(name) = lower($1)
          )
          `,
          [
            template.name,
            template.subject,
            template.body,
            template.previewText,
            template.category,
          ],
        );
      }
    }

    if (tables.has("onboarding_progress")) {
      await client.query(
        `
        insert into onboarding_progress (sub_account_id, completed_steps, current_step, is_completed, metadata)
        select 1, array[]::text[], 'connect_integrations', false, '{}'::jsonb
        where not exists (
          select 1 from onboarding_progress where sub_account_id = 1
        )
        `,
      );
    }

    console.log("Database seed complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
