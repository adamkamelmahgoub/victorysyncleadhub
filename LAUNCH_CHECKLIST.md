# Production launch checklist

This checklist is a release gate, not a record of completed checks. Record evidence in `QA_REPORT.md` before marking an item complete. The current draft PRs are not merged into main.

| Area | Required verification | Status |
| --- | --- | --- |
| Database | Back up production, restore to a disposable copy, apply every new migration twice, review changed-row counts and rollback notes. | Pending |
| Tenancy | Test RLS and every client API route as two client owners, client staff, assigned agency staff, agency admin, and anonymous. | Pending |
| Existing clients | Verify the three existing sub-accounts, their users, pages, tasks and call data after the migrations. | Pending |
| Browser | Run desktop and mobile Playwright journeys with synthetic accounts; capture screenshots for every parity screen and check console errors. | Pending |
| Accessibility | Run axe on the main pages; resolve serious and critical findings. | Pending |
| Performance | Run Lighthouse mobile on the public default landing page and main app routes; meet the specified scores. | Pending |
| Provider sandbox | Mock or sandbox Stripe, MightyCall, Resend, Slack, Unipile and OpenRouter; verify webhook signatures, retry, STOP and idempotence. | Pending |
| Browser secrets | Run `pnpm run build` followed by `pnpm run test:bundle-secrets`. | Passing locally |
| Vercel variables | Set production-only Supabase, Stripe, MightyCall API and User keys, webhook secrets, Resend sender, Slack, portal cookie and OpenRouter settings. Verify values without printing them. | Pending. Delivery sandbox added; Stripe, MightyCall, Resend, Slack and portal/public base URLs absent in the 2026-11-02 inventory. |
| MightyCall | Confirm Classic or Call Center product. Set `MIGHTYCALL_PRODUCT` accordingly, configure API User key separately from webhook secret, and test one controlled call and SMS. | Pending |
| Domains | Verify `app.victorysync.com`, `portal.victorysync.com`, public page domains, DNS and TLS. | Pending |
| Cron and workers | Confirm Vault secrets, pg_cron schedules, worker authentication, execution logs and retry behavior. | Pending |
| Monitoring | Configure error reporting and uptime checks; confirm alerts reach the account manager. | Pending |
| Recovery | Confirm backup retention, point-in-time recovery and a tested restore procedure. | Pending |
| Release | Merge reviewed PRs in order, deploy main, verify Vercel Ready and run production smoke tests using controlled accounts. | Pending |

Preview and local outbound sends are blocked by the delivery gate. Set `CLIENT_DELIVERY_SANDBOX=1` in production to keep client delivery disabled during a staged rollout. Clear it only after controlled provider verification.
