# Run Victory Sync workflows with Make

The CRM workflow editor stores templates and mailbox choices. Make runs the triggers, filters, routers, delays, and other app modules. Saving or enabling a CRM workflow alone does not schedule it.

## Connect once

1. In **Automation → Make connection**, create a token and copy it. Replacing it invalidates the old token; disconnecting revokes access.
2. In Make, add **HTTP → Make a request**. Choose **API key** authentication. Create credentials with key `Bearer YOUR_TOKEN`, placement **In the header**, parameter name **Authorization**. Store this in Make's credentials, not a mapped plain-text field.
3. Use the base URL shown in the portal, followed by an endpoint below. Choose JSON body content type, parse responses, and return an error on failed HTTP requests. Set a 120-second timeout for `/process` and `/poll`.

These fields follow [Make's API key authentication documentation](https://apps.make.com/api-key-authentication-type) and [HTTP module documentation](https://apps.make.com/http).

## Queue an email from any Make trigger

Use any Make app trigger, schedule, or custom webhook. Resolve the CRM contact ID, then POST `/queue`:

```json
{
  "eventKey": "source-event-id:contact-id:step-0",
  "leadId": "CRM_CONTACT_ID",
  "mailboxId": "CRM_MAILBOX_ID",
  "subject": "Your plain-text subject",
  "body": "Your plain-text message"
}
```

GET `/catalog` lists mailbox and workflow IDs. POST `/lead` with `{"leadId":"CRM_CONTACT_ID"}` returns an eligible contact's fields. Suppressed contacts are not returned.

Alternatively, configure a Send Email step's mailbox in the CRM editor, save and enable the workflow, then POST `/queue`:

```json
{
  "eventKey": "source-event-id:contact-id:workflow-id:step-0",
  "leadId": "CRM_CONTACT_ID",
  "workflowId": "CRM_WORKFLOW_ID",
  "stepIndex": 0
}
```

Step indices start at zero and count every saved action. This endpoint executes only the chosen email step. Configure all waits and other actions in Make; it does not walk the saved action list. The saved mailbox takes precedence over a request override. Template variables use the contact's current fields.

Keep `eventKey` identical on retries. Repeated requests return the original queue result. Reusing a key for a different message fails. Email is queued, not immediately delivered. Verification, suppression, enabled mailboxes, DNS, daily capacity, warmup, and local sending hours still apply.

## Trigger from CRM changes

Schedule POST `/events/claim` with `{}`. Iterate the returned array and filter on `type`. After handling each event, POST `/events/ack` with that event's `id` and `lease`.

Claims contain at most 20 events. Unacknowledged events become available again after 10 minutes. Use one consumer scenario with routers to fan out events. Acknowledge events intentionally filtered out too. Configure error handling so failed actions do not acknowledge the event. External app actions must also tolerate retries.

Events start when a connection token exists; historical contacts are not replayed automatically. Types include `contact_created`, `tags_changed`, `status_changed`, `opportunity_stage_changed`, `disposition_changed`, `call_logged`, `email_sent`, `email_event_hard_bounce`, `email_event_complaint`, `email_replied`, and `out_of_office`. A contact update emits one event with all changed status/tag/stage/disposition values and previous values in its payload. Replies identify the sender and mailbox; domain-wide replies may not identify one lead.

## Schedule sending and reply checks

Create scheduled Make HTTP requests:

- POST `/process`, body `{}`: dispatch at most one eligible email. Run every minute, or at an interval supported by your Make plan. Empty queues and send windows return zero sent.
- POST `/poll`, body `{}`: check one due receiving inbox. Run every 5 minutes for this single-mailbox setup; increase polling throughput if adding mailboxes.

These use the Make connection token and do not require `OUTREACH_WORKER_TOKEN`. The Mailboxes page also has a manual **Send next queued email** button. Credentials, verified DNS, a verification provider key, and eligible recipients must be configured first.

## Migrations

Apply `20260916_outreach_inbox_bounces.sql`, then `20260917_pipeline_delete.sql`, then `20260918_make_bridge.sql`. They have matching rollback files; roll back in reverse order. Pipeline deletion preserves contacts and clears their deleted stage assignment. Rolling back Make removes its token, event claims, and retry ledger; existing emails and contacts remain.
