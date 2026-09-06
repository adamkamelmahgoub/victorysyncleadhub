# Victory Sync company CRM

The company CRM extends the existing application. Open **Company Pipeline** in the sidebar or `/companies`; use `/companies/:id` for company details and activity, `/trial-queue` for trial commitments, and `/company-kpis` for daily performance. Equivalent `/leadgen/...` routes also work.

## Repository findings

- Frontend: React 19, Vite 7, Wouter, TanStack Query, Tailwind 4 and existing Radix UI components.
- Authentication: Supabase Auth and the existing role/page-permission metadata. There is no Clerk integration in this repository.
- Vercel runs `api/[...path].ts`, which accesses Supabase through PostgREST. The optional Express server uses Drizzle for older features. The new CRM shares a single handler across both backends and forwards the authenticated user's JWT to Supabase.
- Existing `leads` and `prospects` are people, not company entities. Leads require first name, last name and email. Existing `activities` are generic contact events; existing pipelines are customizable contact/deal pipelines.
- The checked-in Supabase migrations use UUID IDs while older Drizzle definitions use numeric IDs. This change does not convert those IDs or remap existing records. The user approved adding separate company/activity tables to resolve this conflict.
- No production database credentials were available during implementation. Repository schema and a disposable PostgreSQL instance were inspected/tested; the live schema was not queried or changed.

## Added schema and behavior

`companies` stores the requested company information, free-text industry, verification flag, nine fixed stages, trial type, start/end dates and capacity slot. `company_activities` stores one call or handled inbound lead per row, direction, outcome, response minutes, notes, `occurred_at` and `logged_by`.

All nine stages are available: `new`, `contacted`, `engaged`, `qualified`, `trial_booked`, `trial_active`, `trial_completed`, `client`, `disqualified`. Existing customizable contact pipelines remain under **Deals / Pipeline**. Existing company strings in contact records are not automatically deduplicated or copied into companies.

The new tables use UUID keys independent of the older ID mismatch. Existing tables and data are untouched. There are no CRM delete endpoints. Activity attribution is set from the signed-in user and checked by RLS; callers cannot impersonate another logger. Read-only viewers can view but cannot write. Existing `pipeline` page permissions cover the new pages. Accounts scoped to a client account cannot access this internal prospect book.

## Explicit assumptions

- Trials last three Monday–Friday days, counting the start day. Holidays are included; there is no regional holiday calendar. Trial dates are date-only, so timezone conversion cannot shift a trial window.
- There is one inbound slot, `solo-inbound`. Inbound windows in `trial_booked` or `trial_active` cannot overlap, including shared end/start dates. A PostgreSQL exclusion constraint handles concurrent bookings and applies to later stage/date/type edits. Outbound trials use the separate `outbound` slot without a capacity limit.
- Dates on earlier stages are tentative. Capacity is reserved only in booked/active stages. Trial stages change manually; elapsed windows are flagged for review in the queue. Completing or disqualifying a trial releases capacity.
- `trial_completed` means awaiting a close decision until manually moved onward. Logging an outcome does not silently change the company's stage. There is no automatic client-account provisioning.
- An unknown inbound response time is null and excluded from averages; an immediate response is zero and included. Decimal minutes are supported. Response time is invalid on outbound activity. Every activity row counts as one dial or handled inbound lead.
- KPI date filters use the browser's timezone, displayed above the report. Active/completed trial counts reflect current stages, regardless of the activity date filter. PostgreSQL aggregates the entire report window; activity-log pagination does not truncate totals.
- Branding uses the repository favicon's `#FF3C00` orange-red, navy surfaces, white cards, a darker accessible action color and a new simple V monogram. No official brand guide or logo asset beyond the plain favicon was supplied.

## Deploy

1. Review and apply **only** `supabase/migrations/20260905_company_trials.sql` to the intended Supabase project, using the normal migration workflow or SQL Editor. It is transactional and creates new tables/functions/policies. Do not rerun historical cleanup migrations or use `db:push` to reconcile the existing UUID/numeric schema mismatch. Apply this migration once; if a `companies` or `company_activities` table already exists in the live project, stop and review that conflict instead of replacing it.
2. Deploy the frontend and API from the same commit. Keep the existing `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` settings. The company endpoints deliberately use the user's token, even if a server service-role key is configured.
3. Sign in with an internal account that has pipeline access. Create a company, set its trial type/start date/stage and save. Confirm the queue reflects it, log an inbound activity, and check Daily Performance.

No live migration, merge or production deployment was performed as part of the source changes.

## Validation

- `pnpm test:crm`: date boundaries, free-text inputs, response validation/zero handling, authenticated attribution, API paging/permissions/overlap errors, and the actual migration executed against disposable PGlite PostgreSQL. SQL checks include preservation of existing contact data, inclusive overlap, alternate-slot bypass, stage changes, weekend rejection, capacity release, RLS and timezone-aware KPI totals.
- `pnpm typecheck` and `pnpm typecheck:api`: frontend, libraries, Express and Vercel types. The Vercel tsconfig now uses the same bundler resolution as the workspace it imports.
- Frontend and Express production builds.
- Chromium smoke check with mocked auth/API: create/search company, all nine columns, blocked overlapping date, trial save/end calculation, zero-minute inbound log, queue checker, KPIs and mobile navigation. This is not a claim of a live Supabase end-to-end test.

On Windows without `sh`, the repository's existing preinstall script fails. A cached `pnpm install --frozen-lockfile --ignore-scripts --offline` completed locally; no production install behavior was changed. Build output retains existing UI sourcemap and large-bundle warnings.
