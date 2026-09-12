# Phase 2: email infrastructure

Phase 2 adds SMTP and Resend API transports, encrypted mailbox credentials, sending domains, verification, a guarded send queue, signed delivery events, unsubscribe suppression, mailbox health alerts, and the Outreach Mailboxes screen. The engine ships disabled globally and per mailbox. Sequence scheduling, inbound reply polling, out-of-office handling, and call-task interlock belong to Phase 3 and are not enabled here.

## Migration order

1. Back up the database and deploy with `OUTREACH_EMAIL_ENABLED=false`. Apply Phase 1 first.
2. Set `DATABASE_URL`, `OUTREACH_ENCRYPTION_KEY_ID`, and `OUTREACH_ENCRYPTION_KEYS` in the server environment. Generate a random 32-byte key, base64 encode it, and store it in the JSON key map, for example `{"v1":"<base64 key>"}`. Keep the key outside the database and source control.
3. Run `corepack pnpm --filter @workspace/scripts email:encrypt-credentials`. This locks the mailbox table and encrypts legacy SMTP passwords in a transaction. It prints a count only. Confirm the scripts package name in `scripts/package.json` if using another workspace layout.
4. Apply `supabase/migrations/20260912_outreach_phase2.sql`, then `supabase/migrations/20260912_outreach_phase2_admin.sql`. The first migration rejects existing plaintext credentials. Both support integer and UUID legacy record IDs.
5. Deploy the matching application code. Use these SQL migrations, not a Drizzle schema push: database functions, guards, views, and permissions are part of the implementation.

Existing mailboxes start paused and disabled. Existing addresses start unverified. Warmup starts at migration time for existing mailboxes; historic ramp credit is not inferred.

Rollback both Phase 2 migrations with `supabase/rollbacks/20260912_outreach_phase2.sql`, with workers disabled first. Rollback removes Phase 2 queue/event history and schema and restores legacy counters, but intentionally retains encrypted credentials. Keep the encryption keys and a database backup. A pre-Phase-2 application cannot use these encrypted passwords directly. Roll back before Phase 1 and before any future Phase 3 schema.

## Manual configuration

- Set the server-only variables in `.env.example`: encryption key map and active key ID, public HTTPS CRM origin, random worker token of at least 32 characters, ZeroBounce key, and the event secret for each transport used. Never use a `VITE_` prefix for these secrets.
- In Outreach Mailboxes, save every primary company domain before enabling sending. Primary domains and their subdomains are blocked; once flagged primary, a domain cannot be unflagged through the application.
- Add secondary sending domains and their DKIM selectors. Publish your provider's SPF, DKIM, and DMARC records, then use **Check DNS**. This checks published TXT records; complete the provider's own domain verification and alignment setup as well. The SPF check uses the sending domain apex. Provider-specific return-path SPF records may be required in addition.
- SMTP: supply a host, port 587 with STARTTLS or 465 with TLS, username and password/app password. Disable any upstream tracking or URL rewriting at the mail host. The application emits only plain text and does not add tracking. SMTP does not expose a standard API to inspect upstream rewriting settings.
- Resend: supply an API key and the Resend domain ID. The key must allow reading that domain as well as sending. Disable open and click tracking in Resend. Each dispatch first verifies that the provider domain matches the sender, is verified, and has both tracking flags off; failure blocks the send. See [Resend domain retrieval](https://resend.com/docs/api-reference/domains/get-domain) and [tracking configuration](https://resend.com/docs/dashboard/domains/tracking).
- Configure delivery, bounce, and complaint events below. Connect a mailbox, enable it individually, and resume its ramp if it was migrated paused. No manual date backdating or early promotion is supported.
- Set a global ceiling and, if needed, approved direct-link domains. Messages with HTML, shortened/redirected links, tracking parameters, or links that fail a direct HEAD check are rejected. No open pixel is implemented, so open metrics are unavailable in this phase.
- Verify each contact with the configured verification provider, then queue a plain-text message. Only a `valid` result matching the current email is eligible. Editing the address resets verification. [ZeroBounce's validation API](https://www.zerobounce.net/docs/email-validation-api-quickstart/v2-validate-emails) is behind the `VerificationProvider` interface.
- Enable the database engine setting and set `OUTREACH_EMAIL_ENABLED=true` in the deployment when ready. All three switches (deployment, global setting, mailbox) are required for dispatch.

## Worker

Schedule an authenticated HTTPS GET or POST to `/api/email/process` once per minute with `Authorization: Bearer <OUTREACH_WORKER_TOKEN>`. Alternatively schedule `corepack pnpm --filter @workspace/scripts email:process` with the same server environment. Keep credentials in the scheduler's secret store, never in a URL. No cron service is installed automatically.

Each invocation processes at most one message after a random delay. Allow at least 60 seconds of execution time; providers and direct-link checks can take longer under failure. SMTP plus serverless runtimes must permit outbound connections. Overlapping invocations reserve capacity under the same database advisory lock. Configure more frequent invocations only if needed; per-mailbox spacing and hard caps still apply.

The worker holds jobs outside 08:00–17:00 on the lead's weekdays. Warmup limits are 5, 15, 25, then the configured daily cap after 21 elapsed days. Automatic rotation uses only active mailboxes; explicitly selected warming mailboxes can send within the ramp. Enrollment assignment is permanent. Mailbox counters use mailbox-local dates; the global counter defaults to UTC. Local dates are calculated from UTC timestamps, including DST.

Reservations count against the day's limit even if delivery fails or has an uncertain outcome. A provider timeout is marked `unknown` and alerted, with no automatic retry; check the provider before creating a replacement. Pausing a mailbox cancels its queued jobs and stops its enrollments. Resuming the mailbox does not silently restart those jobs or enrollments.

## Signed events

Resend: register `/api/email/events/resend` for `email.delivered`, `email.bounced`, and `email.complained`; save the signing secret in `RESEND_WEBHOOK_SECRET`. The receiver verifies `svix-id`, `svix-timestamp`, and `svix-signature` against the exact raw request body and rejects stale signatures. See [Resend webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests). Retain raw bodies in reverse proxies/middleware; parsed-and-reserialized payloads fail verification.

SMTP: configure your mail host's delivery-event bridge to POST `/api/email/events/smtp`. The bridge must authenticate its upstream events and translate them into this contract; generic SMTP itself has no bounce/complaint webhook protocol.

```json
{"eventId":"unique-event-id","type":"hard_bounce","jobId":"outreach-job-uuid"}
```

Supported types: `delivered`, `hard_bounce`, `complaint`. Supply `jobId` from the outgoing `X-Outreach-ID` header, or `messageId` matching the outgoing Message-ID. Sign the exact UTF-8 body using hexadecimal HMAC-SHA256 over `<unix-seconds>.<raw-body>` and `OUTREACH_EVENT_SECRET`. Send `X-Outreach-Timestamp` and `X-Outreach-Signature`. The timestamp tolerance is five minutes; reuse the original event ID for retries. Events must match an already-dispatched job on that transport. Unmatched events should be retried after the sender acknowledgement is stored.

Hard bounces invalidate and suppress the address, shared with phone outreach. A rolling seven-day hard-bounce rate above 3% or complaint rate above 0.1% pauses the mailbox. A burned mailbox burns its domain and pauses peers. Rates use distinct affected jobs over dispatch reservations from the same seven-day cohort. Alerts appear on the mailbox screen; there is no external alert integration.

Every message includes a persistent opaque unsubscribe link and both List-Unsubscribe headers. GET and POST apply shared suppression. Lead deletion does not erase the job's identity snapshot or unsubscribe token. Suppression applies again on reimport.

## Validation and limits

Run `node --test phase1.test.mjs phase2.test.mjs` inside `scripts/outreach-tests` after installing that isolated test package, or set `PGLITE_MODULE` to an installed PGlite module. Tests apply actual migrations and rollback against integer/UUID fixtures and cover ramp enforcement, both daily budgets, weighted assignment, address verification, suppression/reimport, pre-dispatch rechecks, automatic pauses, signed events, encryption, plain-text rules, transport payloads, and US/Cairo DST send windows. External provider calls are mocked.

The final database eligibility check occurs immediately before provider dispatch. Phase 3 must add reply recording/polling and its race tests before automatic sequences go live. A provider already accepting a message cannot be recalled by a later suppression event. No live migrations, DNS changes, or real email sends were performed during implementation.

Rotate encryption keys by adding the new key to the map, selecting its ID, and rerunning the encryption script with old keys still present. It re-encrypts existing envelopes without printing secrets. Retain old keys until backups that depend on them expire.
