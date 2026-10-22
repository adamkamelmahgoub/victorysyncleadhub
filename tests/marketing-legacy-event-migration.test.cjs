const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('marketing migration upgrades an existing page events table', async () => {
  const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261105_marketing_forms_landing_pages.sql'), 'utf8');
  const start = migration.indexOf('create table if not exists public.landing_page_events (');
  const endMarker = 'alter table public.landing_page_events enable row level security;';
  const end = migration.indexOf(endMarker, start) + endMarker.length;
  assert.ok(start >= 0 && end > start);
  const eventMigration = migration.slice(start, end);
  const db = new PGlite();
  try {
    await db.exec('create table public.organizations(id uuid primary key); create table public.landing_pages(id uuid primary key); create table public.landing_page_events(id uuid primary key, page_id uuid);');
    await db.exec(eventMigration);
    await db.exec(eventMigration);
    const columns = await db.query("select column_name from information_schema.columns where table_name='landing_page_events'");
    for (const name of ['page_id', 'organization_id', 'landing_page_id', 'event_type', 'created_at']) {
      assert.ok(columns.rows.some((row) => row.column_name === name), `${name} missing`);
    }
  } finally {
    await db.close();
  }
});
