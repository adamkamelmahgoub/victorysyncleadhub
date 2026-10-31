# QA report: phase 1 repair work

Date: 2026-10-31. Branch: `codex/client-portal-main-deploy`.

## Completed locally

- Created an isolated persistent PGlite database with three synthetic client accounts and 2,105 synthetic leads. `node scripts/setup-local-qa-db.mjs` is repeatable and does not read production customer records.
- `pnpm run test:phase1`: 16 passing tests for pipeline pagination above 1,000 leads, date restoration, unified tasks, social inbox access SQL, social matching for agency prospects without an organization ID, Unipile polling, and reconnect health.
- `pnpm run test`: 124 passing TypeScript tests across the API, portal, CRM, social, landing page, report, and migration helpers, including the account-scoped Launchpad SQL test.
- `pnpm run typecheck:api`, API-server and leadgen typechecks: pass.
- `pnpm run build`: pass. Vite prints pre-existing sourcemap and chunk warnings.
- A pull-request workflow now runs the TypeScript tests, API typecheck, and build. The client Launchpad checklist is implemented locally, with access tests; its database migration and browser flow remain unverified.

## Not yet verified

- PGlite does not provide Supabase Auth, RLS, Storage, Realtime, Vault, pg_cron, or Edge Functions. It cannot replace a disposable Supabase branch for cross-tenant and worker tests.
- Browser journey, screenshots, accessibility audit, Lighthouse score, and visual comparison are pending a runnable isolated full stack.
- The five new SQL migrations have not been applied to production. The date restoration migration needs a database backup and dry run on a copy first.
- No real MightyCall, Stripe, Slack, email, or Unipile send was attempted. Connected account cleanup and migrations have not been deployed.

## Gate before production

1. Run migrations on a disposable full Supabase database populated with synthetic accounts and verify RLS as separate client and agency users.
2. Exercise the API and browser journeys with fake providers; capture screenshots at mobile and desktop widths.
3. Back up production, dry run the lead date restoration against a copy, inspect changed-row counts, then apply migrations in order.
4. Deploy and verify health checks, recent social inbox polling, history backfill, and connected account status without sending real messages.

Current status: phase 1 changes are locally tested and reviewable, not production ready.
