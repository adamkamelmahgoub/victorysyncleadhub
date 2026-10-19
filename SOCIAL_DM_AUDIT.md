# Social DM readiness audit (2026-10-20)

## Application and data

- Frontend: Vite, React, TypeScript, Wouter, Supabase JS in `artifacts/leadgen`. The Contacts screen uses `public.leads`; `crm_contacts` is a distinct legacy CRM table, reported empty in `README.md`.
- API: Vercel functions in `api/[...path].ts`, `api/mcp.ts`, `api/enrichment.ts`, and `api/enrichment-worker.ts`; `vercel.json` routes `/api/*` and `/leadgen/api/*`. Supabase Edge Functions live in `supabase/functions`.
- Schema: tracked migrations plus legacy tables documented in `SCHEMA_CATALOG.md`. `crm_companies`, `crm_contacts`, `crm_activities`, `crm_tasks`, and `crm_deals` have `organization_id`. Legacy CRM tables are restricted to `wf_role() = 'admin'`. `leads` uses `crm_lead_can_read(client_account_id, custom_fields)` and `crm_lead_can_write(...)`, based on Supabase JWT `crm_role`, `crm_client_account_id`, and `crm_team_member_id`; leads may have a null `organization_id`. New social rows must validate the referenced record's organization, not trust a submitted ID.
- Enrichment: `supabase/functions/_shared/enrichment.ts` calls Open Places / Overture and optionally Google Places; OpenRouter defaults to `nvidia/nemotron-3.5-lightning:free` for some AI work, with a paid fallback model for research. `enrichment_jobs` and `enrichment_job_items` track bulk work. `enrichment_cost_preview` is exposed in the MCP server. Existing code uses `SLACK_WEBHOOK_URL` for enrichment alerts.
- Slack meeting alerts: `notify_slack_meeting_booked` queues an HTTP request via `pg_net` using Supabase Vault and writes `slack_notification_log`; a cron reconciles delivery. This is the appropriate pattern for durable DM notifications.
- Existing inbound sources: `outreach_inbound_messages` stores email replies; `mightycall_sms_messages` stores SMS. `webhook_inbox` stores generic raw webhook data. `outreach_suppressions` stores normalized email/phone identities; `leads.dnc` is an additional stop signal.
- Existing `custom_fields` JSONB on contacts, companies, and leads, plus `leads.raw_payload`, can contain website and social candidate fields. A live count is needed before backfill. The audit script `scripts/audit-social-db.mjs` only reads metadata and counts; it prints no credentials or message bodies.

## Deployment and scope cautions

- The working tree had extensive unrelated uncommitted enrichment and UI changes before this task. Commits for this work must stage only social DM files.
- Live database connectivity has not yet been confirmed; repository catalog is a snapshot and must be checked before applying migrations.
- `crm_activities.company_id` is required, so lead-only social events need an existing company link or a separate timeline approach; do not manufacture a company.
