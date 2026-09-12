# Domain controls and weekly outreach

This release includes Phase 3 sequences and Phase 4 metrics. The operator explicitly authorized primary-domain sending, overriding the original Phase 2 prohibition. The database still requires an explicit `allow_primary_sending` opt-in for each primary domain. Warmup, DNS verification, suppression, verification, reply stops, per-mailbox flags and capacity limits still apply.

## Install

Keep `OUTREACH_EMAIL_ENABLED=false` and pause scheduled workers. Back up the database, then run these files in order in the Supabase SQL Editor (Phase 1/2 are prerequisites and must not be rerun):

1. `supabase/migrations/20260913_outreach_phase3.sql`
2. `supabase/migrations/20260913_outreach_phase3_admin.sql`
3. `supabase/migrations/20260914_outreach_phase4.sql`

Run each file once, in full. Deploy this application revision after all three succeed. No new encryption key is required; use the existing key map and key ID on the deployed server. Keep the database URL, encryption keys, provider keys and worker/webhook tokens in server environment variables, never Vite frontend variables.

If using the existing local checkout instead of SQL Editor, `Get-Content -Raw <migration path>` prints the full SQL for copying. The migrations do not connect a DNS provider, start workers, or send email. Existing active legacy enrollments are stopped for review during Phase 3.

## Configure the portal

1. Open **Mailboxes**, add your sending domain and identify primary company domains in settings.
2. For the primary domain, check **Allow outreach from this primary domain** in its row before connecting a mailbox. This setting does not skip the warmup ramp.
3. Open **DNS setup**. Publish the sending provider's exact SPF, DKIM and DMARC records at the DNS provider. Set the SPF host and DKIM selector to match that provider, then click **Save and check DNS**. Changing these host settings pauses existing mailboxes and stops their enrollments; review before reenrolling.
4. Connect an SMTP mailbox or Resend API sender. New mailbox credentials are encrypted automatically. Enable signed delivery/bounce/complaint events using the Phase 2 setup. Resend requires a verified provider domain with both click and open tracking disabled.
5. Open **Sequences → Reply monitoring**, configure the receiving mailbox (IMAP or Resend), and check the inbox until polling is caught up. Keep your existing main-domain MX records if your main inbox is hosted elsewhere; monitor that inbox with IMAP. Only route MX to Resend if Resend will receive that domain's email.
6. Schedule authenticated POST calls to `/api/email/poll` and `/api/email/process` using `Authorization: Bearer <OUTREACH_WORKER_TOKEN>`. Each invocation handles one mailbox or at most one send. Poll often enough that every mailbox is checked within five minutes. Stale inbox checks hold sequence sends. See Phase 3 documentation for capacity/backlog details.
7. Review sequence templates, verify contact addresses, confirm lead timezones, and activate the sequence. Enrollment requires an active mailbox that has finished the three-week ramp. When configuration is complete, enable the deployment flag, global sending setting, and individual mailbox flags.

Domain deletion archives the domain, removes it from selection, pauses its mailboxes and ends their sequences. Delivery history, caps, audit records and unsubscribe links remain intact. Archived domain names remain reserved. Rollback re-exposes their rows but leaves their senders paused; it never restarts old sequences.

The CRM checks public DNS; it cannot write records to your registrar. Use provider-issued values rather than copying generic SPF/DKIM examples. Keep one SPF record at each host and merge existing authorized senders. Official references: [Resend domain configuration](https://resend.com/docs/dashboard/domains/introduction), [Resend receiving domains](https://resend.com/docs/dashboard/receiving/custom-domains).

## Metrics definitions

**Reports → Weekly outreach** shows seven UTC days, calls and email in two tables. No charts are added.

- Dials count unique successful call-log requests. Connects and conversations count explicit saved classifications; unclassified historical calls are shown separately rather than guessed from dispositions.
- Meetings booked count `meeting_booked` call outcomes. Meetings held count the operator's actual held timestamp, independent of the booking week. Select the booking week in the review list to record a meeting held later. A held date must follow the booking and cannot be in the future.
- Sent counts provider-accepted sends in the selected week. Delivered and hard bounce metrics use unique job-level provider events for that sent cohort, including events received later. SMTP requires the signed event bridge; transport acceptance alone is not proof of delivery.
- Reply and positive reply rates use unique recipients in that sent cohort. A reply from the same exact domain to that mailbox after sending counts, matching the domain-wide stop policy. Auto-replies do not count. Positive replies require the operator label. Later replies can update earlier weeks. Overall recipients are deduplicated across mailboxes.
- Open rate is unavailable because this release keeps tracking disabled. A zero would imply measurement that does not exist. Optional open tracking remains a separately scoped missing capability.
- Review sections show up to 500 calls/replies for the selected week. Totals are calculated over all matching records. Call classification is repeatable without adding a dial; provider events and replies cannot inflate message counts.

Rollback Phase 4 with `supabase/rollbacks/20260914_outreach_phase4.sql` before rolling back Phase 3. It restores saved function definitions and removes new outcome data; export classifications first if needed. Primary and deleted senders are paused before restoring the old block. No scheduler or live credentials are configured by these migrations.

## Validation

Run the four outreach SQL suites, the root TypeScript tests, all workspace and API typechecks, and the web/API production builds. Phase 4 tests run against both integer and UUID schemas and cover primary opt-in at dispatch, revocation, DNS ownership, deletion, retained history, classification deduplication, event deduplication, scope isolation, permissions, and rollback. Earlier suites cover suppression, DST windows, warmup, bounce auto-pause, reply races, and sequence interlocks. Tests use local PostgreSQL-compatible PGlite and mocked providers, not live sends.
