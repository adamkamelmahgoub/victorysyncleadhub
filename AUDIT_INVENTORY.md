# Phase 0 inventory

Generated from the current source tree and read-only production schema metadata. No customer rows or secret values were read. Route auth flags below are source-scan prompts for review, not security verdicts.

## Pages (111 routes)

- `/victorysync`
- `/`
- `/companies`
- `/companies/:id`
- `/ai-assistant`
- `/leadgen/ai-assistant`
- `/trial-queue`
- `/company-kpis`
- `/crm-tasks`
- `/leadgen/crm-tasks`
- `/leadgen/companies`
- `/leadgen/companies/:id`
- `/leadgen/trial-queue`
- `/leadgen/company-kpis`
- `/leadgen`
- `/leadgen/client-portal`
- `/leadgen/client-portal/:section`
- `/leadgen/leads`
- `/leadgen/call-queue`
- `/leadgen/leads/:id`
- `/leadgen/conversations`
- `/leadgen/dm-queue`
- `/leadgen/dm-campaigns`
- `/leadgen/social-review`
- `/leadgen/calendars`
- `/leadgen/automation`
- `/leadgen/reputation`
- `/leadgen/pipeline`
- `/leadgen/sequences`
- `/leadgen/sequences/:id`
- `/leadgen/campaigns`
- `/leadgen/campaigns/:id`
- `/leadgen/forms`
- `/leadgen/forms/:id`
- `/leadgen/landing-pages`
- `/leadgen/landing-pages/:id`
- `/leadgen/marketing-reports`
- `/leadgen/analytics`
- `/leadgen/scraper`
- `/leadgen/email-accounts`
- `/leadgen/email-unsubscribes`
- `/leadgen/sent-emails`
- `/leadgen/activity-log`
- `/leadgen/integrations`
- `/leadgen/company-import`
- `/leadgen/lead-import`
- `/leadgen/social-planner`
- `/leadgen/social-reports`
- `/leadgen/me/stats`
- `/leadgen/segments`
- `/leadgen/webhooks`
- `/leadgen/email-templates`
- `/leadgen/prospect-search`
- `/leadgen/meeting-scheduler`
- `/leadgen/sequence-analytics`
- `/leadgen/revenue-attribution`
- `/leadgen/getting-started`
- `/leadgen/training`
- `/dashboard`
- `/client-portal`
- `/client-portal/:section`
- `/leads`
- `/call-queue`
- `/leads/:id`
- `/conversations`
- `/dm-queue`
- `/dm-campaigns`
- `/social-review`
- `/calendars`
- `/automation`
- `/reputation`
- `/pipeline`
- `/sequences`
- `/sequences/:id`
- `/campaigns`
- `/campaigns/:id`
- `/forms`
- `/forms/:id`
- `/landing-pages`
- `/landing-pages/:id`
- `/marketing-reports`
- `/analytics`
- `/scraper`
- `/outreach-weekly`
- `/leadgen/outreach-weekly`
- `/email-accounts`
- `/email-unsubscribes`
- `/sent-emails`
- `/activity-log`
- `/settings`
- `/team`
- `/integrations`
- `/company-import`
- `/lead-import`
- `/social-planner`
- `/social-reports`
- `/me/stats`
- `/segments`
- `/contacts/segments/:id`
- `/webhooks`
- `/email-templates`
- `/sub-accounts`
- `/sub-accounts/:id`
- `/prospect-search`
- `/meeting-scheduler`
- `/sequence-analytics`
- `/revenue-attribution`
- `/getting-started`
- `/training`
- `/affiliates`
- `/billing-integration`

## Vercel API entry points (12)

- `api/assistant.ts` | auth marker: review required
- `api/client-delivery-worker.ts` | auth marker: review required
- `api/client-landing.ts` | auth marker: review required
- `api/client-review-click.ts` | auth marker: review required
- `api/client-stripe-webhook.ts` | auth marker: review required
- `api/enrichment-worker.ts` | auth marker: review required
- `api/enrichment.ts` | auth marker: review required
- `api/marketing.ts` | auth marker: review required
- `api/mcp.ts` | auth marker: review required
- `api/portal.ts` | auth marker: present
- `api/social-router.ts` | auth marker: review required
- `api/[...path].ts` | auth marker: present

## API server routes (167)

- GET `/leads/:id/activities` | `artifacts/api-server/src/routes/activities.ts`
- POST `/leads/:id/activities` | `artifacts/api-server/src/routes/activities.ts`
- GET `/affiliates` | `artifacts/api-server/src/routes/affiliates.ts`
- POST `/affiliates` | `artifacts/api-server/src/routes/affiliates.ts`
- GET `/affiliates/:id` | `artifacts/api-server/src/routes/affiliates.ts`
- PATCH `/affiliates/:id` | `artifacts/api-server/src/routes/affiliates.ts`
- DELETE `/affiliates/:id` | `artifacts/api-server/src/routes/affiliates.ts`
- GET `/affiliates/:id/referrals` | `artifacts/api-server/src/routes/affiliates.ts`
- POST `/affiliates/:id/referrals` | `artifacts/api-server/src/routes/affiliates.ts`
- PATCH `/referrals/:id` | `artifacts/api-server/src/routes/affiliates.ts`
- GET `/affiliates-stats` | `artifacts/api-server/src/routes/affiliates.ts`
- GET `/analytics/overview` | `artifacts/api-server/src/routes/analytics.ts`
- GET `/analytics/by-status` | `artifacts/api-server/src/routes/analytics.ts`
- GET `/analytics/by-source` | `artifacts/api-server/src/routes/analytics.ts`
- GET `/analytics/lead-sources` | `artifacts/api-server/src/routes/analytics.ts`
- GET `/analytics/by-campaign` | `artifacts/api-server/src/routes/analytics.ts`
- GET `/analytics/timeline` | `artifacts/api-server/src/routes/analytics.ts`
- GET `/analytics/top-leads` | `artifacts/api-server/src/routes/analytics.ts`
- GET `/api-keys` | `artifacts/api-server/src/routes/api-keys.ts`
- POST `/api-keys` | `artifacts/api-server/src/routes/api-keys.ts`
- PATCH `/api-keys/:id` | `artifacts/api-server/src/routes/api-keys.ts`
- DELETE `/api-keys/:id` | `artifacts/api-server/src/routes/api-keys.ts`
- POST `/auth/sso` | `artifacts/api-server/src/routes/api-keys.ts`
- GET `/auth/sso/validate` | `artifacts/api-server/src/routes/api-keys.ts`
- POST `/auth/signup-with-invite` | `artifacts/api-server/src/routes/auth.ts`
- GET `/automations` | `artifacts/api-server/src/routes/automations.ts`
- POST `/automations` | `artifacts/api-server/src/routes/automations.ts`
- GET `/automations/:id` | `artifacts/api-server/src/routes/automations.ts`
- PATCH `/automations/:id` | `artifacts/api-server/src/routes/automations.ts`
- DELETE `/automations/:id` | `artifacts/api-server/src/routes/automations.ts`
- GET `/campaigns` | `artifacts/api-server/src/routes/campaigns.ts`
- POST `/campaigns` | `artifacts/api-server/src/routes/campaigns.ts`
- GET `/campaigns/:id` | `artifacts/api-server/src/routes/campaigns.ts`
- PATCH `/campaigns/:id` | `artifacts/api-server/src/routes/campaigns.ts`
- DELETE `/campaigns/:id` | `artifacts/api-server/src/routes/campaigns.ts`
- GET `/campaigns/:id/leads` | `artifacts/api-server/src/routes/campaigns.ts`
- POST `/campaigns/:id/leads` | `artifacts/api-server/src/routes/campaigns.ts`
- POST `/campaigns/:id/launch` | `artifacts/api-server/src/routes/campaigns.ts`
- GET `/leads/:leadId/tasks` | `artifacts/api-server/src/routes/contact-tasks.ts`
- POST `/leads/:leadId/tasks` | `artifacts/api-server/src/routes/contact-tasks.ts`
- PATCH `/leads/:leadId/tasks/:taskId` | `artifacts/api-server/src/routes/contact-tasks.ts`
- DELETE `/leads/:leadId/tasks/:taskId` | `artifacts/api-server/src/routes/contact-tasks.ts`
- GET `/email-accounts` | `artifacts/api-server/src/routes/email-accounts.ts`
- POST `/email-accounts` | `artifacts/api-server/src/routes/email-accounts.ts`
- PUT `/email-accounts/:id` | `artifacts/api-server/src/routes/email-accounts.ts`
- DELETE `/email-accounts/:id` | `artifacts/api-server/src/routes/email-accounts.ts`
- POST `/email-accounts/:id/set-default` | `artifacts/api-server/src/routes/email-accounts.ts`
- POST `/email-accounts/:id/test` | `artifacts/api-server/src/routes/email-accounts.ts`
- GET `/email-templates` | `artifacts/api-server/src/routes/email-templates.ts`
- POST `/email-templates` | `artifacts/api-server/src/routes/email-templates.ts`
- PATCH `/email-templates/:id` | `artifacts/api-server/src/routes/email-templates.ts`
- DELETE `/email-templates/:id` | `artifacts/api-server/src/routes/email-templates.ts`
- GET `/forms` | `artifacts/api-server/src/routes/forms.ts`
- POST `/forms` | `artifacts/api-server/src/routes/forms.ts`
- GET `/forms/:id` | `artifacts/api-server/src/routes/forms.ts`
- PATCH `/forms/:id` | `artifacts/api-server/src/routes/forms.ts`
- DELETE `/forms/:id` | `artifacts/api-server/src/routes/forms.ts`
- POST `/forms/:id/submit` | `artifacts/api-server/src/routes/forms.ts`
- GET `/healthz` | `artifacts/api-server/src/routes/health.ts`
- GET `/integrations` | `artifacts/api-server/src/routes/integrations.ts`
- POST `/integrations` | `artifacts/api-server/src/routes/integrations.ts`
- PATCH `/integrations/:id` | `artifacts/api-server/src/routes/integrations.ts`
- POST `/integrations/stripe/validate` | `artifacts/api-server/src/routes/integrations.ts`
- POST `/integrations/:id/sync` | `artifacts/api-server/src/routes/integrations.ts`
- DELETE `/integrations/:id` | `artifacts/api-server/src/routes/integrations.ts`
- GET `/leads` | `artifacts/api-server/src/routes/leads.ts`
- POST `/leads` | `artifacts/api-server/src/routes/leads.ts`
- POST `/leads/import` | `artifacts/api-server/src/routes/leads.ts`
- DELETE `/leads` | `artifacts/api-server/src/routes/leads.ts`
- GET `/dispositions` | `artifacts/api-server/src/routes/leads.ts`
- POST `/dispositions` | `artifacts/api-server/src/routes/leads.ts`
- GET `/leads/:id` | `artifacts/api-server/src/routes/leads.ts`
- PATCH `/leads/:id` | `artifacts/api-server/src/routes/leads.ts`
- DELETE `/leads/:id` | `artifacts/api-server/src/routes/leads.ts`
- PATCH `/leads/:id/score` | `artifacts/api-server/src/routes/leads.ts`
- GET `/meeting/event-types` | `artifacts/api-server/src/routes/meeting-scheduler.ts`
- POST `/meeting/event-types` | `artifacts/api-server/src/routes/meeting-scheduler.ts`
- GET `/meeting/event-types/slug/:slug` | `artifacts/api-server/src/routes/meeting-scheduler.ts`
- GET `/meeting/event-types/:id` | `artifacts/api-server/src/routes/meeting-scheduler.ts`
- PATCH `/meeting/event-types/:id` | `artifacts/api-server/src/routes/meeting-scheduler.ts`
- DELETE `/meeting/event-types/:id` | `artifacts/api-server/src/routes/meeting-scheduler.ts`
- GET `/meeting/appointments` | `artifacts/api-server/src/routes/meeting-scheduler.ts`
- POST `/meeting/appointments` | `artifacts/api-server/src/routes/meeting-scheduler.ts`
- PATCH `/meeting/appointments/:id` | `artifacts/api-server/src/routes/meeting-scheduler.ts`
- GET `/meeting/slots` | `artifacts/api-server/src/routes/meeting-scheduler.ts`
- GET `/leads/:id/notes` | `artifacts/api-server/src/routes/notes.ts`
- POST `/leads/:id/notes` | `artifacts/api-server/src/routes/notes.ts`
- DELETE `/leads/:leadId/notes/:noteId` | `artifacts/api-server/src/routes/notes.ts`
- GET `/oauth/providers` | `artifacts/api-server/src/routes/oauth.ts`
- GET `/oauth/callback-url` | `artifacts/api-server/src/routes/oauth.ts`
- GET `/oauth/:provider/start` | `artifacts/api-server/src/routes/oauth.ts`
- GET `/oauth/:provider/callback` | `artifacts/api-server/src/routes/oauth.ts`
- POST `/oauth/twilio/validate` | `artifacts/api-server/src/routes/oauth.ts`
- POST `/oauth/zapier/validate` | `artifacts/api-server/src/routes/oauth.ts`
- GET `/onboarding` | `artifacts/api-server/src/routes/onboarding.ts`
- POST `/onboarding/complete-step` | `artifacts/api-server/src/routes/onboarding.ts`
- POST `/onboarding/reset` | `artifacts/api-server/src/routes/onboarding.ts`
- GET `/outreach/queue` | `artifacts/api-server/src/routes/outreach.ts`
- GET `/outreach/needs-timezone` | `artifacts/api-server/src/routes/outreach.ts`
- POST `/leads/:id/calls` | `artifacts/api-server/src/routes/outreach.ts`
- PATCH `/leads/:id/outreach` | `artifacts/api-server/src/routes/outreach.ts`
- GET `/pipeline/stages` | `artifacts/api-server/src/routes/pipeline.ts`
- POST `/pipeline/stages` | `artifacts/api-server/src/routes/pipeline.ts`
- PUT `/pipeline/stages/:id` | `artifacts/api-server/src/routes/pipeline.ts`
- DELETE `/pipeline/stages/:id` | `artifacts/api-server/src/routes/pipeline.ts`
- GET `/pipeline/leads` | `artifacts/api-server/src/routes/pipeline.ts`
- PATCH `/pipeline/leads/:id/stage` | `artifacts/api-server/src/routes/pipeline.ts`
- GET `/prospects` | `artifacts/api-server/src/routes/prospects.ts`
- POST `/prospects` | `artifacts/api-server/src/routes/prospects.ts`
- POST `/prospects/save-to-leads` | `artifacts/api-server/src/routes/prospects.ts`
- GET `/prospects/filters` | `artifacts/api-server/src/routes/prospects.ts`
- POST `/provision/accounts` | `artifacts/api-server/src/routes/provision.ts`
- PATCH `/provision/accounts/:externalId/status` | `artifacts/api-server/src/routes/provision.ts`
- PATCH `/provision/accounts/:externalId/plan` | `artifacts/api-server/src/routes/provision.ts`
- GET `/provision/accounts/:externalId/stats` | `artifacts/api-server/src/routes/provision.ts`
- GET `/provision/stats` | `artifacts/api-server/src/routes/provision.ts`
- GET `/review-sources` | `artifacts/api-server/src/routes/reviews.ts`
- POST `/review-sources` | `artifacts/api-server/src/routes/reviews.ts`
- PATCH `/review-sources/:id` | `artifacts/api-server/src/routes/reviews.ts`
- DELETE `/review-sources/:id` | `artifacts/api-server/src/routes/reviews.ts`
- GET `/reviews` | `artifacts/api-server/src/routes/reviews.ts`
- POST `/reviews` | `artifacts/api-server/src/routes/reviews.ts`
- PATCH `/reviews/:id/reply` | `artifacts/api-server/src/routes/reviews.ts`
- PATCH `/reviews/:id/read` | `artifacts/api-server/src/routes/reviews.ts`
- DELETE `/reviews/:id` | `artifacts/api-server/src/routes/reviews.ts`
- GET `/review-requests` | `artifacts/api-server/src/routes/reviews.ts`
- POST `/review-requests` | `artifacts/api-server/src/routes/reviews.ts`
- GET `/reviews/stats` | `artifacts/api-server/src/routes/reviews.ts`
- POST `/scraper/url` | `artifacts/api-server/src/routes/scraper.ts`
- POST `/scraper/domain` | `artifacts/api-server/src/routes/scraper.ts`
- POST `/scraper/search` | `artifacts/api-server/src/routes/scraper.ts`
- GET `/segments` | `artifacts/api-server/src/routes/segments.ts`
- POST `/segments` | `artifacts/api-server/src/routes/segments.ts`
- PATCH `/segments/:id` | `artifacts/api-server/src/routes/segments.ts`
- DELETE `/segments/:id` | `artifacts/api-server/src/routes/segments.ts`
- POST `/email/send` | `artifacts/api-server/src/routes/sequences.ts`
- GET `/sequences` | `artifacts/api-server/src/routes/sequences.ts`
- POST `/sequences` | `artifacts/api-server/src/routes/sequences.ts`
- GET `/sequences/:id` | `artifacts/api-server/src/routes/sequences.ts`
- PUT `/sequences/:id` | `artifacts/api-server/src/routes/sequences.ts`
- DELETE `/sequences/:id` | `artifacts/api-server/src/routes/sequences.ts`
- GET `/sequences/:id/steps` | `artifacts/api-server/src/routes/sequences.ts`
- POST `/sequences/:id/steps` | `artifacts/api-server/src/routes/sequences.ts`
- PUT `/sequences/:id/steps/:stepId` | `artifacts/api-server/src/routes/sequences.ts`
- DELETE `/sequences/:id/steps/:stepId` | `artifacts/api-server/src/routes/sequences.ts`
- GET `/sequences/:id/enrollments` | `artifacts/api-server/src/routes/sequences.ts`
- POST `/sequences/:id/enroll` | `artifacts/api-server/src/routes/sequences.ts`
- POST `/email/send` | `artifacts/api-server/src/routes/sequences.ts`
- GET `/email/logs` | `artifacts/api-server/src/routes/sequences.ts`
- GET `/sub-accounts` | `artifacts/api-server/src/routes/sub-accounts.ts`
- POST `/sub-accounts` | `artifacts/api-server/src/routes/sub-accounts.ts`
- GET `/sub-accounts/:id` | `artifacts/api-server/src/routes/sub-accounts.ts`
- PATCH `/sub-accounts/:id` | `artifacts/api-server/src/routes/sub-accounts.ts`
- DELETE `/sub-accounts/:id` | `artifacts/api-server/src/routes/sub-accounts.ts`
- GET `/sub-accounts/:id/white-label` | `artifacts/api-server/src/routes/sub-accounts.ts`
- PUT `/sub-accounts/:id/white-label` | `artifacts/api-server/src/routes/sub-accounts.ts`
- GET `/sub-accounts/:id/workspace-stats` | `artifacts/api-server/src/routes/sub-accounts.ts`
- GET `/sub-accounts-stats` | `artifacts/api-server/src/routes/sub-accounts.ts`
- GET `/team` | `artifacts/api-server/src/routes/team.ts`
- POST `/team/invite` | `artifacts/api-server/src/routes/team.ts`
- PATCH `/team/:id` | `artifacts/api-server/src/routes/team.ts`
- DELETE `/team/:id` | `artifacts/api-server/src/routes/team.ts`
- GET `/webhooks` | `artifacts/api-server/src/routes/webhooks.ts`
- POST `/webhooks` | `artifacts/api-server/src/routes/webhooks.ts`
- PATCH `/webhooks/:id` | `artifacts/api-server/src/routes/webhooks.ts`
- DELETE `/webhooks/:id` | `artifacts/api-server/src/routes/webhooks.ts`
- POST `/webhooks/:id/test` | `artifacts/api-server/src/routes/webhooks.ts`

## Public tables (270)

| Table | RLS | Columns | Policies |
| --- | --- | --- | --- |
| `access_codes` | on | `id` uuid, `code` text, `client_id` uuid, `role` text, `max_uses` integer, `used_count` integer, `expires_at` timestamp with time zone, `created_by` uuid, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `access_control` | on | `id` uuid, `auth_user_id` uuid, `email` text, `client_id` uuid, `role` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `account_templates` | on | `key` text, `name` text, `package` text, `payload` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `account_templates_agency_read` (SELECT) |
| `activities` | on | `id` uuid, `lead_id` uuid, `type` text, `description` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `activity_logs` | on | `id` uuid, `user_id` uuid, `organization_id` uuid, `session_id` text, `event_type` text, `event_name` text, `page` text, `element` text, `metadata` jsonb, `ip_address` text, `user_agent` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `ad_spend_entries` | on | `id` uuid, `client_account_id` uuid, `platform` text, `month` date, `amount_cents` bigint, `source` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `ad_spend_entries_read` (SELECT) |
| `admin_client_lead_activities` | on | `id` uuid, `lead_id` uuid, `organization_id` uuid, `activity_type` text, `summary` text, `changes` jsonb, `actor_id` uuid, `actor_name` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `admin_client_leads` | on | `id` uuid, `organization_id` uuid, `first_name` text, `last_name` text, `phone` text, `email` text, `company` text, `source` text, `status` text, `disposition` text, `priority` text, `assigned_to` text, `attempts` integer, `last_contacted_at` timestamp with time zone, `next_follow_up_at` timestamp with time zone, `do_not_contact` boolean, `notes` text, `raw_payload` jsonb, `created_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `affiliates` | on | `id` uuid, `name` text, `email` text, `phone` text, `company` text, `referral_code` text, `commission_rate` numeric(5,2), `status` text, `total_referrals` integer, `total_converted` integer, `total_earned` numeric(10,2), `total_paid` numeric(10,2), `payout_method` text, `payout_details` text, `notes` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `agent_extensions` | on | `id` uuid, `org_id` uuid, `user_id` uuid, `extension` text, `display_name` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `agent_live_status` | on | `id` uuid, `org_id` uuid, `org_member_id` uuid, `user_id` uuid, `mightycall_extension` text, `extension` text, `mightycall_user_id` text, `raw_status` text, `normalized_status` text, `current_call_id` text, `current_call_direction` text, `current_counterpart_number` text, `status_started_at` timestamp with time zone, `last_synced_at` timestamp with time zone, `raw_payload` jsonb, `external_call_id` text, `direction` text, `from_number` text, `to_number` text, `status` text, `started_at` timestamp with time zone, `answered_at` timestamp with time zone, `ended_at` timestamp with time zone, `last_event_at` timestamp with time zone, `raw_event` jsonb, `stale` boolean, `source` text, `sync_error` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `agent_name` text, `business_number` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `agents` | on | `id` uuid, `name` text, `team` text, `client_id` uuid | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `ai_calls` | on | `id` uuid, `lead_id` uuid, `campaign_id` uuid, `vendor` text, `vendor_call_id` text, `status` text, `started_at` timestamp with time zone, `ended_at` timestamp with time zone, `duration_seconds` integer, `transcript` text, `outcome` text, `ai_handled` boolean, `raw_payload` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `ai_campaigns` | on | `id` uuid, `organization_id` uuid, `name` text, `client_name` text, `qualification_config` jsonb, `voice_config` jsonb, `routing_config` jsonb, `active` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `ai_requests` | on | `id` uuid, `user_id` uuid, `client_account_id` uuid, `page_id` uuid, `prompt_tokens` integer, `completion_tokens` integer, `cost_cents` numeric(12,4), `action` text, `created_at` timestamp with time zone | `ai_requests_read` (SELECT) |
| `api_keys` | on | `id` uuid, `name` text, `key_hash` text, `key_prefix` text, `scopes` text[], `sub_account_id` uuid, `created_by` text, `last_used_at` timestamp with time zone, `expires_at` timestamp with time zone, `is_active` boolean, `request_count` integer, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `api_logs` | on | `id` uuid, `user_id` uuid, `organization_id` uuid, `session_id` text, `method` text, `endpoint` text, `status_code` integer, `response_time_ms` integer, `request_size_bytes` integer, `response_size_bytes` integer, `ip_address` text, `user_agent` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `application_rate_limits` | on | `ip` text, `created_at` timestamp with time zone | none |
| `applications` | on | `id` uuid, `full_name` text, `email` text, `phone` text, `location` text, `experience` text, `us_hours` text, `desired_salary` numeric, `currency` text, `commission_preference` text, `voice_file_path` text, `voice_link` text, `pitch` text, `linkedin_url` text, `source` text, `user_agent` text, `created_at` timestamp with time zone, `roles` text[], `other_role` text | none |
| `assistant_conversations` | on | `id` uuid, `user_id` uuid, `title` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | none |
| `assistant_memories` | on | `id` uuid, `user_id` uuid, `content` text, `created_at` timestamp with time zone | none |
| `assistant_messages` | on | `id` uuid, `conversation_id` uuid, `role` text, `content` text, `tool_events` jsonb, `created_at` timestamp with time zone | none |
| `audit_bookings` | on | `id` uuid, `organization_id` uuid, `lead_id` uuid, `rep_user_id` uuid, `connected_account_id` uuid, `platform` text, `campaign_id` uuid, `template_id` uuid, `conversation_id` uuid, `calendly_event_uri` text, `calendly_invitee_uri` text, `scheduled_at` timestamp with time zone, `status` text, `booked_at` timestamp with time zone, `source` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `audit_bookings_admin` (SELECT), `audit_bookings_rep` (SELECT) |
| `audit_log` | on | `id` uuid, `actor_id` uuid, `action` text, `entity` text, `entity_id` text, `before` jsonb, `after` jsonb, `created_at` timestamp with time zone | `audit_admin` (SELECT) |
| `audit_logs` | on | `id` uuid, `actor_id` uuid, `org_id` uuid, `action` text, `entity_type` text, `entity_id` text, `metadata` jsonb, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `auth_lockouts` | on | `id` uuid, `ip_address` text, `locked_until` timestamp with time zone, `failed_count` integer, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `auth_logs` | on | `id` uuid, `user_id` uuid, `organization_id` uuid, `event_type` text, `email` text, `ip_address` text, `user_agent` text, `failure_reason` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `automation_runs` | on | `id` uuid, `workflow_id` uuid, `job_id` uuid, `client_account_id` uuid, `lead_id` uuid, `status` text, `step` text, `error` text, `started_at` timestamp with time zone, `finished_at` timestamp with time zone | `automation_runs_read` (SELECT) |
| `automation_workflows` | on | `id` uuid, `name` text, `trigger_type` text, `trigger_config` jsonb, `actions` jsonb, `is_active` boolean, `enrolled_count` integer, `completed_count` integer, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `client_account_id` uuid, `template_key` text | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `billing_packages` | on | `id` uuid, `name` text, `description` text, `price_monthly` numeric(10,2), `price_yearly` numeric(10,2), `features` jsonb, `is_active` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `billing_plans` | on | `id` uuid, `name` text, `description` text, `base_monthly_cost` numeric(12,2), `included_minutes` integer, `included_sms` integer, `overage_minute_cost` numeric(12,4), `overage_sms_cost` numeric(12,4), `features` jsonb, `is_active` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `stripe_product_id` text, `stripe_price_id` text, `currency` text, `billing_interval` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `billing_records` | on | `id` uuid, `org_id` uuid, `user_id` uuid, `type` text, `description` text, `amount` numeric(10,2), `currency` text, `stripe_customer_id` text, `stripe_payment_intent_id` text, `stripe_subscription_id` text, `status` text, `billable_start` timestamp with time zone, `billable_end` timestamp with time zone, `paid_at` timestamp with time zone, `metadata` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `stripe_checkout_session_id` text, `stripe_invoice_id` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `booking_appointments` | on | `id` uuid, `event_type_id` uuid, `guest_name` text, `guest_email` text, `guest_phone` text, `guest_company` text, `start_at` timestamp with time zone, `end_at` timestamp with time zone, `timezone` text, `status` text, `notes` text, `answers` jsonb, `meeting_link` text, `cancel_reason` text, `lead_id` uuid, `reminder_sent_at` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `client_account_id` uuid | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `call_events` | on | `id` uuid, `org_id` uuid, `external_event_id` text, `external_call_id` text, `event_type` text, `event_at` timestamp with time zone, `agent_extension` text, `direction` text, `from_number` text, `to_number` text, `raw_payload` jsonb, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `call_history` | on | `id` uuid, `org_id` uuid, `external_id` text, `from_number` text, `to_number` text, `direction` text, `status` text, `duration_seconds` integer, `call_date` timestamp with time zone, `recording_url` text, `metadata` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `call_intelligence` | on | `id` uuid, `org_id` uuid, `external_call_id` text, `recording_id` text, `transcript` text, `transcript_status` text, `notes` text, `disposition` text, `quality_score` numeric(5,2), `quality_breakdown` jsonb, `searchable_text` tsvector, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `call_outcome_stage_mappings` | on | `id` uuid, `organization_id` uuid, `outcome` text, `target_stage_id` uuid, `enabled` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `call_recordings` | on | `id` uuid, `org_id` uuid, `phone_number_id` uuid, `call_id` text, `recording_date` timestamp with time zone, `duration_seconds` integer, `recording_url` text, `data` jsonb, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `call_reports` | on | `id` uuid, `org_id` uuid, `phone_number_id` uuid, `report_type` text, `report_date` date, `total_calls` integer, `answered_calls` integer, `avg_wait_seconds` numeric(10,2), `data` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `client_account_id` uuid | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `call_transfers` | on | `id` uuid, `org_id` uuid, `external_transfer_id` text, `external_call_id` text, `transfer_type` text, `transfer_target` text, `result` text, `agent_extension` text, `original_caller` text, `original_receiving_number` text, `direction` text, `transferred_at` timestamp with time zone, `raw_payload` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `extension` text, `from_number` text, `to_number` text, `business_number` text, `transfer_status` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `calls` | on | `id` uuid, `agent_id` uuid, `client_id` uuid, `date` date, `duration_seconds` integer, `result` text, `satisfaction_score` integer, `revenue_generated` numeric, `is_missed` boolean, `first_call_resolution` boolean, `talk_time_seconds` integer, `listen_time_seconds` integer, `created_at` timestamp with time zone, `started_at` timestamp with time zone, `duration_sec` integer, `csat` numeric, `revenue` numeric(12,2), `talk_sec` integer, `listen_sec` integer, `provider` text, `provider_call_id` text, `direction` text, `from_number` text, `to_number` text, `queue_or_number` text, `campaign_id` text, `recording_url` text, `is_sale` boolean, `week_start` date, `month_start` date, `status` text, `metadata` jsonb, `queue_name` text, `org_id` uuid, `answered_at` timestamp with time zone, `ended_at` timestamp with time zone, `to_number_digits` text, `agent_extension` text, `from_number_digits` text, `external_id` text, `external_call_id` text, `org_member_id` uuid, `mightycall_user_id` text, `extension` text, `business_number` text, `connected_at` timestamp with time zone, `wait_seconds` integer, `has_recording` boolean, `raw_payload` jsonb | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `calls_raw` | on | `id` bigint, `received_at` timestamp with time zone, `payload` jsonb, `provider` text, `provider_call_id` text, `direction` text, `status` text, `duration_seconds` integer, `from_number` text, `to_number` text, `client_id` text, `from_number_digits` text, `to_number_digits` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `campaign_leads` | on | `campaign_id` uuid, `lead_id` uuid, `status` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `campaigns` | on | `id` uuid, `name` text, `description` text, `status` text, `source_type` text, `subject` text, `from_name` text, `from_email` text, `body` text, `send_rate_per_hour` integer, `daily_limit` integer, `send_window_start` text, `send_window_end` text, `scheduled_at` timestamp with time zone, `launched_at` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `client_automation_jobs` | on | `id` uuid, `client_account_id` uuid, `lead_id` uuid, `kind` text, `source_id` text, `payload` jsonb, `status` text, `run_at` timestamp with time zone, `attempts` integer, `last_error` text, `sent_at` timestamp with time zone, `claimed_at` timestamp with time zone, `created_at` timestamp with time zone, `workflow_id` uuid | `client_automation_jobs_admin` (SELECT) |
| `client_call_details` | on | `id` uuid, `client_account_id` uuid, `external_call_id` text, `lead_id` uuid, `occurred_at` timestamp with time zone, `caller_number` text, `business_number` text, `status` text, `direction` text, `duration_seconds` integer, `recording_url` text, `agent_name` text, `outcome` text, `summary` text, `booked` boolean, `updated_at` timestamp with time zone | `client_call_details_read` (SELECT) |
| `client_lead_events` | on | `id` uuid, `client_account_id` uuid, `lead_id` uuid, `event_type` text, `body` text, `metadata` jsonb, `actor_id` uuid, `created_at` timestamp with time zone | `client_lead_events_read` (SELECT) |
| `client_package_templates` | **OFF** | `package` text, `onboarding_tasks` jsonb, `workflows` jsonb, `created_at` timestamp with time zone | none |
| `client_usage_alerts` | on | `id` uuid, `client_account_id` uuid, `month` date, `threshold` integer, `minutes_used` integer, `minutes_included` integer, `sent_at` timestamp with time zone, `created_at` timestamp with time zone | `client_usage_alerts_read` (SELECT) |
| `clients` | on | `id` uuid, `name` text, `email` text, `logo_url` text, `plan` text, `join_date` date, `slug` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `companies` | on | `id` uuid, `name` text, `phone` text, `city` text, `state` text, `industry` text, `contact_name` text, `fit_notes` text, `source` text, `stage` text, `needs_verification` boolean, `trial_type` text, `trial_start_date` date, `trial_end_date` date, `trial_capacity_slot` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `email` text, `website` text, `address` text, `postal_code` text, `country` text, `tags` text[], `contacts` jsonb, `custom_fields` jsonb, `next_action` text, `next_follow_up_at` timestamp with time zone, `coverage_hours` text, `coverage_timezone` text, `expected_daily_leads` integer, `trial_success_criteria` text, `trial_results` text, `proposed_monthly_price` numeric(14,2), `currency` text, `close_call_at` timestamp with time zone, `close_notes` text, `deleted_at` timestamp with time zone, `meeting_at` timestamp with time zone, `meeting_timezone` text, `meeting_booked_by` uuid, `meeting_booked_at` timestamp with time zone, `updated_by` uuid | `crm_company_admin_claim` (ALL), `crm_company_admin_guard` (ALL), `workforce_legacy_admin` (ALL) |
| `company_activities` | on | `id` uuid, `company_id` uuid, `direction` text, `outcome` text, `response_time_minutes` double precision, `notes` text, `occurred_at` timestamp with time zone, `logged_by` uuid, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `company_files` | on | `id` uuid, `company_id` uuid, `file_name` text, `storage_path` text, `mime_type` text, `size_bytes` integer, `uploaded_by` uuid, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `company_tasks` | on | `id` uuid, `company_id` uuid, `title` text, `kind` text, `status` text, `priority` text, `due_at` timestamp with time zone, `assignee` text, `notes` text, `created_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `client_account_id` uuid, `template_key` text | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `connected_account_secrets` | on | `connected_account_id` uuid, `encrypted_access_token` text, `encrypted_refresh_token` text, `updated_at` timestamp with time zone, `vault_access_token_id` uuid, `vault_refresh_token_id` uuid | none |
| `connected_accounts` | on | `id` uuid, `organization_id` uuid, `platform` text, `label` text, `external_account_id` text, `username` text, `scopes` text[], `status` text, `token_expires_at` timestamp with time zone, `daily_new_dm_cap` integer, `daily_followup_cap` integer, `warmup_enabled` boolean, `warmup_start_at` timestamp with time zone, `warmup_daily_increment` integer, `last_webhook_at` timestamp with time zone, `last_error` text, `created_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `display_platform` text, `profile_url` text, `connection_mode` text, `owner_user_id` uuid, `provider` text, `timezone` text, `health` text, `last_sync_at` timestamp with time zone, `consent_signed_at` timestamp with time zone, `consent_version` text, `connected_handle` text, `connected_provider_user_id` text | `connected_accounts_admin` (ALL), `connected_accounts_rep_read` (SELECT) |
| `consultation_requests` | on | `id` uuid, `full_name` text, `business_name` text, `email` text, `phone` text, `industry` text, `interested_in` text[], `website` text, `notes` text, `best_time` text, `heard_about` text, `created_at` timestamp with time zone, `utm_source` text, `utm_medium` text, `utm_campaign` text, `utm_content` text, `utm_term` text, `referrer` text, `landing_path` text, `calls_per_week` integer, `missed_rate` numeric, `avg_job_value` numeric, `close_rate` numeric, `missed_calls_month` integer, `lost_jobs_month` integer, `lost_revenue_month` numeric, `lost_revenue_year` numeric, `source` text | none |
| `contact_events` | on | `id` uuid, `org_id` uuid, `external_id` text, `name` text, `phone_numbers` text[], `email` text, `event_type` text, `event_date` timestamp with time zone, `metadata` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `contact_tasks` | on | `id` uuid, `lead_id` uuid, `title` text, `description` text, `due_date` timestamp with time zone, `is_completed` boolean, `completed_at` timestamp with time zone, `priority` text, `created_at` timestamp with time zone, `outreach_enrollment_id` text, `outreach_job_id` uuid, `outreach_step_number` integer, `outreach_status` text, `client_account_id` uuid, `automation_job_id` uuid | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `conversations` | on | `id` uuid, `organization_id` uuid, `channel` text, `connected_account_id` uuid, `external_thread_id` text, `participant_platform_id` text, `participant_handle` text, `contact_id` uuid, `company_id` uuid, `lead_id` uuid, `status` text, `assigned_to` uuid, `intent` text, `unread_count` integer, `last_inbound_at` timestamp with time zone, `last_outbound_at` timestamp with time zone, `last_message_at` timestamp with time zone, `reply_window_expires_at` timestamp with time zone, `snoozed_until` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `legacy_company_id` uuid, `match_status` text, `match_confidence` numeric(4,3), `matched_at` timestamp with time zone, `matched_by_user_id` uuid, `suggested_lead_id` uuid, `participant_name` text, `participant_profile_url` text, `client_account_id` uuid | `client_tenancy_guard` (ALL), `conversations_admin` (ALL), `conversations_rep_read` (SELECT) |
| `count_events` | on | `id` uuid, `shift_id` uuid, `lead_type` text, `metric_key` text, `delta` integer, `actor_id` uuid, `reason` text, `created_at` timestamp with time zone | `count_events_caller_read` (SELECT) |
| `crm_activities` | on | `id` uuid, `organization_id` uuid, `company_id` uuid, `contact_id` uuid, `deal_id` uuid, `type` text, `body` text, `occurred_at` timestamp with time zone, `created_by` uuid, `metadata` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `crm_companies` | on | `id` uuid, `organization_id` uuid, `name` text, `phone` text, `city` text, `state` text, `industry` text, `source` text, `notes` text, `tags` text[], `custom_fields` jsonb, `created_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `website` text, `domain` text, `google_place_id` text, `google_maps_url` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `crm_contacts` | on | `id` uuid, `organization_id` uuid, `company_id` uuid, `source_lead_id` uuid, `first_name` text, `last_name` text, `title` text, `phone` text, `email` text, `tags` text[], `custom_fields` jsonb, `created_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `crm_deals` | on | `id` uuid, `organization_id` uuid, `company_id` uuid, `primary_contact_id` uuid, `stage_id` uuid, `title` text, `next_action` text, `assigned_to` uuid, `source_lead_id` uuid, `custom_fields` jsonb, `stage_changed_at` timestamp with time zone, `created_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `crm_import_jobs` | on | `id` uuid, `organization_id` uuid, `object_type` text, `file_name` text, `status` text, `total_rows` integer, `inserted_rows` integer, `skipped_rows` integer, `error_rows` jsonb, `created_by` uuid, `created_at` timestamp with time zone, `completed_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `crm_pipeline_stages` | on | `id` uuid, `organization_id` uuid, `name` text, `position` integer, `color` text, `is_closed` boolean, `is_won` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `crm_saved_views` | on | `id` uuid, `organization_id` uuid, `user_id` uuid, `object_type` text, `name` text, `filters` jsonb, `is_default` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `crm_tasks` | on | `id` uuid, `organization_id` uuid, `company_id` uuid, `contact_id` uuid, `deal_id` uuid, `title` text, `description` text, `due_date` timestamp with time zone, `completed` boolean, `completed_at` timestamp with time zone, `assigned_to` uuid, `created_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `dispositions` | on | `id` integer, `name` text, `color` text, `is_active` boolean, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `dm_campaign_steps` | on | `id` uuid, `organization_id` uuid, `campaign_id` uuid, `position` integer, `day_offset` integer, `channel` text, `step_type` text, `template_id` uuid, `created_at` timestamp with time zone | `dm_campaign_steps_admin` (ALL) |
| `dm_campaigns` | on | `id` uuid, `organization_id` uuid, `name` text, `status` text, `created_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `dm_campaigns_admin` (ALL) |
| `dm_enrollments` | on | `id` uuid, `organization_id` uuid, `campaign_id` uuid, `entity_type` text, `entity_id` uuid, `connected_account_id` uuid, `state` text, `current_step` integer, `enrolled_at` timestamp with time zone, `next_due_at` timestamp with time zone, `stopped_at` timestamp with time zone, `stop_reason` text, `created_by` uuid | `dm_enrollments_admin` (ALL) |
| `dm_tasks` | on | `id` uuid, `organization_id` uuid, `enrollment_id` uuid, `step_id` uuid, `connected_account_id` uuid, `due_at` timestamp with time zone, `status` text, `acted_at` timestamp with time zone, `acted_by` uuid, `message_id` uuid, `created_at` timestamp with time zone, `task_kind` text, `rendered_text` text, `completed_via` text, `skip_reason` text | `dm_tasks_admin` (ALL), `dm_tasks_rep_read` (SELECT) |
| `dm_templates` | on | `id` uuid, `organization_id` uuid, `name` text, `body` text, `allow_spintax` boolean, `created_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `dm_templates_admin` (ALL) |
| `email_accounts` | on | `id` uuid, `from_name` text, `from_email` text, `smtp_host` text, `smtp_port` integer, `smtp_user` text, `smtp_password` text, `is_default` boolean, `daily_limit` integer, `sent_today` integer, `last_sent_reset_at` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `sending_domain_id` uuid, `provider` text, `daily_cap` integer, `mailbox_timezone` text, `warmup_started_at` timestamp with time zone, `status` outreach_mailbox_status, `email_engine_enabled` boolean, `rotation_credit` numeric, `next_send_after` timestamp with time zone, `inbound_provider` text, `inbound_credentials` text, `inbox_configured_at` timestamp with time zone, `inbox_checked_at` timestamp with time zone, `inbox_cursor` jsonb, `inbox_poll_after` timestamp with time zone, `inbox_poll_token` uuid, `inbox_locked_at` timestamp with time zone, `smtp_monitoring_mode` text, `signature` text, `label` text, `warmup_daily_cap` integer, `archived_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `email_logs` | on | `id` uuid, `lead_id` uuid, `email_account_id` uuid, `sequence_id` uuid, `sequence_step_id` uuid, `to_email` text, `from_email` text, `subject` text, `body` text, `status` text, `opened_at` timestamp with time zone, `replied_at` timestamp with time zone, `sent_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `email_templates` | on | `id` uuid, `name` text, `subject` text, `body` text, `preview_text` text, `category` text, `tags` jsonb, `is_default` boolean, `use_count` integer, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `enrichment_api_log` | on | `id` uuid, `provider` text, `lead_id` uuid, `request` jsonb, `status` text, `cost_usd` numeric(12,6), `created_at` timestamp with time zone | none |
| `enrichment_api_usage` | on | `provider` text, `month` date, `calls` integer, `blocked_until` date | none |
| `enrichment_job_items` | on | `job_id` uuid, `lead_id` uuid, `status` text, `attempts` integer, `cost_usd` numeric(12,6), `error` text, `next_attempt_at` timestamp with time zone, `updated_at` timestamp with time zone | none |
| `enrichment_jobs` | on | `id` uuid, `segment_id` uuid, `lead_ids` uuid[], `mode` text, `grid` integer, `status` text, `total` integer, `done` integer, `failed` integer, `cost_usd` numeric(12,6), `max_cost_usd` numeric(12,4), `created_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `finished_at` timestamp with time zone | none |
| `enrichment_settings` | on | `id` boolean, `enrichment_budget_usd` numeric(12,4), `local_falcon_api_key` text, `updated_at` timestamp with time zone | none |
| `enrichment_spend` | on | `month` date, `reserved_usd` numeric(12,6) | none |
| `error_logs` | on | `id` uuid, `user_id` uuid, `organization_id` uuid, `session_id` text, `error_type` text, `error_message` text, `error_stack` text, `endpoint` text, `http_status` integer, `request_payload` jsonb, `ip_address` text, `user_agent` text, `resolved` boolean, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `form_rate_limits` | on | `form_id` uuid, `ip_hash` text, `window_started_at` timestamp with time zone, `attempts` integer | none |
| `form_submissions` | on | `id` uuid, `form_id` uuid, `lead_id` uuid, `data` jsonb, `source_url` text, `created_at` timestamp with time zone, `organization_id` uuid, `submission_key` text, `status` text, `utm` jsonb, `landing_page_id` uuid, `marketing_page_id` uuid, `client_account_id` uuid | `client_tenancy_guard` (ALL), `marketing_submissions_admin` (SELECT), `marketing_submissions_internal_boundary` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `forms` | on | `id` uuid, `name` text, `description` text, `status` text, `campaign_id` uuid, `fields` jsonb, `success_message` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `organization_id` uuid, `slug` text, `submit_button_text` text, `redirect_url` text, `settings` jsonb, `client_account_id` uuid, `template_key` text | `client_tenancy_guard` (ALL), `marketing_forms_admin` (ALL), `marketing_forms_internal_boundary` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `goals` | on | `id` uuid, `client_id` uuid, `kpi_name` text, `target_value` numeric, `period` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `hubspot_sync_log` | on | `id` bigint, `lead_id` uuid, `email` text, `request_id` bigint, `status` text, `http_status` integer, `error` text, `created_at` timestamp with time zone, `checked_at` timestamp with time zone | none |
| `integration_alerts` | on | `id` uuid, `org_id` uuid, `provider` text, `alert_type` text, `severity` text, `status` text, `message` text, `metadata` jsonb, `first_seen_at` timestamp with time zone, `last_seen_at` timestamp with time zone, `acknowledged_at` timestamp with time zone, `resolved_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `integration_health_snapshots` | on | `id` uuid, `org_id` uuid, `provider` text, `credentials_ok` boolean, `webhook_ok` boolean, `calls_sync_ok` boolean, `recordings_sync_ok` boolean, `last_webhook_at` timestamp with time zone, `last_call_sync_at` timestamp with time zone, `last_recording_sync_at` timestamp with time zone, `last_error_code` text, `metrics` jsonb, `checked_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `integration_quarantine` | on | `id` uuid, `dedupe_key` text, `integration_type` text, `source_org_id` uuid, `external_id` text, `detected_numbers` text[], `candidate_org_ids` uuid[], `reason` text, `raw_payload` jsonb, `repaired_at` timestamp with time zone, `repair_note` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `integration_sync_jobs` | on | `id` uuid, `job_type` text, `status` text, `started_at` timestamp with time zone, `completed_at` timestamp with time zone, `records_processed` integer, `error_message` text, `created_at` timestamp with time zone, `org_id` uuid, `integration_type` text, `metadata` jsonb | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `integrations` | on | `id` uuid, `type` text, `name` text, `account_identifier` text, `status` text, `config` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `invite_codes` | on | `id` uuid, `code_hash` text, `email` text, `name` text, `role` text, `team_member_id` uuid, `created_by` text, `used_by_user_id` text, `used_at` timestamp with time zone, `expires_at` timestamp with time zone, `created_at` timestamp with time zone, `client_account_id` uuid, `org_id` uuid | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `invite_verification_codes` | on | `id` uuid, `org_id` uuid, `email` text, `invite_id` uuid, `code_hash` text, `expires_at` timestamp with time zone, `consumed_at` timestamp with time zone, `attempts` integer, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `invoice_items` | on | `id` uuid, `invoice_id` uuid, `description` text, `quantity` integer, `unit_price` numeric(10,2), `total_price` numeric(10,2), `metadata` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `client_account_id` uuid | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `invoice_line_items` | on | `id` uuid, `invoice_id` uuid, `description` text, `service_code` text, `quantity` numeric(10,2), `unit_price` numeric(12,2), `line_total` numeric(12,2), `metadata` jsonb, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `invoices` | on | `id` uuid, `org_id` uuid, `invoice_number` text, `billing_period` daterange, `subtotal` numeric(10,2), `tax` numeric(10,2), `total` numeric(10,2), `currency` text, `status` text, `stripe_invoice_id` text, `stripe_customer_id` text, `issued_at` timestamp with time zone, `due_at` timestamp with time zone, `paid_at` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `stripe_subscription_id` text, `stripe_checkout_session_id` text, `stripe_payment_intent_id` text, `stripe_hosted_invoice_url` text, `stripe_invoice_pdf` text, `amount_due` numeric(12,2), `amount_paid` numeric(12,2), `client_account_id` uuid | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `landing_page_events` | on | `id` bigint, `organization_id` uuid, `landing_page_id` uuid, `event_type` text, `referrer_domain` text, `utm` jsonb, `created_at` timestamp with time zone, `client_account_id` uuid, `variant_page_id` uuid | `client_tenancy_guard` (ALL), `marketing_page_events_admin` (SELECT) |
| `landing_page_versions` | on | `id` uuid, `page_id` uuid, `version` integer, `sections` jsonb, `theme` jsonb, `published_by` uuid, `published_at` timestamp with time zone, `note` text | `landing_page_versions_read` (SELECT), `landing_page_versions_write` (ALL) |
| `landing_pages` | on | `id` uuid, `organization_id` uuid, `name` text, `slug` text, `status` text, `sections` jsonb, `theme` jsonb, `seo_title` text, `seo_description` text, `form_id` uuid, `visits` bigint, `published_at` timestamp with time zone, `created_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `client_account_id` uuid, `draft_sections` jsonb, `draft_theme` jsonb, `published_sections` jsonb, `published_theme` jsonb, `template_key` text, `custom_domain` text, `subdomain` text, `tracking` jsonb, `social_image_url` text, `variant_of` uuid, `traffic_split` integer, `version` integer | `client_tenancy_guard` (ALL), `marketing_pages_admin` (ALL) |
| `lead_duplicates` | on | `id` uuid, `phone` text, `source_lead_id` text, `received_at` timestamp with time zone, `original_lead_id` uuid, `raw_payload` jsonb, `source` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `lead_enrichment` | on | `id` uuid, `lead_id` uuid, `source` text, `data` jsonb, `status` text, `error` text, `cost_usd` numeric(12,6), `fetched_at` timestamp with time zone, `expires_at` timestamp with time zone | none |
| `lead_list_uploads` | on | `id` uuid, `uploaded_by` uuid, `organization_id` uuid, `assigned_agent_id` uuid, `row_count` integer, `inserted_count` integer, `failed_count` integer, `status` text, `created_at` timestamp with time zone, `completed_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `lead_routing_events` | on | `id` uuid, `lead_id` uuid, `qualification_result_id` uuid, `assigned_agent` text, `assigned_agent_id` text, `hubspot_synced` boolean, `hubspot_error` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `lead_sources` | on | `id` uuid, `source_name` text, `campaign_id` text, `organization_id` uuid, `lead_type` text, `active` boolean, `created_at` timestamp with time zone, `campaign_name` text, `source_label` text, `description` text, `routing_priority` integer, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `lead_types` | on | `key` text, `label` text, `cadence_days` integer | `lead_types_admin` (ALL), `lead_types_public_read` (SELECT), `lead_types_read` (SELECT) |
| `leads` | on | `id` uuid, `organization_id` uuid, `first_name` text, `last_name` text, `phone` text, `email` text, `state` text, `debt_amount` numeric, `lead_type` text, `opt_in_source` text, `ip_address` text, `tcpa_consent` boolean, `tcpa_timestamp` timestamp with time zone, `status` text, `assigned_agent_id` uuid, `assigned_at` timestamp with time zone, `contacted_at` timestamp with time zone, `transferred_at` timestamp with time zone, `call_attempts` integer, `notes` text, `source` text, `source_lead_id` text, `raw_payload` jsonb, `received_at` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `trusted_id` text, `form_number` text, `lead_source_id` uuid, `campaign_id` text, `campaign_name` text, `lead_list_upload_id` uuid, `company` text, `title` text, `score` integer, `form_id` uuid, `pipeline_stage_id` uuid, `tags` text[], `custom_fields` jsonb, `disposition` outreach_disposition, `contact_attempts` integer, `client_account_id` uuid, `ai_campaign_id` uuid, `ai_resolution` text, `hubspot_contact_id` text, `qualification_score` numeric(5,2), `qualified_at` timestamp with time zone, `timezone` outreach_timezone, `timezone_confirmed` boolean, `next_action_at` timestamp with time zone, `attempt_count` integer, `first_attempt_at` timestamp with time zone, `revisit_at` timestamp with time zone, `dnc` boolean, `suppressed_reason` outreach_suppression_reason, `normalized_email` text, `normalized_phone` text, `avg_job_value` numeric(14,2), `missed_calls_per_week` integer, `after_hours_coverage` text, `uses_answering_service` boolean, `email_verification_status` outreach_verification_status, `verified_at` timestamp with time zone, `verified_email` text, `meeting_at` timestamp with time zone, `meeting_timezone` text, `meeting_booked_by` uuid, `meeting_booked_at` timestamp with time zone, `updated_by` uuid, `owner_rep_id` uuid, `outreach_platform` text, `outreach_account_id` uuid, `owner_assigned_at` timestamp with time zone, `first_touch_at` timestamp with time zone, `last_touch_at` timestamp with time zone, `first_reply_at` timestamp with time zone | `client_tenancy_guard` (ALL), `crm_lead_delete` (DELETE), `crm_lead_delete_guard` (DELETE), `crm_lead_insert` (INSERT), `crm_lead_insert_guard` (INSERT), `crm_lead_read` (SELECT), `crm_lead_read_guard` (SELECT), `crm_lead_update` (UPDATE), `crm_lead_update_guard` (UPDATE) |
| `live_agent_presence` | on | `org_id` uuid, `user_id` uuid, `extension` text, `email` text, `display_name` text, `on_call` boolean, `status` text, `counterpart` text, `started_at` timestamp with time zone, `source` text, `raw_status` text, `last_seen_at` timestamp with time zone, `refreshed_at` timestamp with time zone, `stale_after` timestamp with time zone, `sync_version` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `live_agent_statuses` | on | `id` uuid, `org_id` uuid, `org_member_id` uuid, `mightycall_user_id` text, `agent_name` text, `extension` text, `status` text, `raw_status` text, `direction` text, `current_call_id` text, `from_number` text, `to_number` text, `business_number` text, `started_at` timestamp with time zone, `connected_at` timestamp with time zone, `last_seen_at` timestamp with time zone, `raw_payload` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `marketing_landing_page_events` | on | `id` uuid, `page_id` uuid, `event_type` text, `created_at` timestamp with time zone, `client_account_id` uuid, `legacy_event_id` bigint | `client_tenancy_guard` (ALL) |
| `marketing_landing_pages` | on | `id` uuid, `title` text, `slug` text, `status` text, `seo_description` text, `sections` jsonb, `theme` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `client_account_id` uuid, `canonical_page_id` uuid, `organization_id` uuid, `template_key` text | `client_tenancy_guard` (ALL) |
| `mcp_audit_log` | on | `id` bigint, `occurred_at` timestamp with time zone, `user_id` uuid, `email` text, `client_id` text, `tool` text, `arguments` jsonb, `rows_affected` bigint, `result_status` text, `error_message` text | none |
| `mcp_deleted_backup` | on | `id` bigint, `created_at` timestamp with time zone, `user_id` uuid, `audit_id` bigint, `source_table` text, `source_pk` jsonb, `row_data` jsonb | none |
| `mcp_oauth_clients` | on | `client_id` text, `client_name` text, `redirect_uris` text[], `created_at` timestamp with time zone | none |
| `mcp_oauth_codes` | on | `code_hash` text, `client_id` text, `user_id` uuid, `email` text, `redirect_uri` text, `code_challenge` text, `resource` text, `expires_at` timestamp with time zone, `used_at` timestamp with time zone | none |
| `mcp_oauth_tokens` | on | `id` uuid, `access_token_hash` text, `refresh_token_hash` text, `client_id` text, `user_id` uuid, `email` text, `resource` text, `access_expires_at` timestamp with time zone, `refresh_expires_at` timestamp with time zone, `revoked_at` timestamp with time zone, `window_started_at` timestamp with time zone, `window_count` integer, `created_at` timestamp with time zone | none |
| `meeting_appointments` | on | `id` uuid, `event_type_id` uuid, `guest_name` text, `guest_email` text, `guest_phone` text, `guest_company` text, `start_at` timestamp with time zone, `end_at` timestamp with time zone, `timezone` text, `status` text, `notes` text, `answers` jsonb, `meeting_link` text, `cancel_reason` text, `lead_id` uuid, `reminder_sent_at` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `meeting_event_types` | on | `id` uuid, `slug` text, `title` text, `description` text, `duration_minutes` integer, `color` text, `location` text, `is_active` boolean, `requires_confirmation` boolean, `buffer_before` integer, `buffer_after` integer, `max_bookings_per_day` integer, `questions` jsonb, `available_days` text[], `available_start` text, `available_end` text, `timezone` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `memberships` | on | `id` bigint, `user_id` uuid, `org_id` uuid, `role` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `messages` | on | `id` uuid, `organization_id` uuid, `conversation_id` uuid, `direction` text, `body` text, `attachments` jsonb, `external_message_id` text, `sent_via` text, `sent_by` uuid, `status` text, `error` text, `created_at` timestamp with time zone, `sender_provider_id` text, `template_id` uuid, `variant_key` text, `task_id` uuid, `enrollment_id` uuid, `matched_by` text, `client_account_id` uuid | `client_tenancy_guard` (ALL), `messages_admin` (ALL), `messages_rep_read` (SELECT) |
| `metrics` | on | `key` text, `label` text, `kind` text, `counts_as_touch` boolean, `is_primary` boolean, `sort_order` integer, `active` boolean | `metrics_admin` (ALL), `metrics_public_read` (SELECT), `metrics_read` (SELECT) |
| `mightycall_call_logs` | on | `id` uuid, `org_id` uuid, `external_id` text, `from_number` text, `to_number` text, `from_number_digits` text, `to_number_digits` text, `started_at` timestamp with time zone, `answered_at` timestamp with time zone, `ended_at` timestamp with time zone, `duration_seconds` integer, `status` text, `direction` text, `queue_name` text, `agent_extension` text, `metadata` jsonb, `raw_payload` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `mightycall_extensions` | on | `id` uuid, `extension` text, `external_id` text, `display_name` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `mightycall_recordings` | on | `id` uuid, `org_id` uuid, `phone_number_id` uuid, `call_id` uuid, `recording_url` text, `duration_seconds` integer, `recording_date` timestamp with time zone, `metadata` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `from_number` text, `to_number` text, `external_call_id` text, `external_recording_id` text, `org_member_id` uuid, `mightycall_user_id` text, `extension` text, `direction` text, `business_number` text, `raw_payload` jsonb, `external_id` text, `recorded_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `mightycall_reports` | on | `id` uuid, `org_id` uuid, `phone_number_id` uuid, `report_type` text, `report_date` date, `data` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `client_account_id` uuid | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `mightycall_sms_messages` | on | `id` uuid, `org_id` uuid, `phone_id` uuid, `external_id` text, `external_sms_id` text, `from_number` text, `to_number` text, `sender` text, `recipient` text, `direction` text, `status` text, `message` text, `body` text, `message_date` timestamp with time zone, `sent_at` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `message_text` text, `metadata` jsonb, `external_message_id` text, `business_number` text, `raw_payload` jsonb, `client_account_id` uuid | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `mightycall_webhook_inbox` | on | `id` uuid, `provider_event_id` text, `org_id` uuid, `event_type` text, `external_call_id` text, `extension` text, `occurred_at` timestamp with time zone, `payload_encrypted` text, `status` text, `attempts` integer, `error_code` text, `next_attempt_at` timestamp with time zone, `processed_at` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `caller_number` text, `business_number` text, `call_status` text, `call_direction` text, `client_route_attempted_at` timestamp with time zone, `client_routed_at` timestamp with time zone, `client_account_id` uuid | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `notes` | on | `id` uuid, `lead_id` uuid, `content` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `notification_outbox` | on | `id` uuid, `organization_id` uuid, `channel` text, `slack_target` text, `payload` jsonb, `dedupe_key` text, `status` text, `attempts` integer, `next_attempt_at` timestamp with time zone, `sent_at` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | none |
| `notification_preferences` | on | `user_id` uuid, `org_id` uuid, `email` text, `billing_emails` boolean, `payment_emails` boolean, `account_emails` boolean, `organization_emails` boolean, `dashboard_update_emails` boolean, `lead_emails` boolean, `support_emails` boolean, `sync_emails` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `onboarding_progress` | on | `id` uuid, `sub_account_id` uuid, `completed_steps` text[], `current_step` text, `is_completed` boolean, `completed_at` timestamp with time zone, `metadata` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `org_api_keys` | on | `id` uuid, `org_id` uuid, `key_hash` text, `label` text, `created_by` uuid, `created_at` timestamp with time zone, `last_used_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `org_billing_locks` | on | `org_id` uuid, `locked` boolean, `reason` text, `locked_by` uuid, `locked_until` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `org_feature_access` | on | `id` uuid, `org_id` uuid, `feature_key` text, `enabled` boolean, `visible_to_roles` text[], `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `org_integrations` | on | `id` uuid, `org_id` uuid, `provider` text, `encrypted_credentials` text, `metadata` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `org_invites` | on | `id` uuid, `org_id` uuid, `email` text, `role` text, `invited_by` uuid, `invited_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `org_manager_permissions` | on | `id` uuid, `org_member_id` uuid, `can_manage_agents` boolean, `can_manage_phone_numbers` boolean, `can_edit_service_targets` boolean, `can_view_billing` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `org_members` | on | `id` uuid, `org_id` uuid, `user_id` uuid, `role` text, `mightycall_extension` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `org_numbers` | on | `id` bigint, `org_id` uuid, `phone_number` text, `label` text, `provider` text, `is_active` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `org_packages` | on | `id` uuid, `org_id` uuid, `package_id` uuid, `status` text, `current_period_start` timestamp with time zone, `current_period_end` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `org_phone_numbers` | on | `id` uuid, `org_id` uuid, `phone_number` text, `label` text, `is_active` boolean, `created_at` timestamp with time zone, `phone_number_id` uuid | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `org_settings` | on | `org_id` uuid, `service_level_target_seconds` integer, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `org_subscriptions` | on | `id` uuid, `org_id` uuid, `plan_id` uuid, `status` text, `billing_cycle_day` integer, `next_billing_date` date, `auto_renew` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `stripe_customer_id` text, `stripe_subscription_id` text, `stripe_price_id` text, `stripe_checkout_session_id` text, `current_period_start` timestamp with time zone, `current_period_end` timestamp with time zone, `cancel_at_period_end` boolean, `seats` integer, `metadata` jsonb | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `org_users` | on | `id` bigint, `org_id` uuid, `user_id` uuid, `role` org_role, `mightycall_extension` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `organizations` | on | `id` uuid, `name` text, `created_at` timestamp with time zone, `leads_visibility` jsonb, `settings` jsonb | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_audit` | on | `id` bigint, `lead_id` text, `actor` text, `reason` text, `details` jsonb, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_call_outcomes` | on | `call_id` bigint, `connected` boolean, `conversation` boolean, `meeting_held_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_delivery_reports` | on | `mailbox_id` text, `event_id` text, `matched` integer, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_email_alerts` | on | `id` bigint, `mailbox_id` text, `reason` text, `created_at` timestamp with time zone, `acknowledged_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_email_events` | on | `provider` text, `event_id` text, `job_id` uuid, `type` text, `received_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_email_jobs` | on | `id` uuid, `lead_id` uuid, `mailbox_id` uuid, `enrollment_id` text, `to_email` text, `phone_snapshot` text, `subject` text, `body` text, `state` text, `not_before` timestamp with time zone, `dispatched_at` timestamp with time zone, `sent_at` timestamp with time zone, `mailbox_day` date, `global_day` date, `provider_message_id` text, `claim_token` uuid, `unsubscribe_hash` text, `unsubscribe_token` text, `failure_reason` text, `created_at` timestamp with time zone, `sequence_step_number` integer, `rfc_message_id` text, `operator_verification_override` boolean, `campaign_id` uuid | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_email_legacy_mailboxes` | on | `mailbox_id` text, `daily_limit` integer, `sent_today` integer, `last_sent_reset_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_email_settings` | on | `id` boolean, `engine_enabled` boolean, `global_daily_cap` integer, `reset_timezone` text, `primary_domains` text[], `direct_link_domains` text[] | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_events` | on | `id` bigint, `organization_id` uuid, `occurred_at` timestamp with time zone, `rep_user_id` uuid, `connected_account_id` uuid, `platform` text, `campaign_id` uuid, `step_id` uuid, `template_id` uuid, `variant_key` text, `lead_id` uuid, `company_id` uuid, `conversation_id` uuid, `enrollment_id` uuid, `task_id` uuid, `event_type` text, `value_cents` bigint, `source_key` text, `metadata` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `outreach_events_admin` (SELECT), `outreach_events_rep` (SELECT) |
| `outreach_inbound_messages` | on | `id` uuid, `mailbox_id` text, `provider_id` text, `from_email` text, `from_domain` text, `subject` text, `body` text, `received_at` timestamp with time zone, `recorded_at` timestamp with time zone, `is_auto_reply` boolean, `return_at` timestamp with time zone, `positive_reply` boolean | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_legacy_leads` | on | `lead_id` text, `disposition` text, `contact_attempts` integer | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_phase3_legacy_enrollments` | on | `id` text, `status` text, `next_send_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_phase3_restore` | on | `proname` name, `definition` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_phase3_seed` | on | `sequence_id` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_phase4_restore` | on | `name` text, `definition` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_suppressions` | on | `identity_type` text, `identity_value` text, `reason` outreach_suppression_reason, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_verification_config` | on | `singleton` boolean, `encrypted_credentials` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_workflow_logs` | on | `id` bigint, `run_id` uuid, `step_number` integer, `node_type` text, `status` text, `details` jsonb, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `outreach_workflow_runs` | on | `id` uuid, `workflow_id` uuid, `lead_id` text, `event_key` text, `status` text, `current_step` integer, `next_step_at` timestamp with time zone, `context` jsonb, `lease` uuid, `lease_until` timestamp with time zone, `last_error` text, `created_at` timestamp with time zone, `completed_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `packages` | on | `id` uuid, `name` text, `description` text, `type` text, `features` jsonb, `pricing` jsonb, `is_active` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `page_view_logs` | on | `id` uuid, `user_id` uuid, `organization_id` uuid, `session_id` text, `page` text, `page_title` text, `referrer` text, `time_on_page_seconds` integer, `ip_address` text, `user_agent` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `payment_methods` | on | `id` uuid, `org_id` uuid, `type` text, `token` text, `last_four` text, `expiry_month` integer, `expiry_year` integer, `is_default` boolean, `status` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `payment_transactions` | on | `id` uuid, `org_id` uuid, `invoice_id` uuid, `payment_method_id` uuid, `amount` numeric(12,2), `status` text, `transaction_date` timestamp with time zone, `external_id` text, `error_message` text, `metadata` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `stripe_payment_intent_id` text, `stripe_charge_id` text, `stripe_invoice_id` text, `currency` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `phone_number_requests` | on | `id` uuid, `org_id` uuid, `requested_by` uuid, `requested_number` text, `requested_label` text, `reason` text, `status` text, `created_at` timestamp with time zone, `reviewed_at` timestamp with time zone, `reviewed_by` uuid | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `phone_numbers` | on | `id` uuid, `number` text, `external_id` text, `org_id` uuid, `label` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `phone_number` text, `number_digits` text, `e164` text, `is_active` boolean, `metadata` jsonb, `last_synced_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `pipeline_stages` | on | `id` uuid, `name` text, `color` text, `position` integer, `created_at` timestamp with time zone, `pipeline_id` uuid, `key` text, `client_account_id` uuid | `client_tenancy_guard` (ALL), `crm_stages_delete_guard` (DELETE), `crm_stages_insert_guard` (INSERT), `crm_stages_read` (SELECT), `crm_stages_update_guard` (UPDATE), `crm_stages_write` (ALL) |
| `pipelines` | on | `id` uuid, `name` text, `description` text, `is_default` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `client_account_id` uuid, `template_key` text | `client_tenancy_guard` (ALL), `crm_pipeline_delete_guard` (DELETE), `crm_pipeline_insert_guard` (INSERT), `crm_pipeline_read` (SELECT), `crm_pipeline_update_guard` (UPDATE), `crm_pipeline_write` (ALL) |
| `platform_api_keys` | on | `id` uuid, `key_hash` text, `label` text, `created_by` uuid, `created_at` timestamp with time zone, `last_used_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `platform_manager_permissions` | on | `id` uuid, `user_id` uuid, `can_manage_phone_numbers_global` boolean, `can_manage_agents_global` boolean, `can_manage_orgs` boolean, `can_view_billing_global` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `portal_activity_log` | on | `id` bigint, `actor_id` uuid, `actor_email` text, `actor_name` text, `organization_id` text, `client_account_id` text, `session_id` text, `event_type` text, `action` text, `page_path` text, `target` text, `request_method` text, `request_status` integer, `ip_address` text, `user_agent` text, `metadata` jsonb, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `profiles` | on | `id` uuid, `full_name` text, `is_global_admin` boolean, `created_at` timestamp with time zone, `global_role` text, `updated_at` timestamp with time zone, `can_upload_leads` boolean, `email` text, `role` app_role, `timezone` text, `active` boolean, `slack_user_id` text | `profiles_admin_write` (ALL), `profiles_self_or_admin` (SELECT), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `prospects` | on | `id` uuid, `first_name` text, `last_name` text, `email` text, `phone` text, `title` text, `seniority` text, `department` text, `company` text, `company_size` text, `industry` text, `website` text, `linkedin_url` text, `twitter_url` text, `city` text, `state` text, `country` text, `technologies` text[], `keywords` text[], `email_verified` boolean, `enriched_at` timestamp with time zone, `source` text, `saved_to_leads` boolean, `lead_id` uuid, `intent_score` integer, `last_funding_round` text, `funding_total` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `qualification_results` | on | `id` uuid, `call_id` uuid, `score` numeric(5,2), `qualified` boolean, `reasoning` text, `next_action` text, `scoring_version` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `rate_limit_violations` | on | `id` uuid, `ip_address` text, `endpoint` text, `user_id` uuid, `timestamp` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `recording_access_logs` | on | `id` uuid, `org_id` uuid, `recording_id` text, `actor_id` uuid, `action` text, `request_id` text, `metadata` jsonb, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `recording_archives` | on | `id` uuid, `org_id` uuid, `recording_id` uuid, `external_call_id` text, `storage_bucket` text, `storage_path` text, `content_type` text, `byte_size` bigint, `checksum_sha256` text, `consent_status` text, `retention_until` timestamp with time zone, `legal_hold` boolean, `archived_at` timestamp with time zone, `metadata` jsonb | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `recording_consents` | on | `id` uuid, `org_id` uuid, `external_call_id` text, `phone_number` text, `consent_status` text, `consent_method` text, `consented_at` timestamp with time zone, `evidence` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `referrals` | on | `id` uuid, `affiliate_id` uuid, `referred_email` text, `referred_name` text, `referred_company` text, `status` text, `sub_account_id` uuid, `deal_value` numeric(10,2), `commission` numeric(10,2), `commission_paid` boolean, `paid_at` timestamp with time zone, `converted_at` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `rep_territories` | on | `id` uuid, `organization_id` uuid, `rep_user_id` uuid, `state_codes` text[], `trades` text[], `platforms` text[], `priority` integer, `active` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `rep_territories_admin` (ALL) |
| `report_recipients` | on | `id` uuid, `email` text, `name` text, `daily` boolean, `weekly` boolean, `active` boolean, `client_account_id` uuid | `client_tenancy_guard` (ALL), `report_recipients_admin` (ALL) |
| `report_sends` | on | `id` uuid, `type` text, `shift_id` uuid, `period_start` date, `period_end` date, `sent_at` timestamp with time zone, `sent_by` uuid, `recipients` text[], `status` text, `error` text, `pdf_path` text, `client_account_id` uuid, `work_done` text, `whats_next` text, `storage_bucket` text | `client_tenancy_guard` (ALL), `report_sends_admin` (ALL) |
| `revenue_events` | on | `id` uuid, `organization_id` uuid, `lead_id` uuid, `rep_user_id` uuid, `connected_account_id` uuid, `platform` text, `campaign_id` uuid, `stripe_object_id` text, `stripe_event_type` text, `amount_cents` bigint, `currency` text, `occurred_at` timestamp with time zone, `refunded` boolean, `metadata` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `revenue_events_admin` (SELECT), `revenue_events_rep` (SELECT) |
| `review_requests` | on | `id` uuid, `contact_name` text, `contact_email` text, `contact_phone` text, `channel` text, `platform` text, `status` text, `sent_at` timestamp with time zone, `clicked_at` timestamp with time zone, `client_account_id` uuid, `lead_id` uuid, `click_token` uuid, `reminder_sent_at` timestamp with time zone | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `review_sources` | on | `id` uuid, `platform` text, `name` text, `business_id` text, `review_url` text, `config` jsonb, `status` text, `review_count` integer, `avg_rating` text, `is_active` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `client_account_id` uuid | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `reviews` | on | `id` uuid, `source_id` uuid, `platform` text, `reviewer` text, `reviewer_avatar` text, `rating` integer, `text` text, `reply` text, `replied_at` timestamp with time zone, `platform_review_id` text, `review_url` text, `sentiment` text, `is_read` boolean, `created_at` timestamp with time zone, `client_account_id` uuid | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `roles` | on | `id` uuid, `name` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `segment_contacts` | on | `segment_id` uuid, `lead_id` uuid, `created_at` timestamp with time zone | `crm_segment_contacts_delete` (DELETE), `crm_segment_contacts_insert` (INSERT), `crm_segment_contacts_read` (SELECT) |
| `segments` | on | `id` uuid, `name` text, `description` text, `filters` jsonb, `contact_count` integer, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `organization_id` uuid, `segment_type` text | `crm_segment_org_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `sending_domains` | on | `id` uuid, `domain` text, `is_primary` boolean, `spf_verified` boolean, `dkim_verified` boolean, `dmarc_verified` boolean, `dkim_selector` text, `status` outreach_domain_status, `verified_at` timestamp with time zone, `created_at` timestamp with time zone, `allow_primary_sending` boolean, `deleted_at` timestamp with time zone, `spf_host` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `sequence_enrollments` | on | `id` uuid, `sequence_id` uuid, `lead_id` uuid, `current_step` integer, `status` text, `next_send_at` timestamp with time zone, `completed_at` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `assigned_mailbox_id` uuid, `pause_reason` text, `resume_at` timestamp with time zone, `stopped_reason` text, `manual_email_outcome` text, `manual_email_outcome_at` timestamp with time zone, `client_account_id` uuid | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `sequence_steps` | on | `id` uuid, `sequence_id` uuid, `step_number` integer, `subject` text, `body` text, `delay_days` integer, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `channel` text, `client_account_id` uuid | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `sequences` | on | `id` uuid, `name` text, `status` text, `email_account_id` uuid, `total_enrolled` integer, `total_sent` integer, `total_opened` integer, `total_replied` integer, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `label` text, `archived_at` timestamp with time zone, `client_account_id` uuid, `template_key` text | `client_tenancy_guard` (ALL), `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `settings` | on | `id` integer, `client_name` text, `campaign_name` text, `timezone` text, `brand_label` text, `default_shift_hours` numeric, `daily_report_mode` text, `credit_rate` numeric, `show_credits_to_client` boolean, `weekly_send_day` integer, `weekly_send_time` time without time zone, `logo_url` text | `settings_admin` (ALL), `settings_read` (SELECT) |
| `shifts` | on | `id` uuid, `agent_id` uuid, `work_date` date, `started_at` timestamp with time zone, `ended_at` timestamp with time zone, `status` shift_status, `hours_worked` numeric, `client_downtime_minutes` integer, `client_downtime_reason` text, `our_missed_hours` numeric, `crm_logged_same_day` boolean, `observation` text, `issues` text, `submitted_at` timestamp with time zone, `approved_by` uuid, `paused_at` timestamp with time zone, `paused_seconds` numeric | `shifts_caller_insert` (INSERT), `shifts_caller_select` (SELECT), `shifts_caller_update` (UPDATE) |
| `slack_notification_log` | on | `id` bigint, `lead_id` text, `event_type` text, `request_id` bigint, `status` text, `http_status` integer, `error_message` text, `created_at` timestamp with time zone, `checked_at` timestamp with time zone, `lead_table` text | none |
| `sms_logs` | on | `id` uuid, `org_id` uuid, `from_number` text, `to_numbers` text[], `message_text` text, `direction` text, `status` text, `sent_at` timestamp with time zone, `metadata` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `social_attribution_secrets` | on | `organization_id` uuid, `calendly_signing_vault_id` uuid, `stripe_signing_vault_id` uuid, `configured_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | none |
| `social_oauth_apps` | on | `organization_id` uuid, `app_id` text, `app_secret_vault_id` uuid, `verify_token_vault_id` uuid, `graph_version` text, `configured_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | none |
| `social_oauth_states` | on | `state_hash` text, `organization_id` uuid, `user_id` uuid, `redirect_uri` text, `expires_at` timestamp with time zone, `used_at` timestamp with time zone, `created_at` timestamp with time zone | none |
| `social_post_targets` | on | `id` uuid, `organization_id` uuid, `post_id` uuid, `connected_account_id` uuid, `status` text, `provider_post_id` text, `permalink` text, `metrics` jsonb, `last_metrics_at` timestamp with time zone, `published_at` timestamp with time zone, `error` text, `attempts` integer, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `metrics_source` text | `social_post_targets_admin` (ALL) |
| `social_posts` | on | `id` uuid, `organization_id` uuid, `body` text, `media_url` text, `media_type` text, `status` text, `scheduled_at` timestamp with time zone, `created_by` uuid, `updated_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `post_type` text | `social_posts_admin` (ALL) |
| `social_profiles` | on | `id` uuid, `organization_id` uuid, `entity_type` text, `entity_id` uuid, `platform` text, `handle` text, `normalized_handle` text, `profile_url` text, `platform_user_id` text, `is_primary` boolean, `verified` boolean, `confidence` integer, `source` text, `follower_count` bigint, `last_checked_at` timestamp with time zone, `notes` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `review_status` text, `provider_resolved_at` timestamp with time zone, `resolve_error` text | `social_profiles_delete` (DELETE), `social_profiles_insert` (INSERT), `social_profiles_read` (SELECT), `social_profiles_update` (UPDATE) |
| `social_reply_obligations` | on | `id` uuid, `organization_id` uuid, `conversation_id` uuid, `rep_user_id` uuid, `inbound_message_id` uuid, `due_at` timestamp with time zone, `completed_at` timestamp with time zone, `completed_message_id` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `social_reply_obligations_owner` (SELECT), `social_reply_obligations_rep` (SELECT) |
| `social_send_attempts` | on | `id` uuid, `organization_id` uuid, `connected_account_id` uuid, `conversation_id` uuid, `sent_by` uuid, `status` text, `external_message_id` text, `error` text, `created_at` timestamp with time zone, `completed_at` timestamp with time zone | none |
| `social_sync_cursors` | on | `source` text, `cursor_at` timestamp with time zone, `cursor_id` uuid, `updated_at` timestamp with time zone | none |
| `social_team_permissions` | on | `team_member_id` uuid, `organization_id` uuid, `permissions` text[], `updated_by` uuid, `updated_at` timestamp with time zone | `social_team_permissions_admin` (ALL) |
| `social_threads_apps` | on | `organization_id` uuid, `app_id` text, `app_secret_vault_id` uuid, `configured_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | none |
| `social_unipile_config` | on | `organization_id` uuid, `api_key_vault_id` uuid, `webhook_secret_vault_id` uuid, `configured_by` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `api_base_url` text, `api_version` text | none |
| `social_unipile_connect_attempts` | on | `id` uuid, `organization_id` uuid, `account_id` uuid, `rep_user_id` uuid, `platform` text, `state_hash` text, `expires_at` timestamp with time zone, `completed_at` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | none |
| `social_unipile_sync_state` | on | `connected_account_id` uuid, `organization_id` uuid, `chat_cursor` text, `last_sync_at` timestamp with time zone, `next_sync_at` timestamp with time zone, `initial_sync_complete` boolean, `last_error` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | none |
| `social_webhook_events` | on | `id` uuid, `provider` text, `organization_id` uuid, `inbox_id` bigint, `event_key` text, `payload` jsonb, `status` text, `attempts` integer, `next_attempt_at` timestamp with time zone, `error` text, `created_at` timestamp with time zone, `processed_at` timestamp with time zone | none |
| `social_workspace_audit` | on | `id` bigint, `organization_id` uuid, `actor_id` uuid, `action` text, `target_type` text, `target_id` text, `metadata` jsonb, `created_at` timestamp with time zone | `social_workspace_audit_admin` (SELECT) |
| `sso_tokens` | on | `id` uuid, `token` text, `sub_account_id` uuid, `external_user_id` text, `email` text, `name` text, `role` text, `used_at` timestamp with time zone, `expires_at` timestamp with time zone, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `sub_account_assignments` | on | `sub_account_id` uuid, `user_id` uuid, `role_in_account` text, `created_at` timestamp with time zone | `sub_account_assignments_admin` (ALL), `sub_account_assignments_read` (SELECT) |
| `sub_accounts` | on | `id` uuid, `name` text, `slug` text, `owner_email` text, `owner_name` text, `phone` text, `industry` text, `website` text, `status` text, `plan` text, `external_id` text, `leads_count` integer, `campaigns_count` integer, `last_active_at` timestamp with time zone, `health_score` integer, `onboarding_completed` boolean, `notes` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `organization_id` uuid, `package` text, `add_ons` text[], `company_id` uuid, `timezone` text, `logo_url` text, `brand` jsonb, `primary_domain` text, `mightycall_number` text, `google_review_link` text, `gbp_url` text, `meta_ad_account_id` text, `google_ads_customer_id` text, `goal_metric` text, `goal_value` integer, `stripe_customer_id` text, `launch_date` date, `account_manager_user_id` uuid, `invite_email_sent_at` timestamp with time zone, `settings` jsonb, `mrr_cents` integer | `client_sub_accounts_read` (SELECT), `workforce_legacy_admin` (ALL) |
| `support_ticket_messages` | on | `id` uuid, `ticket_id` uuid, `sender_user_id` uuid, `message` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `support_tickets` | on | `id` uuid, `org_id` uuid, `created_by` uuid, `subject` text, `priority` text, `status` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `targets` | on | `metric_key` text, `per_hours` numeric, `target_value` numeric | `targets_admin` (ALL), `targets_public_read` (SELECT), `targets_read` (SELECT) |
| `team_members` | on | `id` uuid, `org_id` uuid, `user_id` uuid, `role` text, `name` text, `email` text, `phone` text, `is_active` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone, `auth_user_id` text, `client_account_id` uuid, `page_permissions` jsonb, `status` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `usage_charges` | on | `id` uuid, `org_id` uuid, `phone_number_id` uuid, `charge_type` text, `quantity` numeric(10,2), `unit_cost` numeric(12,2), `total_cost` numeric(12,2), `service_date` date, `billing_period` date, `metadata` jsonb, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `user_feature_access` | on | `id` uuid, `org_id` uuid, `user_id` uuid, `feature_key` text, `enabled` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `user_mfa_email` | on | `id` uuid, `user_id` uuid, `email` text, `code_hash` text, `code_expires_at` timestamp with time zone, `verified` boolean, `enabled_at` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `user_mfa_totp` | on | `id` uuid, `user_id` uuid, `secret_ciphertext` text, `secret_iv` text, `secret_tag` text, `verified` boolean, `enabled_at` timestamp with time zone, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `user_packages` | on | `id` uuid, `user_id` uuid, `package_id` uuid, `assigned_by` uuid, `assigned_at` timestamp with time zone, `expires_at` timestamp with time zone, `is_active` boolean, `metadata` jsonb | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `user_password_change_codes` | on | `id` uuid, `user_id` uuid, `email` text, `code_hash` text, `expires_at` timestamp with time zone, `consumed_at` timestamp with time zone, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `user_phone_assignments` | on | `id` uuid, `org_id` uuid, `user_id` uuid, `phone_number_id` uuid, `can_call` boolean, `can_receive` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `user_security_questions` | on | `id` uuid, `user_id` uuid, `question_order` integer, `question` text, `answer_hash` text, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `users_roles` | on | `id` uuid, `role_id` uuid, `user_id` uuid, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `voicemail_logs` | on | `id` uuid, `org_id` uuid, `external_id` text, `from_number` text, `to_number` text, `duration_seconds` integer, `message_date` timestamp with time zone, `status` text, `transcription` text, `metadata` jsonb, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `vs_agent_presence` | on | `org_id` uuid, `agent_id` text, `status` text, `status_since` timestamp with time zone, `occupancy_pct` numeric, `current_call_ext_id` text, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `vs_calls` | on | `id` bigint, `org_id` uuid, `call_id` text, `direction` text, `status` text, `started_at` timestamp with time zone, `answered_at` timestamp with time zone, `ended_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `vs_calls_raw` | on | `id` uuid, `org_id` uuid, `external_call_id` text, `direction` text, `from_number` text, `to_number` text, `queue_id` uuid, `agent_id` text, `status` text, `arrived_at` timestamp with time zone, `answered_at` timestamp with time zone, `ended_at` timestamp with time zone, `talk_seconds` integer, `hold_seconds` integer, `wrap_seconds` integer, `disposition` text, `recording_url` text, `csat_score` numeric, `first_contact_resolved` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `vs_clients` | on | `id` uuid, `name` text, `timezone` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `vs_csat_responses` | on | `id` uuid, `org_id` uuid, `call_ext_id` text, `score` numeric, `comment` text, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `vs_qa_scores` | on | `id` uuid, `org_id` uuid, `call_ext_id` text, `agent_id` text, `rubric_score` numeric, `notes` text, `coaching_flag` boolean, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `vs_queues` | on | `id` uuid, `org_id` uuid, `name` text, `sla_seconds` integer | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `vs_users` | on | `id` uuid, `email` text, `role` text, `org_id` uuid | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `vs_voicemails` | on | `id` uuid, `org_id` uuid, `queue_id` uuid, `caller` text, `created_at` timestamp with time zone, `duration_seconds` integer, `transcript` text, `recording_url` text, `resolved` boolean | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `webhook_inbox` | on | `id` bigint, `received_at` timestamp with time zone, `provider` text, `method` text, `content_type` text, `query` jsonb, `headers` jsonb, `raw_text` text, `parsed` jsonb | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `webhooks` | on | `id` uuid, `name` text, `url` text, `events` jsonb, `secret` text, `is_active` boolean, `last_triggered_at` timestamp with time zone, `success_count` integer, `failure_count` integer, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `weekly_notes` | on | `week_start` date, `insights` text, `plan` text, `updated_by` uuid | `weekly_notes_admin` (ALL) |
| `weekly_stats` | on | `id` uuid, `client_id` uuid, `week_number` smallint, `calls_taken` smallint, `avg_handle_time` text, `conversion_rate` double precision, `csat` double precision, `notes` text | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `weekly_summary` | on | `id` uuid, `client_id` uuid, `week_start` date, `total_calls` integer, `avg_handle_time_seconds` integer, `conversion_rate` numeric, `csat_avg` numeric, `total_revenue` numeric, `created_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |
| `wf_activity` | on | `id` uuid, `session_id` uuid, `minute_at` timestamp with time zone, `key_count` integer, `click_count` integer, `movement_count` integer, `app_name` text, `window_title` text | `activity_self` (SELECT), `workforce_monitor_admin` (SELECT) |
| `wf_assignments` | on | `id` uuid, `agent_id` uuid, `campaign_id` uuid, `client_id` uuid, `active` boolean | `workforce_admin_read` (SELECT), `workforce_admin_write` (ALL), `workforce_assignment_read` (SELECT) |
| `wf_audit` | on | `id` uuid, `actor_id` uuid, `occurred_at` timestamp with time zone, `entity` text, `entity_id` uuid, `action` text, `reason` text, `before_value` jsonb, `after_value` jsonb | `workforce_admin_read` (SELECT) |
| `wf_campaigns` | on | `id` uuid, `client_id` uuid, `name` text, `active` boolean | `workforce_admin_read` (SELECT), `workforce_admin_write` (ALL), `workforce_campaign_read` (SELECT) |
| `wf_client_members` | on | `client_id` uuid, `user_id` uuid | `workforce_admin_read` (SELECT), `workforce_admin_write` (ALL), `workforce_membership_read` (SELECT) |
| `wf_clients` | on | `id` uuid, `name` text, `timezone` text, `screenshots_enabled` boolean | `workforce_admin_read` (SELECT), `workforce_admin_write` (ALL), `workforce_client_read` (SELECT) |
| `wf_consents` | on | `user_id` uuid, `disclosure_version` text, `accepted_at` timestamp with time zone | `consent_self` (SELECT), `workforce_monitor_admin` (SELECT) |
| `wf_limits` | on | `id` uuid, `agent_id` uuid, `client_id` uuid, `daily_minutes` integer, `weekly_minutes` integer | `workforce_admin_read` (SELECT), `workforce_admin_write` (ALL), `workforce_limits_read` (SELECT) |
| `wf_overrides` | on | `id` uuid, `agent_id` uuid, `client_id` uuid, `period` text, `period_start` timestamp with time zone, `extra_minutes` integer, `expires_at` timestamp with time zone, `reason` text, `created_by` uuid, `created_at` timestamp with time zone | `workforce_admin_read` (SELECT), `workforce_override_read` (SELECT) |
| `wf_provider_routes` | on | `id` uuid, `agent_id` uuid, `client_id` uuid, `campaign_id` uuid, `extension` text, `business_number` text, `active` boolean | `admin_routes` (ALL) |
| `wf_retention_runs` | on | `id` uuid, `ran_at` timestamp with time zone, `deleted_count` integer, `error_count` integer | `workforce_monitor_admin` (SELECT) |
| `wf_screenshots` | on | `id` uuid, `session_id` uuid, `object_path` text, `captured_at` timestamp with time zone, `expires_at` timestamp with time zone, `blurred` boolean, `uploaded` boolean | `screenshot_scope` (SELECT), `workforce_admin_screenshot_delete` (DELETE), `workforce_monitor_admin` (SELECT) |
| `wf_segments` | on | `id` uuid, `session_id` uuid, `started_at` timestamp with time zone, `ended_at` timestamp with time zone, `authorized_until` timestamp with time zone, `idle_flag` boolean | `workforce_admin_read` (SELECT), `workforce_segment_read` (SELECT) |
| `wf_sessions` | on | `id` uuid, `agent_id` uuid, `client_id` uuid, `campaign_id` uuid, `started_at` timestamp with time zone, `ended_at` timestamp with time zone, `tracker_seen_at` timestamp with time zone, `status` text, `stop_reason` text, `review_status` text | `workforce_admin_read` (SELECT), `workforce_session_read` (SELECT) |
| `wf_settings` | on | `id` boolean, `cap_timezone` text, `idle_minutes` integer, `screenshot_min_minutes` integer, `screenshot_max_minutes` integer, `screenshots_enabled` boolean, `blur_screenshots` boolean, `window_titles_enabled` boolean, `retention_days` integer | `workforce_admin_read` (SELECT), `workforce_admin_write` (ALL), `workforce_settings_read` (SELECT) |
| `wf_transfer_inbox` | on | `id` uuid, `source_key` text, `received_at` timestamp with time zone, `payload` jsonb, `reason` text, `resolved` boolean | `admin_transfer_inbox` (ALL) |
| `wf_transfers` | on | `id` uuid, `agent_id` uuid, `client_id` uuid, `campaign_id` uuid, `occurred_at` timestamp with time zone, `lead_name` text, `phone` text, `state` text, `qualifying_details` jsonb, `notes` text, `outcome` text, `source` text, `source_key` text | `admin_transfer_write` (ALL), `workforce_admin_read` (SELECT), `workforce_transfer_read` (SELECT) |
| `wf_users` | on | `user_id` uuid, `role` text, `display_name` text | `workforce_admin_read` (SELECT), `workforce_admin_write` (ALL), `workforce_user_read` (SELECT) |
| `white_label_settings` | on | `id` uuid, `sub_account_id` uuid, `brand_name` text, `logo_url` text, `favicon_url` text, `primary_color` text, `accent_color` text, `custom_domain` text, `custom_css` text, `support_email` text, `support_phone` text, `footer_text` text, `hide_powered_by` boolean, `created_at` timestamp with time zone, `updated_at` timestamp with time zone | `workforce_legacy_admin` (ALL), `workforce_legacy_boundary` (ALL) |

Full policy expressions are in [schema-metadata.json](schema-metadata.json).

## Cron jobs (12)

- `client-health-nightly`: `20 2 * * *`, active
- `rep_dm_metrics_refresh`: `*/15 * * * *`, active
- `victorysync-client-delivery-minute`: `* * * * *`, active
- `victorysync-client-periodic-reports`: `0 13 * * *`, active
- `victorysync-email-inbox`: `*/5 * * * *`, active
- `victorysync-email-send`: `*/2 * * * *`, active
- `victorysync-enrichment-worker`: `* * * * *`, active
- `victorysync-slack-response-check`: `* * * * *`, active
- `victorysync-social-daily`: `0 5 * * *`, active
- `victorysync-social-worker`: `*/5 * * * *`, active
- `victorysync-workflows`: `*/2 * * * *`, active
- `workforce-hour-caps`: `* * * * *`, active

## Workers and webhook handlers (8)

- `api/client-delivery-worker.ts`
- `api/client-stripe-webhook.ts`
- `api/enrichment-worker.ts`
- `supabase/functions/enrich-ai/index.ts`
- `supabase/functions/enrich-company/index.ts`
- `supabase/functions/enrich-google/index.ts`
- `supabase/functions/enrichment-worker/index.ts`
- `supabase/functions/find-new-leads/index.ts`

## Environment variables referenced in code (69)

- `APP_URL`
- `BASE_URL`
- `CALENDLY_CLIENT_ID`
- `CALENDLY_CLIENT_SECRET`
- `CLIENT_DELIVERY_WORKER_SECRET`
- `CRON_SECRET`
- `DATABASE_SSL`
- `DATABASE_URL`
- `ENRICHMENT_ENABLED`
- `ENRICHMENT_INVOKE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `HUBSPOT_CLIENT_ID`
- `HUBSPOT_CLIENT_SECRET`
- `INVITE_FROM_EMAIL`
- `LOG_LEVEL`
- `MCP_ALLOWED_EMAILS`
- `MCP_PUBLIC_URL`
- `META_APP_SECRET`
- `META_GRAPH_VERSION`
- `META_WEBHOOK_VERIFY_TOKEN`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MIGHTYCALL_API_KEY`
- `MIGHTYCALL_SECRET_KEY`
- `NODE_ENV`
- `OPENROUTER_API_KEY`
- `OPENROUTER_ASSISTANT_MODEL`
- `OPENROUTER_LANDING_MODEL`
- `OPENROUTER_MODEL`
- `OUTREACH_EMAIL_ENABLED`
- `OUTREACH_ENCRYPTION_KEYS`
- `OUTREACH_ENCRYPTION_KEY_ID`
- `OUTREACH_EVENT_SECRET`
- `OUTREACH_PUBLIC_URL`
- `OUTREACH_WORKER_TOKEN`
- `PGLITE_MODULE`
- `PORTAL_COOKIE_SECRET`
- `REPORT_FROM_EMAIL`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `SESSION_SECRET`
- `SLACK_WEBHOOK_URL`
- `SOCIAL_ACCOUNT_EXTERNAL_ID`
- `SOCIAL_ACCOUNT_LABEL`
- `SOCIAL_ACCOUNT_ORG_ID`
- `SOCIAL_ACCOUNT_PLATFORM`
- `SOCIAL_ACCOUNT_TOKEN`
- `SOCIAL_DB_ENV_FILE`
- `SOCIAL_X_DM_ENABLED`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_ANON_KEY`
- `SUPABASE_AUTH_REQUIRED`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_SERVICE_ROLE`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`
- `TEMP`
- `TOKEN_ENCRYPTION_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `VERCEL_PROJECT_PRODUCTION_URL`
- `VITE_ENRICHMENT_ENABLED`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_URL`
- `ZAPIER_WEBHOOK_URL`
- `ZEROBOUNCE_API_KEY`

## Duplication candidates for investigation

- `landing_pages` and `marketing_landing_pages`: legacy archive and current writable page model.
- `org_members`, `org_users`, `memberships`, and `team_members`: overlapping membership models.
- `clients`, `vs_clients`, and `sub_accounts`: inspect references before consolidation.
- `company_tasks` and `contact_tasks`: separate task models with different UI readers.
