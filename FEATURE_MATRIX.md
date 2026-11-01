# Feature matrix, Phase 0 baseline

Status reflects the code and existing tests as of 2026-10-30. `done` requires a passing test and a desktop and mobile screenshot; no feature is marked done until visual QA is captured. This is an audit baseline, not a release claim. The complete page, route, schema, policy, worker, cron, and environment inventory is in [AUDIT_INVENTORY.md](AUDIT_INVENTORY.md).

| Feature | Route or file | Status | Evidence | Notes |
| --- | --- | --- | --- | --- |
| Client sub-accounts | `api/portal.ts`, `sub_accounts` | partial | `client-create-db.test.mjs`, `legacy-client-create.test.ts` | Both UI entry points use canonical provisioning; full browser and production-copy QA pending. |
| Client tenancy and RLS | `20261026_01_client_tenancy_foundation.sql` | partial | `client-tenancy-db.test.mjs` | Existing RLS test passes; all 270 tables need exhaustive review. |
| Agency account switcher | `account-switcher.tsx` | partial | source review | Search and mobile behavior need QA. |
| Agency staff assignments | `sub_account_assignments` | partial | `client-tenancy-db.test.mjs` | Assigned-account restrictions need per-route test. |
| Roles and page permissions | `permissions.ts`, portal middleware | partial | `client-portal-permissions.test.ts` | Page and API parity needs verification. |
| Client invite and acceptance | `api/portal.ts`, `client-invite.ts` | partial | `client-invite.test.ts` | Provider email and browser acceptance unverified. |
| Agency two-step verification | portal auth | partial | `client-portal-mfa.test.ts` | Legacy role exception needs security review. |
| Read-only impersonation and audit | `api/portal.ts`, `portal_activity_log` | partial | source review | Browser flow and every write path need verification. |
| Agency account overview | `client-portal.tsx`, `portal_agency_overview` | partial | `account-templates-ops.test.mjs` | UI screenshot and health formula validation pending. |
| Package snapshots | `account_templates`, `portal_apply_account_template` | partial | `account-templates-ops.test.mjs` | Ten templates and idempotence tested; visual QA pending. |
| Onboarding checklist | `company_tasks`, template payload | partial | template DB test | Needs unified task model. |
| Client dashboard | `client-portal.tsx`, `portal_dashboard_metrics` | partial | `client-portal-layout.spec.ts` desktop/mobile screenshots | Synthetic browser layout, overflow and axe checks pass; live date filters still need QA. |
| Client leads list and board | `client-portal.tsx` | partial | `client-portal-layout.spec.ts` desktop/mobile screenshots | Basic lead page renders; board over 1,000 records unverified. |
| Client lead timeline | `portal_lead_timeline` | partial | source review | Calls, texts, email and notes need browser QA. |
| Client calls and recordings | `client_call_details`, `client-portal.tsx` | partial | `client-call-routing.test.ts`, browser screenshots | Failed saves retry and basic call page renders; live MightyCall event path unverified. |
| Client pages and forms | `marketing_landing_pages`, `forms` | partial | `marketing-forms-pages.test.ts`, browser screenshots | Basic lists render; template draft and public publish need browser QA. |
| Client reviews and requests | `client-portal.tsx`, `review_requests` | partial | `review-stats.test.ts`, browser screenshots and interaction mocks | Scheduling and consent-error UI pass desktop/mobile; database timing and provider sends unverified. |
| Report archive and PDF | `report_sends`, report PDF code | partial | `client-report-pdf.test.ts`, `client-metrics-shared.test.ts`, browser screenshots | Dashboard and PDF share one aggregate; basic archive renders; delivery QA remains. |
| Client billing portal | `api/portal.ts`, Stripe | partial | `client-portal-layout.spec.ts` desktop/mobile screenshots | Basic page renders; needs sandbox Stripe webhook and customer portal test. |
| Client settings and branding | `client-portal.tsx` | partial | source review | Mobile layout and permissions need QA. |
| Client notifications | delivery worker | partial | `mightycall-endpoints.test.ts`, `external-send-mode.test.ts` | Product paths and preview send gate verified; external email and SMS not tested. |
| Form lead dedupe and UTM | form submit route | partial | `marketing-forms-pages.test.ts` | Account-scoped phone and email lookup now serializes concurrent submissions; full workflow trigger test needed. |
| Speed-to-lead sequence | delivery worker | partial | source review | Under-60-second sandbox test needed. |
| Missed-call text-back | delivery worker | partial | `client-missed-call-delivery.test.ts`, `client-missed-call-claims.test.ts` | Mocked first call, account-scoped atomic 24-hour claim, normalized lead linking and opt-out pass; live timing and provider delivery need QA. |
| Review request after Won | delivery worker | partial | `client-review-click.test.ts`, `client-review-delivery.test.ts` | Mocked SMS, email, reminder and consent recheck pass; database delay and provider sandbox QA remain. |
| STOP and DND | delivery worker | partial | `client-missed-call-delivery.test.ts`, `client-review-delivery.test.ts` | Missed-call and review sends halt on opt-out in mocked worker tests; all workflow types still need QA. |
| Call usage meter | `client_call_details`, agency overview | partial | source review | Package hour and 80% alert tests needed. |
| Ad spend | `ad_spend_entries`, portal | partial | source review | Manual UI and later API sync need QA. |
| Workflow list and editor | `automation.tsx` | partial | `native-workflows.test.ts` | Visual builder branches, goals and logs need audit. |
| Workflow execution logs and retry | `automation_runs`, portal | partial | `account-templates-ops.test.mjs` | Mock provider execution needed. |
| Scheduled weekly and monthly reports | report worker | partial | `client-report-period.test.ts`, `client-metrics-shared.test.ts` | Prior full calendar periods and aggregate parity tested; delivery still needs sandbox QA. |
| Landing page editor sections | `landing-page-editor.tsx` | partial | `landing-theme-editor.test.ts` | Browser add, hide, duplicate, undo and redo QA needed. |
| Page publish and versions | marketing pages API | partial | `marketing-pages.test.mjs` | Draft isolation and restore browser test needed. |
| Public page renderer | `api/client-landing.ts` | partial | `marketing-pages.test.mjs` | Lighthouse and custom domain QA needed. |
| Page analytics and A/B | marketing pages API | partial | source review | GTM, GA4, pixel and split tests needed. |
| AI page generation | OpenRouter page route | partial | `landing-ai-policy.test.ts` | Ten structured live samples and fixtures needed. |
| AI chat edits and audits | page editor AI | partial | source review | One-step undo and usage tests needed. |
| AI proof policy | `landing-ai-policy.ts` | partial | `landing-ai-policy.test.ts` | Years, prices, credentials, proof sections and unsupplied images are rejected; ten model fixtures and browser QA pending. |
| AI token budget | `ai_requests` | partial | source review | Budget enforcement test needed. |
| Pipeline board pagination | opportunities UI | partial | `pipeline-board-pagination.test.ts` | Older leads page by stage locally; browser and full database QA pending. |
| Original lead dates | `leads.custom_fields` | partial | `restore-original-lead-dates.test.ts` | Migration prepared; backup and copy dry run pending. |
| Unified tasks | `company_tasks`, `contact_tasks` | partial | `unified-tasks-view.test.ts` | Shared view and source-aware actions prepared; full database QA pending. |
| Social inbox refresh | `refresh_social_inbox` | partial | `social-access-sql.test.ts` | UUID/text cast tested locally; live route QA pending. |
| Unipile newest-first sync | social worker | partial | `social-unipile.test.ts` | Separate recent and history polling prepared; provider sandbox QA pending. |
| Social reconnect health | Settings and Slack | partial | `social-reconnect-health.test.ts` | Health query tested locally; live route and Slack QA pending. |
| Social contact matching | `social_profiles`, social inbox | partial | `social-inbox.ts` source review | Manual link exists; auto-match remains incomplete. |
| GHL-style agency shell | navigation components | partial | source review | Public reference and parity QA pending. |
| GHL-style client shell | portal layout | partial | `client-portal-layout.spec.ts` desktop/mobile screenshots | Eight synthetic portal pages fit both viewports with no serious axe findings; live data and interaction QA remain. |
| Launchpad | `/client-portal/launchpad` | partial | `client-portal-permissions.test.ts` | Account-scoped checklist added; migration, browser and RLS QA pending. |
| Unified conversations | `social-inbox.tsx` | partial | source review | SMS, email, calls in one thread unverified. |
| Calendar week/month | `calendar.tsx` | partial | source review | Appointment slide-over QA needed. |
| Contacts smart lists and bulk tools | contact pages | partial | existing unit tests | Browser and data tests needed. |
| Contact detail three-column layout | contact detail | partial | source review | Activity composer and panels need parity QA. |
| Opportunity kanban and list | pipeline pages | partial | source review | Counts, values, drag and filters need tests. |
| Payments | billing pages | partial | source review | Stripe sandbox and status flows needed. |
| Marketing planner and DM | marketing pages | partial | existing source | Agency/client placement and visual QA pending. |
| Reputation | reputation pages | partial | `reputation-db.test.mjs`, UI typecheck | Load failures now display a retry action; browser request and source refresh QA needed. |
| Reporting | reporting pages | partial | existing source | Unified report metrics QA needed. |
| Call Center | call pages | partial | existing source | Account-scoped usage and agent QA needed. |
| Settings secondary navigation | settings pages | partial | source review | GHL pattern and mobile QA pending. |
| Global search and quick add | app shell | partial | source review | Keyboard and account scoping need test. |
| Light and dark themes | app shell | partial | source review | Screenshots and contrast QA needed. |
| Seeded demo environment | scripts | missing | source review | No isolated full demo seed with >1,000 leads. |
| Vitest, Playwright, Lighthouse, axe CI | test tooling | partial | `.github/workflows/quality.yml`, `client-portal-layout.spec.ts` | Playwright and axe run on eight synthetic portal pages in CI; live browser, RLS and Lighthouse gates remain. |
| Production launch checks | Vercel and Supabase | partial | prior deployment check | Provider secrets and webhook test events pending. |

## Audit findings

- The repository is a Vite/React client with Vercel functions and an API server, not a Next.js App Router project. See `DECISIONS.md`.
- The live schema has 270 public tables and 505 policies. `client_package_templates` is the only public table with RLS disabled. It requires an explicit access review before client exposure.
- `marketing_landing_pages` is the current writable page model. `landing_pages` is retained as a legacy archive.
- The local machine has no `supabase`, `docker`, `pg_dump`, or `psql` command on PATH. No production data was used for testing in this audit. A disposable database or Supabase branch is needed before data migrations and browser end-to-end tests.
