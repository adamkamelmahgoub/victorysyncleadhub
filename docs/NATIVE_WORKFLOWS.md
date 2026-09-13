# Native workflow engine

Victory Sync executes workflows configured on the Automation page. It does not require Make, Zapier, or another automation service.

Supported triggers are contact created, tag added, contact status changed, pipeline stage changed, email replied, call logged, disposition changed, and manual run. Trigger filters are optional; leaving one blank matches every event of that type. Events create durable workflow runs and cannot be lost merely because a worker invocation is delayed.

Supported nodes are send email, wait, condition, add/remove tag, update contact status, move pipeline stage, enroll in sequence, create call task, add note, HTTPS webhook, and stop workflow. Email nodes must select a configured mailbox and queue through the outreach engine, so verification, suppression, DNS, warmup, daily limits, local send windows, and reply checks still apply.

The production scheduler calls the native workflow processor and the email queue/reply poll every five minutes. `CRON_SECRET` and `OUTREACH_WORKER_TOKEN` are configured to the same private value. Operators can run a manual-trigger workflow immediately from its editor.

Workflow runs use a two-minute execution lease. Completed nodes have a unique run/step log, waits persist their next execution time, and failures stop the run with a short error visible in engine status. Pausing a workflow stops new and due execution until it is activated again.

Webhook nodes allow public HTTPS destinations only. Redirects and private/local network addresses are rejected. Remote actions can still receive a retry after an uncertain network failure, so webhook consumers should use the supplied run ID as an idempotency key.

Apply migrations in order through `20260920_native_workflows.sql`. The corresponding rollback removes native triggers, runs, and logs without deleting contacts, workflows, email jobs, or activities.
