# QA report: phase 1 repair work

Date: 2026-10-31. Branch: `codex/client-portal-main-deploy`.

## Completed locally

- Created an isolated persistent PGlite database with three synthetic client accounts and 2,105 synthetic leads. `node scripts/setup-local-qa-db.mjs` is repeatable and does not read production customer records.
- `pnpm run test:phase1`: 16 passing tests for pipeline pagination above 1,000 leads, date restoration, unified tasks, social inbox access SQL, social matching for agency prospects without an organization ID, Unipile polling, and reconnect health.
- `pnpm run test`: 143 passing TypeScript tests across the API, portal, CRM, social, landing page, report, and migration helpers. The report tests cover previous full calendar periods, more than 1,000 leads, month boundaries, and service-role-only aggregate access. MightyCall tests cover call-detail retry, mocked first call, atomic 24-hour claim, normalized lead linking and opt-out. Review delivery tests cover mocked SMS, email, opt-out, changed phone, click suppression and reminder behavior.
- `pnpm run typecheck:api`, API-server and leadgen typechecks: pass.
- `pnpm run build`: pass. Vite prints pre-existing sourcemap and chunk warnings.
- A pull-request workflow now runs the TypeScript tests, API typecheck, and build. The client Launchpad checklist is implemented locally, with access tests; its database migration and browser flow remain unverified.
- MightyCall Classic and Call Center URL mappings pass a focused test. Live account product type and SMS delivery remain unverified.
- Delivery workers and selected outbound providers are gated to Vercel production and can be disabled with `CLIENT_DELIVERY_SANDBOX=1`. No real SMS, email, Slack alert, or social reply was sent in QA.
- `pnpm run test:bundle-secrets`: scanned 148 generated browser assets for server-only environment variable names and any configured secret values; none were found. This is now a pull-request CI gate after build.
- `pnpm run test:browser`: 20 desktop and mobile Chromium checks passed against a synthetic client session. Dashboard, leads, calls, pages, forms, reviews, reports and billing had no horizontal overflow or serious WCAG 2/2.1 axe findings. Review request success and consent-error UI were exercised with mocked API responses. Screenshots are saved as CI artifacts. This does not exercise live Supabase or provider APIs.
- AI page validation now checks title, SEO copy, buttons, proof section types, years, prices, credentials and image URLs against client media. Focused policy tests pass; live model samples remain pending.
- The legacy Client accounts create action now calls canonical client provisioning and template application. A mocked API test confirms the invite URL and template call; browser acceptance is pending.

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
