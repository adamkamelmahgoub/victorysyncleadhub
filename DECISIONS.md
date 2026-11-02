# Engineering decisions

## 2026-10-30: Preserve the existing app architecture during the finish pass

The request describes Next.js App Router, but the repository runs a Vite/React client, Vercel API functions, and an API server. A framework migration would put existing CRM routes and three client accounts at risk. Finish and test the current architecture first, then consider a separate migration proposal. This records the conflict; it does not waive the functional requirements.

## 2026-10-30: Use `marketing_landing_pages` for writable pages

`20261026_04_marketing_consolidation.sql` identifies `marketing_landing_pages` as the writable editor and renderer model. `landing_pages` remains a legacy archive for existing references. New package template pages are created in `marketing_landing_pages`.

## 2026-10-30: No production data in QA

The audit reads only catalog metadata from production. Local Supabase and Docker commands are unavailable on this machine, so data-changing tests, seed data, provider sends, and browser end-to-end tests must wait for a disposable local database or Supabase branch. Existing production accounts and social connections are not test fixtures.

## 2026-10-30: Audit first

The attached request requires an audit commit before fixes. `FEATURE_MATRIX.md`, `AUDIT_INVENTORY.md`, and `qa/audit/schema-metadata.json` form the baseline. A feature marked partial may have working code but lacks the required passing end-to-end test and screenshot.

## 2026-10-31: Docker-free local database for focused tests

The PostgreSQL Windows installer download returned HTTP 403. `scripts/setup-local-qa-db.mjs` now creates a persistent PGlite database under ignored `.local/victorysync-qa` with synthetic accounts, contacts and more than 1,000 leads in one stage. It supports focused SQL and API-adapter tests, but it is not a full Supabase stack: Auth, Storage, Realtime, and Edge Functions still require a disposable Supabase branch or local container runtime before end-to-end sign-off.

## 2026-10-31: Unified tasks use a security-invoker view

`company_tasks` and `contact_tasks` already have production writers and client-scoped RLS. Dropping either table would risk existing automations. The migration retains both write tables and adds `unified_tasks` as the shared read model, with source-aware updates. Exact duplicate contact tasks with the same lead, title and due time appear once. The original rows remain for rollback and compatibility. A contact task links to a company only when the company name resolves uniquely.
