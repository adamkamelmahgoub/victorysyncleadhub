# Outreach Phase 1

The operator screen is `/call-queue` (also `/leadgen/call-queue`). It shows due callbacks and retries, then never-attempted leads. PostgreSQL selects only unsuppressed leads whose local time is 07:00 inclusive through 18:00 exclusive. Calls are allowed on weekends; weekday restrictions in the specification apply to email.

## Existing code and implementation

The UI is React/Vite. There are two backends: Express/Drizzle and the Vercel catch-all using Supabase REST. Drizzle models integer IDs; Supabase migrations preserve UUID IDs. Phase 1 uses database functions shared by both backends, accepts IDs as text at the RPC boundary, and never converts existing primary keys.

Extended `leads`; reused `activities` for the timeline and `contact_attempts` as a synchronized compatibility field. Added `outreach_suppressions`, `outreach_audit`, and a private migration snapshot. Existing sequence enrollments, campaign queues, and email logs reject suppressed/terminal leads and stop their outstanding work. The old configurable disposition catalog remains stored for rollback, but the API returns only the fixed enum.

## Rollout

1. Back up the database. Apply `supabase/migrations/20260911_outreach_phase1.sql` after the existing schema migrations, using the database owner in Supabase SQL Editor or a migration runner. This migration is transactional and must run once. It briefly locks lead writes while backfilling.
2. Deploy the API and UI together. Use SQL migrations, **not `db:push`**: Drizzle does not model the database functions, triggers, generated identity columns, or all production UUID tables.
3. The Vercel API needs the existing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. Queue/call RPCs deny anonymous and authenticated direct execution. Express needs its existing `DATABASE_URL` and authentication configuration; its database role must have the corresponding table/function privileges. No DNS, email credentials, or provider keys are needed for Phase 1.
4. Open Call Queue and use the timezone review to resolve unrecognized/ambiguous locations. Supported state values are postal abbreviations or full names in `customFields.state`; `customFields.timezone` accepts an explicit supported IANA name. CSV mapping now includes State, City, and IANA Timezone. Unresolved leads use `Etc/UTC` as a storage placeholder with `timezone_confirmed=false` and cannot enter the call queue.
5. Review `outreach_audit` rows with reason `phase1_backfill`. Unknown legacy dispositions and attempted records without a known disposition are held with `manual_exclude`; their original values remain in `outreach_legacy_leads`. This deliberately avoids re-contacting legacy exclusions.

The previous email-send endpoint returns 409 during Phase 1. It previously sent directly without the specified checks (or merely queued a log on Vercel). Live sending remains dark until Phase 2 is implemented and signed off. No email worker or mailbox credential changes are included in Phase 1.

## State decisions

- Fresh leads have a null disposition and a required initial next action, defaulting to import time. No fictitious `no_answer` is assigned before dialing.
- Nonterminal call outcomes require a future next action. Retry buttons default to 24 hours later; callbacks and meetings require an explicit time. The input labels the operator browser timezone and sends an ISO timestamp with an offset/UTC conversion. Queue eligibility uses the lead's timezone independently.
- `meeting_booked` still requires a follow-up timestamp, stops outstanding email work, and leaves the prospecting call queue.
- Six or more attempts spanning at least 240 hours automatically close unanswered/voicemail/gatekeeper outcomes. A meaningful callback or meeting outcome takes precedence. Closing records `not_interested`, clears the next action, records a revisit 2160 hours later, and writes a system audit row. Revisit is for later operator review; it does not reactivate outreach automatically.
- Historical import counts are retained. A historical count requires a fixed disposition; without a supplied first-attempt timestamp the import timestamp is used conservatively. New dial counts can only change through atomic call logging.
- Suppression is shared and permanent, including after deletion/reimport. Identity matching is case-insensitive/trimmed email and normalized US phone (including common extension suffixes). Phone-only and email-only matches both block outreach. Suppression writes and lead writes share a transaction lock to avoid import/suppression races.
- Calls use a UUID request ID for idempotency, so retrying a lost HTTP response does not increment attempts twice. Outcome, next action, attempts, activity, and audit commit together.

## API

- `GET /api/outreach/queue?timezone=America/New_York`: raw database lead fields in `due` and `fresh`, plus `needsTimezone` and `asOf`. Each section returns at most 100, with deterministic ordering.
- `GET /api/outreach/needs-timezone`: up to 100 records awaiting timezone correction.
- `POST /api/leads/:id/calls`: `{ disposition, nextActionAt, notes?, requestId }`. Returns the updated lead. Terminal outcomes accept a null next action.
- `PATCH /api/leads/:id/outreach`: timezone, discovery fields, or permanent `suppressedReason`. Does not permit clearing suppression or manually changing attempt history.
- Existing generic call activity creation and direct disposition/count edits are rejected by database triggers. Lead detail links to Call Queue instead.

## Verification

Tests use an isolated PostgreSQL engine (PGlite), not a production connection. They apply and roll back the actual migration against both integer and UUID lead schemas. Run with Node 22.17 or later:

```powershell
npm --prefix scripts/outreach-tests install --ignore-scripts
npm --prefix scripts/outreach-tests test
corepack pnpm run typecheck:libs
corepack pnpm -r --filter './artifacts/**' --filter './scripts' --if-present run typecheck
corepack pnpm --filter @workspace/leadgen build
corepack pnpm --filter @workspace/api-server build
```

Tests cover normalization and reimport suppression, direct-write bypass rejection, terminal and next-action constraints, duplicate-call idempotency, atomic failure, attempt policy and system audit, stopping existing email work, queue order/scope, role restrictions, US/Cairo DST boundaries, model validation, and rollback. These tests do not claim a real SMTP/reply race test; that belongs to Phase 3. PGlite serializes connections, so a real multi-connection PostgreSQL concurrency check is still appropriate before production rollout.

## Rollback

Stop outreach and deploy the previous application version. Export suppression and audit records before applying `supabase/rollbacks/20260911_outreach_phase1.sql`. It reverses the schema and restores pre-migration disposition/count values. It removes the new protection/history tables and does not restart stopped emails. Reconcile exported suppressions before any later outreach rollout; never resume email automatically as a rollback side effect.

## Deferred specification decisions

Phase 2/3 still need an email provider, verification provider, mailbox reset timezone/global cap policy, warming-mailbox enrollment policy, shared-provider-domain reply matching policy, and agreement that strictly plain text makes open pixels/open-rate measurement unavailable. Email enrollment needs a paused state for out-of-office replies. Phase 4 needs definitions for connects, conversations, meetings held, and positive replies. No later-phase engine or reporting has been built.
