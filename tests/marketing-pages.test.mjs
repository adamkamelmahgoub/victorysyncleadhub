import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

test("published page renderer escapes content and unsafe links", async () => {
  const source = await readFile(new URL("../lib/marketing-pages.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { renderLandingPage } = await import(`data:text/javascript,${encodeURIComponent(js)}`);
  const html = renderLandingPage({ id: "page-id", title: "<Page>", sections: [{ id: "a", type: "hero", heading: "<script>alert(1)</script>", buttonText: "Visit", buttonUrl: "javascript:alert(1)" }, { id: "b", type: "form", formId: "form-id" }] }, "https://example.com");
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(!html.includes("javascript:alert"));
  assert.ok(html.includes("/api/public/forms/form-id?page=page-id"));
});

test("marketing migration creates pages, events and submission attribution", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table public.form_submissions(id uuid, form_id uuid, created_at timestamptz);");
    await db.exec("create table public.landing_pages(id uuid); create table public.landing_page_events(id uuid, event_type text);");
    const migration = await readFile(new URL("../supabase/migrations/20261023_marketing_pages.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const tables = await db.query("select tablename from pg_tables where schemaname = 'public'");
    assert.ok(tables.rows.some((row) => row.tablename === "marketing_landing_pages"));
    assert.ok(tables.rows.some((row) => row.tablename === "marketing_landing_page_events"));
    const columns = await db.query("select column_name from information_schema.columns where table_name = 'form_submissions'");
    assert.ok(columns.rows.some((row) => row.column_name === "marketing_page_id"));
  } finally {
    await db.close();
  }
});
