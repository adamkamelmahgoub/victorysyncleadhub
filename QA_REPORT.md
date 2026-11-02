# QA report: phase 1 repair work

Date: 2026-10-31. Branch: `codex/client-portal-main-deploy`.

## Completed locally

- Created an isolated persistent PGlite database with three synthetic client accounts and 2,105 synthetic leads. `node scripts/setup-local-qa-db.mjs` is repeatable and does not read production customer records. It now seeds linked forms, submissions, calls, review requests, draft reports, invoices, ad spend, workflows, runs, and appointments. Two successive runs passed count and account-link assertions.
- `pnpm run test:rls` applies the tenancy and account guard migrations twice against synthetic tables and exercises all 28 scoped tables as two client owners, client staff, assigned and unassigned agency staff, agency admin, and anonymous. It also checks cross-account updates and inserts. This does not replace testing the complete Supabase schema or every API route against a disposable database copy.
- `pnpm run test:phase1`: 16 passing tests for pipeline pagination above 1,000 leads, date restoration, unified tasks, social inbox access SQL, social matching for agency prospects without an organization ID, Unipile polling, and reconnect health.
- `pnpm run test`: 145 passing TypeScript tests across the API, portal, CRM, social, landing page, report, and migration helpers. The report tests cover previous full calendar periods, more than 1,000 leads, month boundaries, and service-role-only aggregate access. MightyCall tests cover call-detail retry, mocked first call, atomic 24-hour claim, normalized lead linking and opt-out. Form tests cover account-scoped dedupe lock keys and PostgreSQL execution. Review delivery tests cover mocked SMS, email, opt-out, changed phone, click suppression and reminder behavior.
- `pnpm run typecheck:api`, API-server and leadgen typechecks: pass.
- `pnpm run build`: pass. Vite prints pre-existing sourcemap and chunk warnings.
- A pull-request workflow now runs the TypeScript tests, API typecheck, and build. The client Launchpad checklist is implemented locally, with access tests; its database migration and browser flow remain unverified.
- MightyCall Classic and Call Center URL mappings pass a focused test. Live account product type and SMS delivery remain unverified.
- Delivery workers and selected outbound providers are gated to Vercel production and can be disabled with `CLIENT_DELIVERY_SANDBOX=1`. No real SMS, email, Slack alert, or social reply was sent in QA.
- `pnpm run test:bundle-secrets`: scanned 148 generated browser assets for server-only environment variable names and any configured secret values; none were found. This is now a pull-request CI gate after build.
- `pnpm run test:browser`: 38 desktop and mobile Chromium checks passed against synthetic sessions. Dashboard, leads, calls, pages, forms, reviews, reports, billing and Reputation had no horizontal overflow or serious WCAG 2/2.1 axe findings. The landing editor passed add, edit, hide, duplicate, reorder, remove, undo, redo, publish, restore, failed-save isolation and viewport checks. Reputation passed source refresh, real-review attestation, load retry and agency-view controls. Screenshots are saved as CI artifacts. This does not exercise live Supabase or provider APIs.
- AI page validation now checks title, SEO copy, buttons, proof section types, years, prices, credentials and image URLs against client media. Focused policy tests pass; live model samples remain pending.
- The legacy Client accounts create action now calls canonical client provisioning and template application. A mocked API test confirms the invite URL and template call; browser acceptance is pending.
- Stripe billing portal return URLs use the configured HTTPS portal origin. A route test confirms a forged Host header cannot redirect the customer. The checkout webhook verifies raw bytes, including a split UTF-8 character; mocked signed checkout provisioning and invite delivery pass. An unpaid completed checkout waits for a signed asynchronous payment success before provisioning. Live Stripe sandbox verification remains pending.
- The actual billing customer SQL function passes an isolated role test: client owner A receives only A's customer ID, cross-account access fails, client and agency staff are rejected, and agency admin can read B. This does not replace a full production-copy RLS audit.

## Not yet verified

- PGlite does not provide Supabase Auth, RLS, Storage, Realtime, Vault, pg_cron, or Edge Functions. It cannot replace a disposable Supabase branch for cross-tenant and worker tests.
- Browser journey, screenshots, accessibility audit, Lighthouse score, and visual comparison are pending a runnable isolated full stack.
- Live schema metadata shows the core tenancy columns and guards are present on all 28 named client tables, but the dated migration files are not recorded in `supabase_migrations.schema_migrations`. Several newer portal functions and `client_missed_call_text_windows` are absent. Reconcile migration history and dry run remaining migrations on a copy before applying them. The lead date restoration still needs a backup and copy dry run.
- No real MightyCall, Stripe, Slack, email, or Unipile send was attempted. Connected account cleanup and migrations have not been deployed.

## Gate before production

1. Run migrations on a disposable full Supabase database populated with synthetic accounts and verify RLS as separate client and agency users.
2. Exercise the API and browser journeys with fake providers; capture screenshots at mobile and desktop widths.
3. Back up production, dry run the lead date restoration against a copy, inspect changed-row counts, then apply migrations in order.
4. Deploy and verify health checks, recent social inbox polling, history backfill, and connected account status without sending real messages.

Current status: the stacked changes are locally tested and reviewable. Main and production do not yet contain the full stack.

## 2026-11-02 live metadata audit

- Read-only catalog checks found `client_account_id`, enabled RLS and a `client_tenancy_guard` policy on every one of the 28 named client tables. This verifies schema presence, not end-user access behavior.
- `portal_billing_customer`, `portal_create_client_manual`, `portal_apply_account_template`, `portal_dashboard_metrics` and `portal_agency_overview` are present. `portal_launchpad`, `portal_page_edit_allowed`, `portal_publish_page`, `portal_page_versions`, `portal_restore_page` and `client_claim_missed_call_text` are absent. The recent dated migration versions are not in the Supabase migration ledger.
- `client_package_templates` initially had RLS off and direct `SELECT`, `INSERT` and `UPDATE` privileges for anonymous and authenticated roles. A targeted live fix revoked direct privileges and enabled RLS. A follow-up catalog query verified anonymous and authenticated `SELECT` and authenticated `INSERT` are false, and RLS is true. The matching idempotent repository migration and local repeatability test are in `20261102_08_client_package_template_access.sql` and `client-package-template-access.test.ts`. No customer data was read or changed during this audit.
- Vercel production environment inventory contains `PORTAL_COOKIE_SECRET`, `CLIENT_DELIVERY_WORKER_SECRET`, OpenRouter and Supabase variables. It does not contain the required Stripe, MightyCall, Resend, Slack, `PORTAL_BASE_URL`, or `PUBLIC_PAGES_BASE_URL` variables. `CLIENT_DELIVERY_SANDBOX=1` was added for subsequent production deployments. Only variable names were inspected; secret values were not printed.

## 2026-11-02 mobile landing editor repair

- The narrow editor now switches between section controls and a full-width live page preview. The floating global assistant is hidden on this route because the editor includes its own AI assistant panel; it previously blocked the mobile Restore button in version history. Toasts appear at the bottom with safe-area spacing so they do not cover the account switcher or editor header.
- `pnpm exec playwright test tests/browser/landing-editor.spec.ts --workers=1 --reporter=line`: 19 passed, 1 desktop skip for a mobile-only test. The suite includes mobile preview switching, no horizontal overflow, page edit, publish, version restore, block controls and domain settings. An initial parallel run had timeouts; the single-worker rerun exposed the assistant overlap, which was repaired and rerun successfully.
- `pnpm run build` and `pnpm run test:bundle-secrets`: pass. The bundle scan covered 149 generated browser artifacts.
- Captured the tested desktop editor, mobile edit view and mobile page preview in `qa/screenshots/` for layout review.

## 2026-11-02 repeatable browser quality gates

- Added `test:e2e`, `test:a11y`, and `test:lh` scripts and corresponding pull-request CI steps. `test:a11y` ran 40 desktop and mobile portal/Reputation browser checks successfully. Those checks use synthetic sessions and mocked API responses.
- `test:lh` serves a representative home-service page generated by the production landing renderer. The local mobile Lighthouse run scored performance 100, accessibility 100, best practices 96, and SEO 100. CI now asserts performance and accessibility of at least 90 and uploads its report. This verifies the renderer fixture, not a live customer domain or the main CRM app.
- A disposable PostgreSQL 17.11 instance now runs locally on `127.0.0.1:55432`. `LOCAL_POSTGRES_URL=postgres://postgres@127.0.0.1:55432/victorysync_tenancy_qa pnpm exec tsx --test tests/client-tenancy-all-tables.test.ts` passed. The test applies the tenancy migrations twice to a synthetic schema and verifies reads and cross-account writes for 28 client tables under six roles. CI now repeats this on a PostgreSQL 17 service. This is stronger than the PGlite test, but it is not a full Supabase production-copy migration rehearsal.
- Draft PR #44's independent CI run passed the native Postgres RLS test, end-to-end browser suite, accessibility suite, Lighthouse assertions and Vercel preview.
- A separate fresh PostgreSQL 17 database with minimal local Supabase Auth and Storage shims applied 31 migration files through `20260932_sequence_archive.sql`. `20260921_native_worker_scheduler.sql` requires `pg_cron` and was skipped locally; `20261001_meeting_booked.sql` stopped at `pg_net`, which the Windows PostgreSQL archive does not provide. Full migration proof still requires a disposable Supabase environment with those extensions. The local run used no production rows.
- The agency MFA audit found a legacy API exception: an AAL1 token with `admin`, `owner`, or `member` in `crm_role` could call portal API routes after the database mapped it to an agency role. The exception was removed. A new migration requires AAL2 in `is_agency`, `is_agency_admin`, and the agency staff branch of `can_access_account`, and closes a direct staff branch in the legacy page-version policy. PGlite and native PostgreSQL checks verify 28 table reads, cross-account writes, page-version writes, and AI request reads at AAL1 and AAL2. Live Supabase MFA enrollment and production-copy migration QA remain pending.
- With that guard, `pnpm run test` passed 171 tests, `pnpm run test:rls` passed 5 tests, the dedicated native PostgreSQL tenancy test passed, and `pnpm run typecheck:api` passed. The tests also assert that a missing `aal` claim denies agency access.
- The frontend audit then found the same legacy-role exception in `App.tsx`: the MFA screen appeared only for `agency_admin` and `agency_staff` claims. A shared role helper now covers both those claims and legacy `owner`, `admin`, `member`, `viewer`, and `agent` claims in the UI and API. The role test and full workspace typecheck pass.
- A dedicated Playwright test confirmed the MFA gate on desktop and mobile for legacy `admin` and `member` plus new agency roles (8 checks). A focused rerun confirmed a malformed authenticator response displays a useful message rather than raw braces (4 checks). Screenshots of the initial desktop and mobile gate are in `qa/screenshots/`. Live Supabase enrollment and successful verification still need a controlled test.
- A mocked browser journey now completes Supabase TOTP enrollment, challenge, verification, and session refresh and reaches the portal after AAL2. It passed on desktop. A live Supabase Auth run is still pending.
- PR #45's first CI browser run failed because the landing editor and Reputation fixtures represented agency admins without an AAL2 JWT claim; the new MFA gate correctly blocked them. Those synthetic sessions now include AAL2. The focused desktop/mobile rerun passed 29 checks with one intentional skip. The separate MFA tests still use AAL1 to verify the gate.
