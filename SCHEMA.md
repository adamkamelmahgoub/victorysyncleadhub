# CRM schema discovery

**Live catalog:** [SCHEMA_CATALOG.md](SCHEMA_CATALOG.md) records the configured PostgreSQL database's 229 public relations (tables and views), 2,451 columns, 198 foreign-key rows, 53 enum types, and 404 active RLS policies. It is a read-only metadata snapshot; no row data was read. Use that catalog for the deployed schema.

The inventory below is derived from 43 repository SQL migrations and shows what this app creates or changes. The live database has additional legacy and organizational CRM tables, notably `crm_companies`, `crm_contacts`, `crm_deals`, `crm_pipeline_stages`, `crm_tasks`, and `crm_activities`. Conditional migrations, dynamic SQL, and existing project tables make the migration inventory incomplete as a live catalog. No migration was applied.

## Tables and columns

- **activities**: `id` (uuid), `lead_id` (uuid), `type` (text), `description` (text), `created_at` (timestamptz).
- **affiliates**: `id` (uuid), `name` (text), `email` (text), `phone` (text), `company` (text), `referral_code` (text), `commission_rate` (numeric(5,2)), `status` (text), `total_referrals` (integer), `total_converted` (integer), `total_earned` (numeric(10,2)), `total_paid` (numeric(10,2)), `payout_method` (text), `payout_details` (text), `notes` (text), `created_at` (timestamptz), `updated_at` (timestamptz).
- **api_keys**: `id` (uuid), `name` (text), `key_hash` (text), `key_prefix` (text), `scopes` (text), `sub_account_id` (uuid), `created_by` (text), `last_used_at` (timestamptz), `expires_at` (timestamptz), `is_active` (boolean), `request_count` (integer), `created_at` (timestamptz), `updated_at` (timestamptz).
- **automation_workflows**: `id` (uuid), `name` (text), `trigger_type` (text), `trigger_config` (jsonb), `actions` (jsonb), `is_active` (boolean), `enrolled_count` (integer), `completed_count` (integer), `created_at` (timestamptz), `updated_at` (timestamptz).
- **booking_appointments**: `LIKE meeting_appointments INCLUDING ALL`; see the complete `meeting_appointments` column list below.
- **campaign_leads**: `campaign_id` (uuid), `lead_id` (uuid), `status` (text), `created_at` (timestamptz).
- **campaigns**: `id` (uuid), `name` (text), `description` (text), `status` (text), `source_type` (text), `subject` (text), `from_name` (text), `from_email` (text), `body` (text), `send_rate_per_hour` (integer), `daily_limit` (integer), `send_window_start` (text), `send_window_end` (text), `scheduled_at` (timestamptz), `launched_at` (timestamptz), `created_at` (timestamptz), `updated_at` (timestamptz).
- **companies**: `id` (uuid), `name` (text), `phone` (text), `city` (text), `state` (text), `industry` (text), `contact_name` (text), `fit_notes` (text), `source` (text), `stage` (text), `needs_verification` (boolean), `trial_type` (text), `trial_start_date` (date), `trial_end_date` (date), `trial_capacity_slot` (text), `created_at` (timestamptz), `updated_at` (timestamptz), `email` (text), `website` (text), `address` (text), `postal_code` (text), `country` (text), `tags` (text), `contacts` (jsonb), `custom_fields` (jsonb), `next_action` (text), `next_follow_up_at` (timestamptz), `coverage_hours` (text), `coverage_timezone` (text), `expected_daily_leads` (integer), `trial_success_criteria` (text), `trial_results` (text), `proposed_monthly_price` (numeric(14,2)), `currency` (text), `close_call_at` (timestamptz), `close_notes` (text), `deleted_at` (timestamptz), `meeting_at` (timestamptz), `meeting_timezone` (text), `meeting_booked_by` (uuid), `meeting_booked_at` (timestamptz), `updated_by` (uuid).
- **company_activities**: `id` (uuid), `company_id` (uuid), `direction` (text), `outcome` (text), `response_time_minutes` (double), `notes` (text), `occurred_at` (timestamptz), `logged_by` (uuid), `created_at` (timestamptz).
- **company_files**: `id` (uuid), `company_id` (uuid), `file_name` (text), `storage_path` (text), `mime_type` (text), `size_bytes` (integer), `uploaded_by` (uuid), `created_at` (timestamptz).
- **company_tasks**: `id` (uuid), `company_id` (uuid), `title` (text), `kind` (text), `status` (text), `priority` (text), `due_at` (timestamptz), `assignee` (text), `notes` (text), `created_by` (uuid), `created_at` (timestamptz), `updated_at` (timestamptz).
- **contact_tasks**: `id` (uuid), `lead_id` (uuid), `title` (text), `description` (text), `due_date` (timestamptz), `is_completed` (boolean), `completed_at` (timestamptz), `priority` (text), `created_at` (timestamptz), `outreach_enrollment_id` (text), `outreach_job_id` (uuid), `outreach_step_number` (integer), `outreach_status` (text).
- **dispositions**: `id` (serial), `name` (text), `color` (text), `is_active` (boolean), `created_at` (timestamptz).
- **email_accounts**: `id` (uuid), `from_name` (text), `from_email` (text), `smtp_host` (text), `smtp_port` (integer), `smtp_user` (text), `smtp_password` (text), `is_default` (boolean), `daily_limit` (integer), `sent_today` (integer), `last_sent_reset_at` (timestamptz), `created_at` (timestamptz), `updated_at` (timestamptz), `sending_domain_id` (uuid), `provider` (text), `daily_cap` (integer), `mailbox_timezone` (text), `warmup_started_at` (timestamptz), `status` (public.outreach_mailbox_status), `email_engine_enabled` (boolean), `rotation_credit` (numeric), `next_send_after` (timestamptz), `inbound_provider` (text), `inbound_credentials` (text), `inbox_configured_at` (timestamptz), `inbox_checked_at` (timestamptz), `inbox_cursor` (jsonb), `inbox_poll_after` (timestamptz), `inbox_poll_token` (uuid), `inbox_locked_at` (timestamptz), `smtp_monitoring_mode` (text), `signature` (text), `label` (text), `warmup_daily_cap` (integer), `archived_at` (timestamptz).
- **email_logs**: `id` (uuid), `lead_id` (uuid), `email_account_id` (uuid), `sequence_id` (uuid), `sequence_step_id` (uuid), `to_email` (text), `from_email` (text), `subject` (text), `body` (text), `status` (text), `opened_at` (timestamptz), `replied_at` (timestamptz), `sent_at` (timestamptz).
- **email_templates**: `id` (uuid), `name` (text), `subject` (text), `body` (text), `preview_text` (text), `category` (text), `tags` (jsonb), `is_default` (boolean), `use_count` (integer), `created_at` (timestamptz), `updated_at` (timestamptz).
- **form_submissions**: `id` (uuid), `form_id` (uuid), `lead_id` (uuid), `data` (jsonb), `source_url` (text), `created_at` (timestamptz).
- **forms**: `id` (uuid), `name` (text), `description` (text), `status` (text), `campaign_id` (uuid), `fields` (jsonb), `success_message` (text), `created_at` (timestamptz), `updated_at` (timestamptz).
- **integrations**: `id` (uuid), `type` (text), `name` (text), `account_identifier` (text), `status` (text), `config` (jsonb), `created_at` (timestamptz), `updated_at` (timestamptz).
- **invite_codes**: `id` (uuid), `code_hash` (text), `email` (text), `name` (text), `role` (text), `team_member_id` (uuid), `created_by` (text), `used_by_user_id` (text), `used_at` (timestamptz), `expires_at` (timestamptz), `created_at` (timestamptz), `org_id` (uuid), `client_account_id` (uuid).
- **leads**: `id` (uuid), `first_name` (text), `last_name` (text), `email` (text), `phone` (text), `created_at` (timestamptz), `updated_at` (timestamptz), `company` (text), `title` (text), `source` (text), `status` (text), `score` (integer), `campaign_id` (uuid), `form_id` (uuid), `pipeline_stage_id` (uuid), `tags` (text[]), `custom_fields` (jsonb), `disposition` (public.outreach_disposition), `contact_attempts` (integer), `client_account_id` (uuid), `timezone` (public.outreach_timezone), `timezone_confirmed` (boolean), `next_action_at` (timestamptz), `attempt_count` (integer), `first_attempt_at` (timestamptz), `revisit_at` (timestamptz), `dnc` (boolean), `suppressed_reason` (public.outreach_suppression_reason), `normalized_email` (text), `normalized_phone` (text), `avg_job_value` (numeric(14,2)), `missed_calls_per_week` (integer), `after_hours_coverage` (text), `uses_answering_service` (boolean), `email_verification_status` (public.outreach_verification_status), `verified_at` (timestamptz), `verified_email` (text), `meeting_at` (timestamptz), `meeting_timezone` (text), `meeting_booked_by` (uuid), `meeting_booked_at` (timestamptz), `updated_by` (uuid).
- **meeting_appointments**: `id` (uuid), `event_type_id` (uuid), `guest_name` (text), `guest_email` (text), `guest_phone` (text), `guest_company` (text), `start_at` (timestamptz), `end_at` (timestamptz), `timezone` (text), `status` (text), `notes` (text), `answers` (jsonb), `meeting_link` (text), `cancel_reason` (text), `lead_id` (uuid), `reminder_sent_at` (timestamptz), `created_at` (timestamptz), `updated_at` (timestamptz).
- **meeting_event_types**: `id` (uuid), `slug` (text), `title` (text), `description` (text), `duration_minutes` (integer), `color` (text), `location` (text), `is_active` (boolean), `requires_confirmation` (boolean), `buffer_before` (integer), `buffer_after` (integer), `max_bookings_per_day` (integer), `questions` (jsonb), `available_days` (text), `available_start` (text), `available_end` (text), `timezone` (text), `created_at` (timestamptz), `updated_at` (timestamptz).
- **notes**: `id` (uuid), `lead_id` (uuid), `content` (text), `created_at` (timestamptz).
- **onboarding_progress**: `id` (uuid), `sub_account_id` (uuid), `completed_steps` (text), `current_step` (text), `is_completed` (boolean), `completed_at` (timestamptz), `metadata` (jsonb), `created_at` (timestamptz), `updated_at` (timestamptz).
- **outreach_audit**: `id` (bigint), `lead_id` (text), `actor` (text), `reason` (text), `details` (jsonb), `created_at` (timestamptz).
- **outreach_call_outcomes**: `call_id` (bigint), `connected` (boolean), `conversation` (boolean), `meeting_held_at` (timestamptz), `updated_at` (timestamptz).
- **outreach_delivery_reports**: `mailbox_id` (text), `event_id` (text), `matched` (integer), `created_at` (timestamptz).
- **outreach_email_alerts**: `id` (bigint), `mailbox_id` (text), `reason` (text), `created_at` (timestamptz), `acknowledged_at` (timestamptz).
- **outreach_email_events**: `provider` (text), `event_id` (text), `job_id` (uuid), `type` (text), `received_at` (timestamptz).
- **outreach_email_jobs**: `id` (uuid), `lead_id` (dynamic type matching leads.id), `mailbox_id` (dynamic type matching email_accounts.id), `enrollment_id` (text), `to_email` (text), `phone_snapshot` (text), `subject` (text), `body` (text), `state` (text), `not_before` (timestamptz), `dispatched_at` (timestamptz), `sent_at` (timestamptz), `mailbox_day` (date), `global_day` (date), `provider_message_id` (text), `claim_token` (uuid), `unsubscribe_hash` (text), `unsubscribe_token` (text), `failure_reason` (text), `created_at` (timestamptz), `sequence_step_number` (integer), `rfc_message_id` (text), `operator_verification_override` (boolean), `campaign_id` (uuid).
- **outreach_email_settings**: `id` (boolean), `engine_enabled` (boolean), `global_daily_cap` (integer), `reset_timezone` (text), `primary_domains` (text), `direct_link_domains` (text).
- **outreach_inbound_messages**: `id` (uuid), `mailbox_id` (text), `provider_id` (text), `from_email` (text), `from_domain` (text), `subject` (text), `body` (text), `received_at` (timestamptz), `recorded_at` (timestamptz), `is_auto_reply` (boolean), `return_at` (timestamptz), `positive_reply` (boolean).
- **outreach_legacy_leads**: `lead_id` (text), `disposition` (legacy source type), `contact_attempts` (integer); created from a snapshot query.
- **outreach_make_config**: `id` (boolean), `token_hash` (text).
- **outreach_make_events**: `id` (uuid), `event_type` (text), `lead_id` (text), `payload` (jsonb), `created_at` (timestamptz), `lease` (uuid), `lease_until` (timestamptz), `acknowledged_at` (timestamptz).
- **outreach_make_requests**: `event_key` (text), `request` (jsonb), `result` (jsonb), `created_at` (timestamptz).
- **outreach_suppressions**: `identity_type` (text), `identity_value` (text), `reason` (public), `created_at` (timestamptz).
- **outreach_verification_config**: `singleton` (boolean), `encrypted_credentials` (text).
- **outreach_workflow_logs**: `id` (bigint), `run_id` (uuid), `step_number` (integer), `node_type` (text), `status` (text), `details` (jsonb), `created_at` (timestamptz).
- **outreach_workflow_runs**: `id` (uuid), `workflow_id` (uuid), `lead_id` (text), `event_key` (text), `status` (text), `current_step` (integer), `next_step_at` (timestamptz), `context` (jsonb), `lease` (uuid), `lease_until` (timestamptz), `last_error` (text), `created_at` (timestamptz), `completed_at` (timestamptz).
- **pipeline_stages**: `pipeline_id` (uuid), `id` (uuid), `name` (text), `color` (text), `position` (integer), `created_at` (timestamptz), `key` (text).
- **pipelines**: `id` (uuid), `name` (text), `description` (text), `is_default` (boolean), `created_at` (timestamptz), `updated_at` (timestamptz).
- **portal_activity_log**: `id` (bigint), `actor_id` (uuid), `actor_email` (text), `actor_name` (text), `organization_id` (text), `client_account_id` (text), `session_id` (text), `event_type` (text), `action` (text), `page_path` (text), `target` (text), `request_method` (text), `request_status` (integer), `ip_address` (text), `user_agent` (text), `metadata` (jsonb), `created_at` (timestamptz).
- **prospects**: `id` (uuid), `first_name` (text), `last_name` (text), `email` (text), `phone` (text), `title` (text), `seniority` (text), `department` (text), `company` (text), `company_size` (text), `industry` (text), `website` (text), `linkedin_url` (text), `twitter_url` (text), `city` (text), `state` (text), `country` (text), `technologies` (text), `keywords` (text), `email_verified` (boolean), `enriched_at` (timestamptz), `source` (text), `saved_to_leads` (boolean), `lead_id` (uuid), `intent_score` (integer), `last_funding_round` (text), `funding_total` (text), `created_at` (timestamptz), `updated_at` (timestamptz).
- **referrals**: `id` (uuid), `affiliate_id` (uuid), `referred_email` (text), `referred_name` (text), `referred_company` (text), `status` (text), `sub_account_id` (uuid), `deal_value` (numeric(10,2)), `commission` (numeric(10,2)), `commission_paid` (boolean), `paid_at` (timestamptz), `converted_at` (timestamptz), `created_at` (timestamptz), `updated_at` (timestamptz).
- **review_requests**: `id` (uuid), `contact_name` (text), `contact_email` (text), `contact_phone` (text), `channel` (text), `platform` (text), `status` (text), `sent_at` (timestamptz), `clicked_at` (timestamptz).
- **review_sources**: `id` (uuid), `platform` (text), `name` (text), `business_id` (text), `review_url` (text), `config` (jsonb), `status` (text), `review_count` (integer), `avg_rating` (text), `is_active` (boolean), `created_at` (timestamptz), `updated_at` (timestamptz).
- **reviews**: `id` (uuid), `source_id` (uuid), `platform` (text), `reviewer` (text), `reviewer_avatar` (text), `rating` (integer), `text` (text), `reply` (text), `replied_at` (timestamptz), `platform_review_id` (text), `review_url` (text), `sentiment` (text), `is_read` (boolean), `created_at` (timestamptz).
- **segments**: `id` (uuid), `name` (text), `description` (text), `filters` (jsonb), `contact_count` (integer), `created_at` (timestamptz), `updated_at` (timestamptz).
- **sending_domains**: `id` (uuid), `domain` (text), `is_primary` (boolean), `spf_verified` (boolean), `dkim_verified` (boolean), `dmarc_verified` (boolean), `dkim_selector` (text), `status` (public.outreach_domain_status), `verified_at` (timestamptz), `created_at` (timestamptz), `allow_primary_sending` (boolean), `deleted_at` (timestamptz), `spf_host` (text).
- **sequence_enrollments**: `id` (uuid), `assigned_mailbox_id` (dynamic type matching email_accounts.id), `sequence_id` (uuid), `lead_id` (uuid), `current_step` (integer), `status` (text), `next_send_at` (timestamptz), `completed_at` (timestamptz), `created_at` (timestamptz), `updated_at` (timestamptz), `pause_reason` (text), `resume_at` (timestamptz), `stopped_reason` (text), `manual_email_outcome` (text), `manual_email_outcome_at` (timestamptz).
- **sequence_steps**: `id` (uuid), `sequence_id` (uuid), `step_number` (integer), `subject` (text), `body` (text), `delay_days` (integer), `created_at` (timestamptz), `updated_at` (timestamptz), `channel` (text).
- **sequences**: `id` (uuid), `name` (text), `status` (text), `email_account_id` (uuid), `total_enrolled` (integer), `total_sent` (integer), `total_opened` (integer), `total_replied` (integer), `created_at` (timestamptz), `updated_at` (timestamptz), `label` (text), `archived_at` (timestamptz).
- **slack_notification_log**: `id` (bigint), `lead_id` (text), `event_type` (text), `request_id` (bigint), `status` (text), `http_status` (integer), `error_message` (text), `created_at` (timestamptz), `checked_at` (timestamptz), `lead_table` (text).
- **sso_tokens**: `id` (uuid), `token` (text), `sub_account_id` (uuid), `external_user_id` (text), `email` (text), `name` (text), `role` (text), `used_at` (timestamptz), `expires_at` (timestamptz), `created_at` (timestamptz).
- **sub_accounts**: `id` (uuid), `name` (text), `slug` (text), `owner_email` (text), `owner_name` (text), `phone` (text), `industry` (text), `website` (text), `status` (text), `plan` (text), `external_id` (text), `leads_count` (integer), `campaigns_count` (integer), `last_active_at` (timestamptz), `health_score` (integer), `onboarding_completed` (boolean), `notes` (text), `created_at` (timestamptz), `updated_at` (timestamptz).
- **team_members**: `id` (uuid), `name` (text), `email` (text), `role` (text), `status` (text), `created_at` (timestamptz), `updated_at` (timestamptz), `auth_user_id` (text), `org_id` (uuid), `client_account_id` (uuid), `page_permissions` (jsonb).
- **webhooks**: `id` (uuid), `name` (text), `url` (text), `events` (jsonb), `secret` (text), `is_active` (boolean), `last_triggered_at` (timestamptz), `success_count` (integer), `failure_count` (integer), `created_at` (timestamptz), `updated_at` (timestamptz).
- **white_label_settings**: `id` (uuid), `sub_account_id` (uuid), `brand_name` (text), `logo_url` (text), `favicon_url` (text), `primary_color` (text), `accent_color` (text), `custom_domain` (text), `custom_css` (text), `support_email` (text), `support_phone` (text), `footer_text` (text), `hide_powered_by` (boolean), `created_at` (timestamptz), `updated_at` (timestamptz).

## PostgreSQL enums

- **outreach_disposition**: 'no_answer','voicemail','gatekeeper','wrong_number','not_interested','callback_scheduled','meeting_booked','dnc'
- **outreach_suppression_reason**: 'dnc','unsubscribed','bounced_hard','manual_exclude'
- **outreach_timezone**: 'Etc/UTC','America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles','America/Anchorage','America/Adak','Pacific/Honolulu','America/Detroit','America/Indiana/Indianapolis','America/Indiana/Knox','America/Indiana/Tell_City','America/Indiana/Marengo','America/Indiana/Petersburg','America/Indiana/Vevay','America/Indiana/Vincennes','America/Indiana/Winamac','America/Kentucky/Louisville','America/Kentucky/Monticello','America/Menominee','America/North_Dakota/Beulah','America/North_Dakota/Center','America/North_Dakota/New_Salem'
- **outreach_mailbox_status**: 'warming','active','paused','burned'
- **outreach_domain_status**: 'warming','active','burned'
- **outreach_verification_status**: 'valid','risky','invalid','unverified'

## Named RLS policies found in migrations

- public.pipelines: `authenticated manage pipelines` (20260708_multi_pipelines_and_source_cleanup.sql)
- storage.objects: `authenticated read platform storage` (20260708_platform_schema_and_storage.sql)
- storage.objects: `authenticated upload platform storage` (20260708_platform_schema_and_storage.sql)
- storage.objects: `authenticated update platform storage` (20260708_platform_schema_and_storage.sql)
- storage.objects: `authenticated delete platform storage` (20260708_platform_schema_and_storage.sql)
- public.companies: `crm_company_read` (20260905_company_trials.sql)
- public.companies: `crm_company_insert` (20260905_company_trials.sql)
- public.companies: `crm_company_update` (20260905_company_trials.sql)
- public.company_activities: `crm_activity_read` (20260905_company_trials.sql)
- public.company_activities: `crm_activity_insert` (20260905_company_trials.sql)
- public.company_tasks: `crm_task_read` (20260906_company_workspace.sql)
- public.company_tasks: `crm_task_insert` (20260906_company_workspace.sql)
- public.company_tasks: `crm_task_update` (20260906_company_workspace.sql)
- public.company_files: `crm_file_read` (20260906_company_workspace.sql)
- public.company_files: `crm_file_insert` (20260906_company_workspace.sql)
- storage.objects: `crm_storage_read` (20260906_company_workspace.sql)
- storage.objects: `crm_storage_insert` (20260906_company_workspace.sql)
- storage.objects: `crm_storage_cleanup` (20260906_company_workspace.sql)
- public.companies: `crm_company_active` (20260907_company_trash.sql)
- storage.objects: `crm_storage_parent_active` (20260907_company_trash.sql)
- public.leads: `crm_lead_read` (20261002_crm_role_claims.sql)
- public.leads: `crm_lead_read_guard` (20261002_crm_role_claims.sql)
- public.leads: `crm_lead_insert` (20261002_crm_role_claims.sql)
- public.leads: `crm_lead_insert_guard` (20261002_crm_role_claims.sql)
- public.leads: `crm_lead_update` (20261002_crm_role_claims.sql)
- public.leads: `crm_lead_update_guard` (20261002_crm_role_claims.sql)
- public.leads: `crm_lead_delete` (20261002_crm_role_claims.sql)
- public.leads: `crm_lead_delete_guard` (20261002_crm_role_claims.sql)
- public.pipeline_stages: `crm_stages_read` (20261002_crm_role_claims.sql)
- public.pipeline_stages: `crm_stages_write` (20261002_crm_role_claims.sql)
- public.pipeline_stages: `crm_stages_insert_guard` (20261002_crm_role_claims.sql)
- public.pipeline_stages: `crm_stages_update_guard` (20261002_crm_role_claims.sql)
- public.pipeline_stages: `crm_stages_delete_guard` (20261002_crm_role_claims.sql)
- public.pipelines: `crm_pipeline_read` (20261002_crm_role_claims.sql)
- public.pipelines: `crm_pipeline_write` (20261002_crm_role_claims.sql)
- public.pipelines: `crm_pipeline_insert_guard` (20261002_crm_role_claims.sql)
- public.pipelines: `crm_pipeline_update_guard` (20261002_crm_role_claims.sql)
- public.pipelines: `crm_pipeline_delete_guard` (20261002_crm_role_claims.sql)
- public.companies: `crm_company_admin_claim` (20261006_company_crm_admin_claim.sql)
- public.companies: `crm_company_admin_guard` (20261006_company_crm_admin_claim.sql)

## Relational and behavior notes

- Core lead graph: `leads.pipeline_stage_id -> pipeline_stages.id`, `pipeline_stages.pipeline_id -> pipelines.id`; `activities`, `notes`, `contact_tasks`, `campaign_leads`, `sequence_enrollments`, and `email_logs` refer to `leads.id`. `campaign_leads` also refers to `campaigns.id`; sequence steps and enrollments refer to `sequences.id`.
- Company CRM is separate: `company_activities`, `company_tasks`, and `company_files` refer to `companies.id`. `companies.contacts` is JSONB. The live database also has a separate `crm_contacts` table and `crm_deals` pipeline, which are not created by these repository migrations. The MCP generic table tools include both tracks; specialized pipeline tools should distinguish the app lead stages from live CRM deal stages.
- Other key references: forms to campaigns; form submissions to forms and leads; meeting appointments to event types and leads; referrals to affiliates and sub accounts; pipeline stages to pipelines. Several outreach links are text IDs rather than declared foreign keys, so runtime validation is required.
- Supabase Auth users live in `auth.users`, outside this public inventory. `team_members.auth_user_id` is a text link; `profiles` is referenced by role logic but its creation and columns are absent from these migrations. The role claim hook maps active team members to `crm_role`, client account, member ID, and page permissions. This must be checked against the live catalog before using service role access.
- RLS: lead and pipeline policies in `20261002_crm_role_claims.sql` use `crm_role` claims. Leads use `crm_lead_can_read/write` plus restrictive guards; pipelines and stages allow broad authenticated reads and owner/admin/member writes. Company, company activity, task and file policies use `crm_can_access`, with later admin claim and active/trash guards. Storage object policies cover files. The named policy list above is source history, not guaranteed final live policy state; `DROP POLICY` and dynamic SQL can alter it.
- A lead status or stage transition to `meeting_booked` is handled by `record_meeting_booking`, then `notify_slack_meeting_booked` sends through `pg_net` using a Vault webhook and records `slack_notification_log`. The same pattern applies to company `stage`. A future MCP status tool should update the normal row and let these triggers run; it should not send a second Slack message.
- Call logging must use `outreach_log_call`: it atomically updates attempts, disposition, next action, activity, and audit. A guard rejects direct insertion of call activity. The queue comes from `outreach_call_queue`; `outreach_call_outcomes` stores connected/conversation/meeting-held reporting flags.
- Suppression is centralized in `outreach_suppressions` and `outreach_eligible_leads`, with lead normalization and guards. Inserts/imports need the existing lead import path and suppression checks. Cold email uses sequence enrollment functions, email job claim/dispatch/finish functions, mailbox health, inbox monitoring, and `lib/email-service.ts` / `lib/sequence-service.ts`; direct writes to email jobs would bypass those checks.
- The deployed app is Vite/React with a Vercel catch-all function (`api/[...path].ts`) and `vercel.json` rewrites. It is not a Next.js app. A new `/api/mcp` handler would need a dedicated Vercel route or careful dispatch ahead of the catch-all. Generic arbitrary SQL and service role writes can bypass application rules and RLS, so the tool design needs explicit accounting for that behavior.
