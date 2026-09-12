# Phase 3: unified sequences

Phase 3 extends the existing sequences, steps, enrollments, contact tasks, and activity timeline. It adds IMAP and Resend reply polling, domain-wide reply stops, out-of-office pauses, linked call tasks, and a seeded four-email draft. The subsequent Phase 4 migration adds domain controls and the weekly metrics view; see OUTREACH_PHASE4.md.

## Deploy

1. Keep the deployment flag `OUTREACH_EMAIL_ENABLED=false` and stop existing workers during the migration.
2. Back up the database. With Phase 1 and Phase 2 already installed, run `20260913_outreach_phase3.sql`, then `20260913_outreach_phase3_admin.sql` from `supabase/migrations`.
3. Deploy the matching application and lockfile. New dependencies are ImapFlow and MailParser. No additional encryption key is needed: inbox credentials use the existing AES-GCM key map and mailbox-address binding.
4. Open **Sequences → Reply monitoring**. Configure an inbox for each sender and run **Check next due inbox** until each inbox has a recent successful check. Configure the recurring poll worker below before enrollment.
5. Review the seeded draft, activate it, and enroll verified contacts. Enrollment requires an active sender, remaining daily capacity, confirmed lead timezone, and a successful inbox check in the past ten minutes. Configure sending and DNS as described in Phase 2, then enable the deployment flag when ready.

Existing active/paused enrollments are stopped during migration with `phase3_review_required`; they are not silently restarted. Existing legacy steps remain email steps. The new draft has relative delays 0, 3, 4, 5 days, giving nominal sends on days 0, 3, 7, 12. Send windows, caps, and pauses may move actual delivery later. Delays after the first step are measured from completion of the previous step, in UTC.

Rollback with `supabase/rollbacks/20260913_outreach_phase3.sql` before rolling back Phase 2. Disable workers first and export new inbox/task history. Rollback restores the exact saved Phase 1/2 function definitions, removes the seeded sequence and new fields, and keeps stopped/replied enrollments ended. It intentionally does not resurrect old schedules. It removes the Phase 3 inbox credential column; encrypted sending credentials remain intact.

## Receiving configuration

**SMTP senders:** supply the IMAP host, username, password/app password, and receiving folder, normally INBOX. IMAP uses TLS on port 993, verifies certificates, opens the folder read-only, and does not mark messages read or delete them. Configure rules so replies arrive in the monitored folder. The [ImapFlow fetching interface](https://imapflow.com/docs/guides/fetching-messages/) supports UID-based polling; cursors include UIDVALIDITY so a mailbox rebuild does not silently skip replies.

**Resend senders:** either monitor their real receiving mailbox over IMAP, or enable Resend receiving for the sender domain and supply a receiving-capable API key. Receiving requires the provider's MX records; configure these only for domains intended to receive at Resend. The adapter uses [List Received Emails](https://resend.com/docs/api-reference/emails/list-received-emails) and [Retrieve Received Email](https://resend.com/docs/api-reference/emails/retrieve-received-email), filters to the configured sender address, and paginates until caught up. No inbound webhook is required for reply detection. Keep the existing Phase 2 bounce/complaint webhooks configured.

Polling starts at the time inbox monitoring is first configured. Initial scanning must finish before enrollment is accepted. Messages before configuration are not treated as new replies. Reconfiguring an inbox clears its polling cursor while preserving that original start time, and holds automatic sending until a successful check. This allows credential changes to replay pending history without skipping unprocessed replies.

## Workers

- Continue calling `/api/email/process` for sending. Its database claim now schedules due sequence steps automatically, then applies all Phase 2 sending guards. One invocation sends at most one email.
- Schedule `/api/email/poll` with `Authorization: Bearer <OUTREACH_WORKER_TOKEN>`. The CLI equivalent is `corepack pnpm --filter @workspace/scripts email:poll`. Configure it with the existing public HTTPS origin and worker token.
- Each poll handles one due mailbox, up to 100 IMAP messages or 20 Resend list entries, without advancing the durable cursor until all returned replies are recorded. Caught-up mailboxes become due again after five minutes. Invoke every minute for a small mailbox pool; use enough invocations that every mailbox is checked within five minutes. Backlogs stay eligible for immediate additional polling.
- Allow up to 120 seconds for the poll endpoint. Reply processing is idempotent and uses a two-minute mailbox lease; a failed/expired poll does not authorize sending. If hosting limits are shorter, the same handler can run in the Express deployment with an external scheduler.

No scheduler or production receiving credentials are installed automatically. The sender worker will hold sequence jobs if inbox checks are missing or more than ten minutes old, including when the inbox provider is unavailable. The mailbox page exposes failures as operator alerts.

## State and cadence rules

- `paused` is the necessary addition to the original enrollment status list, with `pause_reason` and `resume_at`. An ordinary reply from the contact or anyone at that exact email domain stops all matching active/paused enrollments. This deliberately also applies to shared public email domains, per the specification; no public-domain exception is inferred.
- Any recorded ordinary reply from that contact/domain prevents new enrollment. Reply records are idempotent per receiving mailbox and provider message ID. Simultaneous messages from distinct contacts at the same domain are each recorded and cannot restart stopped work.
- Auto-replies are recognized from out-of-office subject text and auto-reply headers. An explicit ISO date or English month/day return date is converted to 08:00 in the matched contact's timezone (otherwise the mailbox timezone). Missing, invalid, past, or ambiguous dates use seven days from processing. OOO updates extend an existing hold; they never shorten it.
- Automatic OOO resumption rechecks suppression, call disposition, verification, sender availability, sequence activation, and inbox health. Hard bounces, unsubscribe, terminal call outcomes, and mailbox pauses override OOO. Ordinary emails never change a call disposition or pull a scheduled callback forward.
- Sent email creates one linked call task two days later. The call queue shows the sent email's subject/body for reference. Fresh enrolled contacts wait for their linked call task; explicitly scheduled call follow-ups keep their operator-selected times. Logging a call completes due linked tasks atomically with the disposition and next action. Stopping a cadence cancels its pending linked tasks; completing the email sequence leaves its final follow-up call due.
- A single active/paused cadence is allowed per lead. Sender assignment is permanent. Steps are frozen after any enrollment; create another sequence to change the schedule or templates. Duplicate worker calls cannot create a second email or call task for the same step.
- SMTP follow-ups reuse the previous sent Message-ID in In-Reply-To and References. Resend's send response exposes a provider ID rather than a confirmed RFC Message-ID, so this adapter preserves sender and subject but does not fabricate a threading guarantee.
- Calls, sent emails, and incoming reply activities appear in the existing chronological lead timeline. All automated state changes are audited as `system` with reasons. An uncertain provider dispatch pauses the enrollment and is never automatically resent.

The final eligibility check runs inside the send job after provider preparation and immediately before dispatch. Tests cover a reply recorded after claiming a queued job and prove the transport is not called. A message already accepted by an external provider cannot be recalled by a later reply. Polling observes inbox arrivals on the configured interval; it is not instantaneous push delivery.

## Validation

Run the isolated outreach suite with `node --test phase1.test.mjs phase2.test.mjs phase3.test.mjs` from `scripts/outreach-tests`, or set `PGLITE_MODULE` to an installed PGlite module. The actual migration/rollback tests cover integer and UUID schemas. Additional adapter tests live in `tests/outreach-inboxes.test.ts` and run with the existing `tsx --test tests/*.test.ts` suite.

Coverage includes default offsets, template interpolation, permanent sender assignment, duplicate jobs/tasks, queued/claimed reply races, domain replies, OOO resumption, terminal call priority, bounce/unsubscribe during OOO, stale/failed inbox polling, email edits, explicit call steps, callback priority, SMTP threading, cursor pagination, UIDVALIDITY changes, read-only IMAP, encryption, and migration rollback. Provider tests use mocks; no real email is sent by tests.

Encryption rotation now handles both sending and inbox credentials when the Phase 3 column exists. Retain old keys until both current records and retained backups can be decrypted with retained keys.
