# Client portal schema audit (live database, 2026-10-26)

The deployed app in this repository is a Vite/React SPA served by Vercel functions in `api/[...path].ts`. It is not a Next.js App Router app. There is no Next middleware. `artifacts/leadgen/src/lib/auth.tsx` uses Supabase Auth claims; `artifacts/leadgen/src/lib/permissions.ts` gates routes in React, while `api/[...path].ts` gates API paths. The API uses a service key for many REST calls. Those calls bypass RLS, so client API routes require their own account checks even after the database guard is installed.

The current page editor and renderer are `artifacts/leadgen/src/pages/landing-pages.tsx` and `lib/marketing-pages.ts`. They read `marketing_landing_pages`; the older `landing_pages` table is separate. The consolidation migration copies legacy pages into the editor's model with the same IDs and keeps the old table as a read-only archive. The existing three client accounts retain their IDs.

## Live columns involved

| Table | Existing columns read or linked | Columns added by the foundation migration |
| --- | --- | --- |
| `sub_accounts` | `id`, `name`, `slug`, `owner_email`, `owner_name`, `phone`, `industry`, `website`, `status`, `plan`, `created_at`, `updated_at`, `last_active_at`, `health_score` | `organization_id`, `package`, `add_ons`, `company_id`, `timezone`, `logo_url`, `brand`, `primary_domain`, `mightycall_number`, `google_review_link`, `gbp_url`, `meta_ad_account_id`, `google_ads_customer_id`, `goal_metric`, `goal_value`, `stripe_customer_id`, `launch_date`, `account_manager_user_id`, `settings`, `invite_email_sent_at` |
| `team_members` | `id`, `org_id`, `user_id`, `auth_user_id`, `role`, `is_active`, `client_account_id`, `created_at`, `page_permissions` | role check constraint |
| `leads` | `id`, `client_account_id`, `organization_id`, `form_id`, `dnc`, `custom_fields` | restrictive tenant policy |
| `forms` | `id`, `client_account_id` (new), `status`, `fields` | `client_account_id` |
| `form_submissions` | `id`, `form_id`, `landing_page_id`, `marketing_page_id`, `client_account_id` (new) | `client_account_id`, account consistency trigger |
| `landing_pages` | `id`, `organization_id`, `sections`, `theme` | `client_account_id` |
| `marketing_landing_pages` | `id`, `title`, `slug`, `status`, `sections`, `theme`, `seo_description`, `created_at`, `updated_at` | `client_account_id`, `canonical_page_id`, `organization_id` |
| `landing_page_events` | `id`, `landing_page_id`, `event_type`, `created_at` | `client_account_id` |
| `marketing_landing_page_events` | `id`, `page_id`, `event_type`, `created_at` | `client_account_id`, `legacy_event_id` |
| `organizations` | `id`, `name` | `settings` for the AI model ID |
| `companies` | `id`, `name`, `phone`, `industry`, `website`, `email`, `contact_name`, `stage`, `deleted_at` | `stage` changes to `client` after a verified Stripe checkout |
| `company_tasks` | `company_id`, `title`, `kind`, `status`, `priority`, `due_at`, `created_by` | `client_account_id` |
| `automation_workflows` | `name`, `trigger_type`, `trigger_config`, `actions`, `is_active` | `client_account_id` |
| `invite_codes` | `code_hash`, `email`, `name`, `role`, `team_member_id`, `client_account_id`, `org_id`, `expires_at`, `created_by` | none |
| `portal_activity_log` | `actor_id`, `actor_email`, `organization_id`, `client_account_id`, `event_type`, `action`, `target`, `metadata` | none |
| `mightycall_webhook_inbox` | `id`, `external_call_id`, `event_type`, `occurred_at`, `status` | `client_account_id`, `caller_number`, `business_number`, `call_status`, `call_direction`, `client_route_attempted_at`, `client_routed_at` |
| `mightycall_sms_messages` | `from_number`, `to_number`, `direction`, `message_text`, `body`, `message`, `sender`, `recipient`, `business_number`, `status` | `client_account_id` |
| `booking_appointments` | `id`, `lead_id`, `guest_name`, `guest_phone`, `status` | `client_account_id` |
| `review_requests` | `contact_name`, `contact_phone`, `channel`, `platform`, `status`, `sent_at` | `client_account_id` |
| `report_recipients` | `email`, `weekly`, `active` | `client_account_id` |
| `report_sends` | `type`, `period_start`, `period_end`, `sent_at`, `recipients`, `status` | `client_account_id` |
| `sequence_enrollments` | `lead_id`, `status`, `stopped_reason` | `client_account_id` |
| `sequence_steps` | `sequence_id`, `step_number`, `subject`, `body`, `delay_days`, `channel` | `client_account_id` inherited from sequence |
| `pipeline_stages` | `pipeline_id`, `name`, `position` | `client_account_id` inherited from pipeline |
| `invoice_items` | `invoice_id`, `description`, `quantity`, `total_price` | `client_account_id` inherited from invoice |
| `client_package_templates` | new table | `package`, `onboarding_tasks`, `workflows`, `created_at` |
| `client_automation_jobs` | new table | `id`, `client_account_id`, `lead_id`, `kind`, `source_id`, `payload`, `status`, `run_at`, `attempts`, `last_error`, `sent_at`, `claimed_at`, `created_at` |
| `user_feature_access` | `org_id`, `user_id`, `feature_key`, `enabled` | nullable `user_id` for organization defaults; unique default index |
| `sub_account_assignments` | new table | `sub_account_id`, `user_id`, `role_in_account`, `created_at` |

The foundation migration adds `client_account_id` and an index to each of `landing_page_events`, `marketing_landing_page_events`, `sequences`, `sequence_steps`, `sequence_enrollments`, `automation_workflows`, `review_requests`, `reviews`, `review_sources`, `booking_appointments`, `call_reports`, `mightycall_reports`, `mightycall_sms_messages`, `mightycall_webhook_inbox`, `report_sends`, `invoices`, `invoice_items`, `conversations`, `messages`, `company_tasks`, `contact_tasks`, `pipelines`, and `pipeline_stages`. It also adds the column to the page and form tables above. Each table already existed in the live database. Existing rows remain `NULL` and therefore agency data.

## Existing access behavior and rollout boundary

Live `leads` policies call `crm_lead_can_read` and `crm_lead_can_write`. Several other tables have restrictive `wf_role() = 'admin'` policies. The two `marketing_landing_*` tables have RLS enabled and no user policies; the current API reaches them through its service key. The foundation migration adds restrictive tenant guards for authenticated users and does not open client read access. This is deliberate until every client-facing API route filters by the authenticated account and user feature flags.

All new entry points use explicit account checks. The client portal starts disabled in `user_feature_access`; so do client account provisioning, the page builder, the AI page assistant, and delivery automations. The four client migrations were applied to the live database on 2026-10-26.

## Rollout

The 20261023 marketing page model was already present. The four numbered 20261026 migrations were applied together in one transaction. A rollback-only run also covered an idempotent re-run, client provisioning, staff invites, STOP suppression, page permissions, and cross-account access checks. Set `PORTAL_COOKIE_SECRET`, `CRON_SECRET`, Stripe, Resend, MightyCall, OpenRouter and Slack variables listed in `.env.example`. Configure the Stripe webhook at `/api/client-stripe-webhook` for `checkout.session.completed`, with `company_id` and `package` in checkout metadata. Configure the Stripe customer portal in Stripe. Turn on `client_accounts`, `client_portal`, `landing_page_builder`, `landing_page_ai` and `delivery_automation` in the portal feature manager after the integrations are ready. Delivery automations require an account MightyCall number and use the organization default flag. Existing three accounts stay in place and were not assigned new client users during migration.
