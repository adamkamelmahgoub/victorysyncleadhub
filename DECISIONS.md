# Engineering decisions

## 2026-10-30: Preserve the existing app architecture during the finish pass

The request describes Next.js App Router, but the repository runs a Vite/React client, Vercel API functions, and an API server. A framework migration would put existing CRM routes and three client accounts at risk. Finish and test the current architecture first, then consider a separate migration proposal. This records the conflict; it does not waive the functional requirements.

## 2026-10-30: Use `marketing_landing_pages` for writable pages

`20261026_04_marketing_consolidation.sql` identifies `marketing_landing_pages` as the writable editor and renderer model. `landing_pages` remains a legacy archive for existing references. New package template pages are created in `marketing_landing_pages`.

## 2026-10-30: No production data in QA

The audit reads only catalog metadata from production. Local Supabase and Docker commands are unavailable on this machine, so data-changing tests, seed data, provider sends, and browser end-to-end tests must wait for a disposable local database or Supabase branch. Existing production accounts and social connections are not test fixtures.

## 2026-10-30: Audit first

The attached request requires an audit commit before fixes. `FEATURE_MATRIX.md`, `AUDIT_INVENTORY.md`, and `qa/audit/schema-metadata.json` form the baseline. A feature marked partial may have working code but lacks the required passing end-to-end test and screenshot.
