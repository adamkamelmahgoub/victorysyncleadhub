# Live public schema catalog

Read-only catalog snapshot generated from the configured PostgreSQL database on 2026-10-06. It contains 229 public relations (tables and views), 2451 columns, 198 foreign-key rows, 404 active RLS policies, and 7 enum types. No row data is included. This snapshot can change after migrations.

## Relations and columns

### `public.access_codes`

`id` uuid NOT NULL � `code` text NOT NULL � `client_id` uuid � `role` text NOT NULL � `max_uses` int4 NOT NULL � `used_count` int4 NOT NULL � `expires_at` timestamptz � `created_by` uuid � `created_at` timestamptz NOT NULL

### `public.access_control`

`id` uuid NOT NULL � `auth_user_id` uuid NOT NULL � `email` text NOT NULL � `client_id` uuid NOT NULL � `role` text NOT NULL � `created_at` timestamptz NOT NULL

### `public.activities`

`id` uuid NOT NULL � `lead_id` uuid NOT NULL � `type` text NOT NULL � `description` text NOT NULL � `created_at` timestamptz NOT NULL

### `public.activity_logs`

`id` uuid NOT NULL � `user_id` uuid � `organization_id` uuid � `session_id` text � `event_type` text NOT NULL � `event_name` text NOT NULL � `page` text � `element` text � `metadata` jsonb � `ip_address` text � `user_agent` text � `created_at` timestamptz

### `public.admin_client_lead_activities`

`id` uuid NOT NULL � `lead_id` uuid NOT NULL � `organization_id` uuid NOT NULL � `activity_type` text NOT NULL � `summary` text NOT NULL � `changes` jsonb NOT NULL � `actor_id` uuid � `actor_name` text � `created_at` timestamptz NOT NULL

### `public.admin_client_leads`

`id` uuid NOT NULL � `organization_id` uuid NOT NULL � `first_name` text � `last_name` text � `phone` text � `email` text � `company` text � `source` text � `status` text NOT NULL � `disposition` text NOT NULL � `priority` text NOT NULL � `assigned_to` text � `attempts` int4 NOT NULL � `last_contacted_at` timestamptz � `next_follow_up_at` timestamptz � `do_not_contact` bool NOT NULL � `notes` text � `raw_payload` jsonb NOT NULL � `created_by` uuid � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.affiliates`

`id` uuid NOT NULL � `name` text NOT NULL � `email` text NOT NULL � `phone` text � `company` text � `referral_code` text NOT NULL � `commission_rate` numeric NOT NULL � `status` text NOT NULL � `total_referrals` int4 NOT NULL � `total_converted` int4 NOT NULL � `total_earned` numeric NOT NULL � `total_paid` numeric NOT NULL � `payout_method` text � `payout_details` text � `notes` text � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.agent_extensions`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `user_id` uuid NOT NULL � `extension` text NOT NULL � `display_name` text � `created_at` timestamptz � `updated_at` timestamptz

### `public.agent_live_status`

`id` uuid NOT NULL � `org_id` uuid � `org_member_id` uuid � `user_id` uuid � `mightycall_extension` text NOT NULL � `extension` text � `mightycall_user_id` text � `raw_status` text � `normalized_status` text NOT NULL � `current_call_id` text � `current_call_direction` text � `current_counterpart_number` text � `status_started_at` timestamptz � `last_synced_at` timestamptz NOT NULL � `raw_payload` jsonb � `external_call_id` text � `direction` text � `from_number` text � `to_number` text � `status` text NOT NULL � `started_at` timestamptz � `answered_at` timestamptz � `ended_at` timestamptz � `last_event_at` timestamptz NOT NULL � `raw_event` jsonb � `stale` bool NOT NULL � `source` text � `sync_error` text � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL � `agent_name` text � `business_number` text

### `public.agents`

`id` uuid NOT NULL � `name` text NOT NULL � `team` text � `client_id` uuid NOT NULL

### `public.ai_calls`

`id` uuid NOT NULL � `lead_id` uuid NOT NULL � `campaign_id` uuid NOT NULL � `vendor` text NOT NULL � `vendor_call_id` text � `status` text NOT NULL � `started_at` timestamptz � `ended_at` timestamptz � `duration_seconds` int4 � `transcript` text � `outcome` text � `ai_handled` bool NOT NULL � `raw_payload` jsonb NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.ai_campaigns`

`id` uuid NOT NULL � `organization_id` uuid � `name` text NOT NULL � `client_name` text NOT NULL � `qualification_config` jsonb NOT NULL � `voice_config` jsonb NOT NULL � `routing_config` jsonb NOT NULL � `active` bool NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.api_keys`

`id` uuid NOT NULL � `name` text NOT NULL � `key_hash` text NOT NULL � `key_prefix` text NOT NULL � `scopes` text[] NOT NULL � `sub_account_id` uuid � `created_by` text NOT NULL � `last_used_at` timestamptz � `expires_at` timestamptz � `is_active` bool NOT NULL � `request_count` int4 NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.api_logs`

`id` uuid NOT NULL � `user_id` uuid � `organization_id` uuid � `session_id` text � `method` text NOT NULL � `endpoint` text NOT NULL � `status_code` int4 � `response_time_ms` int4 � `request_size_bytes` int4 � `response_size_bytes` int4 � `ip_address` text � `user_agent` text � `created_at` timestamptz

### `public.application_rate_limits`

`ip` text NOT NULL � `created_at` timestamptz NOT NULL

### `public.applications`

`id` uuid NOT NULL � `full_name` text NOT NULL � `email` text NOT NULL � `phone` text NOT NULL � `location` text NOT NULL � `experience` text NOT NULL � `us_hours` text NOT NULL � `desired_salary` numeric � `currency` text � `commission_preference` text NOT NULL � `voice_file_path` text � `voice_link` text � `pitch` text NOT NULL � `linkedin_url` text � `source` text � `user_agent` text � `created_at` timestamptz NOT NULL � `roles` text[] NOT NULL � `other_role` text

### `public.audit_logs`

`id` uuid NOT NULL � `actor_id` uuid � `org_id` uuid � `action` text NOT NULL � `entity_type` text � `entity_id` text � `metadata` jsonb NOT NULL � `created_at` timestamptz NOT NULL

### `public.auth_lockouts`

`id` uuid NOT NULL � `ip_address` text NOT NULL � `locked_until` timestamptz NOT NULL � `failed_count` int4 NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.auth_logs`

`id` uuid NOT NULL � `user_id` uuid � `organization_id` uuid � `event_type` text NOT NULL � `email` text � `ip_address` text � `user_agent` text � `failure_reason` text � `created_at` timestamptz

### `public.automation_workflows`

`id` uuid NOT NULL � `name` text NOT NULL � `trigger_type` text NOT NULL � `trigger_config` jsonb NOT NULL � `actions` jsonb NOT NULL � `is_active` bool NOT NULL � `enrolled_count` int4 NOT NULL � `completed_count` int4 NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.billing_packages`

`id` uuid NOT NULL � `name` text NOT NULL � `description` text NOT NULL � `price_monthly` numeric NOT NULL � `price_yearly` numeric NOT NULL � `features` jsonb � `is_active` bool � `created_at` timestamptz � `updated_at` timestamptz

### `public.billing_plans`

`id` uuid NOT NULL � `name` text NOT NULL � `description` text � `base_monthly_cost` numeric � `included_minutes` int4 � `included_sms` int4 � `overage_minute_cost` numeric � `overage_sms_cost` numeric � `features` jsonb � `is_active` bool � `created_at` timestamptz � `updated_at` timestamptz � `stripe_product_id` text � `stripe_price_id` text � `currency` text � `billing_interval` text

### `public.billing_records`

`id` uuid NOT NULL � `org_id` uuid � `user_id` uuid � `type` text NOT NULL � `description` text � `amount` numeric NOT NULL � `currency` text NOT NULL � `stripe_customer_id` text � `stripe_payment_intent_id` text � `stripe_subscription_id` text � `status` text NOT NULL � `billable_start` timestamptz � `billable_end` timestamptz � `paid_at` timestamptz � `metadata` jsonb NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL � `stripe_checkout_session_id` text � `stripe_invoice_id` text

### `public.booking_appointments`

`id` uuid NOT NULL � `event_type_id` uuid NOT NULL � `guest_name` text NOT NULL � `guest_email` text NOT NULL � `guest_phone` text � `guest_company` text � `start_at` timestamptz NOT NULL � `end_at` timestamptz NOT NULL � `timezone` text NOT NULL � `status` text NOT NULL � `notes` text � `answers` jsonb � `meeting_link` text � `cancel_reason` text � `lead_id` uuid � `reminder_sent_at` timestamptz � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.call_events`

`id` uuid NOT NULL � `org_id` uuid � `external_event_id` text NOT NULL � `external_call_id` text � `event_type` text NOT NULL � `event_at` timestamptz NOT NULL � `agent_extension` text � `direction` text � `from_number` text � `to_number` text � `raw_payload` jsonb � `created_at` timestamptz NOT NULL

### `public.call_history`

`id` uuid NOT NULL � `org_id` uuid � `external_id` text NOT NULL � `from_number` text � `to_number` text � `direction` text � `status` text � `duration_seconds` int4 � `call_date` timestamptz � `recording_url` text � `metadata` jsonb � `created_at` timestamptz � `updated_at` timestamptz

### `public.call_intelligence`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `external_call_id` text NOT NULL � `recording_id` text � `transcript` text � `transcript_status` text NOT NULL � `notes` text � `disposition` text � `quality_score` numeric � `quality_breakdown` jsonb NOT NULL � `searchable_text` tsvector � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.call_outcome_stage_mappings`

`id` uuid NOT NULL � `organization_id` uuid NOT NULL � `outcome` text NOT NULL � `target_stage_id` uuid NOT NULL � `enabled` bool NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.call_recordings`

`id` uuid NOT NULL � `org_id` uuid � `phone_number_id` uuid � `call_id` text NOT NULL � `recording_date` timestamptz NOT NULL � `duration_seconds` int4 � `recording_url` text � `data` jsonb � `created_at` timestamptz

### `public.call_reports`

`id` uuid NOT NULL � `org_id` uuid � `phone_number_id` uuid � `report_type` text NOT NULL � `report_date` date NOT NULL � `total_calls` int4 � `answered_calls` int4 � `avg_wait_seconds` numeric � `data` jsonb � `created_at` timestamptz � `updated_at` timestamptz

### `public.call_stats_daily_30d`

`org_id` uuid � `bucket` timestamptz � `total_calls` int8 � `answered_calls` int8 � `missed_calls` int8

### `public.call_stats_daily_7d`

`org_id` uuid � `bucket` timestamptz � `total_calls` int8 � `answered_calls` int8 � `missed_calls` int8

### `public.call_stats_hourly_today`

`org_id` uuid � `bucket` timestamptz � `total_calls` int8 � `answered_calls` int8 � `missed_calls` int8

### `public.call_stats_monthly_12m`

`org_id` uuid � `bucket` timestamptz � `total_calls` int8 � `answered_calls` int8 � `missed_calls` int8

### `public.call_transfers`

`id` uuid NOT NULL � `org_id` uuid � `external_transfer_id` text NOT NULL � `external_call_id` text � `transfer_type` text NOT NULL � `transfer_target` text � `result` text NOT NULL � `agent_extension` text � `original_caller` text � `original_receiving_number` text � `direction` text � `transferred_at` timestamptz NOT NULL � `raw_payload` jsonb � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL � `extension` text � `from_number` text � `to_number` text � `business_number` text � `transfer_status` text NOT NULL

### `public.calls`

`id` uuid NOT NULL � `agent_id` uuid � `client_id` uuid � `date` date NOT NULL � `duration_seconds` int4 � `result` text � `satisfaction_score` int4 � `revenue_generated` numeric � `is_missed` bool � `first_call_resolution` bool � `talk_time_seconds` int4 � `listen_time_seconds` int4 � `created_at` timestamptz NOT NULL � `started_at` timestamptz � `duration_sec` int4 � `csat` numeric � `revenue` numeric � `talk_sec` int4 � `listen_sec` int4 � `provider` text � `provider_call_id` text � `direction` text � `from_number` text � `to_number` text � `queue_or_number` text � `campaign_id` text � `recording_url` text � `is_sale` bool � `week_start` date � `month_start` date � `status` text � `metadata` jsonb � `queue_name` text � `org_id` uuid � `answered_at` timestamptz � `ended_at` timestamptz � `to_number_digits` text � `agent_extension` text � `from_number_digits` text � `external_id` text � `external_call_id` text � `org_member_id` uuid � `mightycall_user_id` text � `extension` text � `business_number` text � `connected_at` timestamptz � `wait_seconds` int4 � `has_recording` bool � `raw_payload` jsonb

### `public.calls_final`

`provider` text � `provider_call_id` text � `received_at` timestamptz � `direction` text � `status` text � `duration_seconds` int4 � `from_number` text � `to_number` text � `from_digits` text � `to_digits` text � `payload` jsonb

### `public.calls_raw`

`id` int8 NOT NULL � `received_at` timestamptz � `payload` jsonb NOT NULL � `provider` text � `provider_call_id` text � `direction` text � `status` text � `duration_seconds` int4 � `from_number` text � `to_number` text � `client_id` text � `from_number_digits` text � `to_number_digits` text

### `public.campaign_leads`

`campaign_id` uuid NOT NULL � `lead_id` uuid NOT NULL � `status` text NOT NULL � `created_at` timestamptz NOT NULL

### `public.campaigns`

`id` uuid NOT NULL � `name` text NOT NULL � `description` text � `status` text NOT NULL � `source_type` text � `subject` text � `from_name` text � `from_email` text � `body` text � `send_rate_per_hour` int4 NOT NULL � `daily_limit` int4 NOT NULL � `send_window_start` text NOT NULL � `send_window_end` text NOT NULL � `scheduled_at` timestamptz � `launched_at` timestamptz � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.client_metrics_today`

`org_id` uuid � `day` date � `total_calls` int8 � `answered_calls` int8 � `answer_rate_pct` numeric � `avg_wait_seconds` numeric

### `public.clients`

`id` uuid NOT NULL � `name` text NOT NULL � `email` text � `logo_url` text � `plan` text � `join_date` date � `slug` text � `created_at` timestamptz NOT NULL

### `public.companies`

`id` uuid NOT NULL � `name` text NOT NULL � `phone` text NOT NULL � `city` text NOT NULL � `state` text NOT NULL � `industry` text NOT NULL � `contact_name` text NOT NULL � `fit_notes` text NOT NULL � `source` text NOT NULL � `stage` text NOT NULL � `needs_verification` bool NOT NULL � `trial_type` text � `trial_start_date` date � `trial_end_date` date � `trial_capacity_slot` text � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL � `email` text NOT NULL � `website` text NOT NULL � `address` text NOT NULL � `postal_code` text NOT NULL � `country` text NOT NULL � `tags` text[] NOT NULL � `contacts` jsonb NOT NULL � `custom_fields` jsonb NOT NULL � `next_action` text NOT NULL � `next_follow_up_at` timestamptz � `coverage_hours` text NOT NULL � `coverage_timezone` text NOT NULL � `expected_daily_leads` int4 � `trial_success_criteria` text NOT NULL � `trial_results` text NOT NULL � `proposed_monthly_price` numeric � `currency` text NOT NULL � `close_call_at` timestamptz � `close_notes` text NOT NULL � `deleted_at` timestamptz � `meeting_at` timestamptz � `meeting_timezone` text � `meeting_booked_by` uuid � `meeting_booked_at` timestamptz � `updated_by` uuid

### `public.company_activities`

`id` uuid NOT NULL � `company_id` uuid NOT NULL � `direction` text NOT NULL � `outcome` text NOT NULL � `response_time_minutes` float8 � `notes` text NOT NULL � `occurred_at` timestamptz NOT NULL � `logged_by` uuid NOT NULL � `created_at` timestamptz NOT NULL

### `public.company_files`

`id` uuid NOT NULL � `company_id` uuid NOT NULL � `file_name` text NOT NULL � `storage_path` text NOT NULL � `mime_type` text NOT NULL � `size_bytes` int4 NOT NULL � `uploaded_by` uuid NOT NULL � `created_at` timestamptz NOT NULL

### `public.company_tasks`

`id` uuid NOT NULL � `company_id` uuid NOT NULL � `title` text NOT NULL � `kind` text NOT NULL � `status` text NOT NULL � `priority` text NOT NULL � `due_at` timestamptz � `assignee` text NOT NULL � `notes` text NOT NULL � `created_by` uuid NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.consultation_requests`

`id` uuid NOT NULL � `full_name` text NOT NULL � `business_name` text NOT NULL � `email` text NOT NULL � `phone` text NOT NULL � `industry` text NOT NULL � `interested_in` text[] NOT NULL � `website` text � `notes` text � `best_time` text � `heard_about` text � `created_at` timestamptz NOT NULL � `utm_source` text � `utm_medium` text � `utm_campaign` text � `utm_content` text � `utm_term` text � `referrer` text � `landing_path` text � `calls_per_week` int4 � `missed_rate` numeric � `avg_job_value` numeric � `close_rate` numeric � `missed_calls_month` int4 � `lost_jobs_month` int4 � `lost_revenue_month` numeric � `lost_revenue_year` numeric � `source` text

### `public.contact_events`

`id` uuid NOT NULL � `org_id` uuid � `external_id` text NOT NULL � `name` text � `phone_numbers` text[] � `email` text � `event_type` text � `event_date` timestamptz � `metadata` jsonb � `created_at` timestamptz � `updated_at` timestamptz

### `public.contact_tasks`

`id` uuid NOT NULL � `lead_id` uuid NOT NULL � `title` text NOT NULL � `description` text � `due_date` timestamptz � `is_completed` bool NOT NULL � `completed_at` timestamptz � `priority` text NOT NULL � `created_at` timestamptz NOT NULL � `outreach_enrollment_id` text � `outreach_job_id` uuid � `outreach_step_number` int4 � `outreach_status` text

### `public.crm_activities`

`id` uuid NOT NULL � `organization_id` uuid NOT NULL � `company_id` uuid NOT NULL � `contact_id` uuid � `deal_id` uuid � `type` text NOT NULL � `body` text � `occurred_at` timestamptz NOT NULL � `created_by` uuid � `metadata` jsonb NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.crm_companies`

`id` uuid NOT NULL � `organization_id` uuid NOT NULL � `name` text NOT NULL � `phone` text � `city` text � `state` text � `industry` text � `source` text � `notes` text � `tags` text[] NOT NULL � `custom_fields` jsonb NOT NULL � `created_by` uuid � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.crm_contacts`

`id` uuid NOT NULL � `organization_id` uuid NOT NULL � `company_id` uuid � `source_lead_id` uuid � `first_name` text NOT NULL � `last_name` text � `title` text � `phone` text � `email` text � `tags` text[] NOT NULL � `custom_fields` jsonb NOT NULL � `created_by` uuid � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.crm_deals`

`id` uuid NOT NULL � `organization_id` uuid NOT NULL � `company_id` uuid NOT NULL � `primary_contact_id` uuid � `stage_id` uuid NOT NULL � `title` text NOT NULL � `next_action` text � `assigned_to` uuid � `source_lead_id` uuid � `custom_fields` jsonb NOT NULL � `stage_changed_at` timestamptz NOT NULL � `created_by` uuid � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.crm_import_jobs`

`id` uuid NOT NULL � `organization_id` uuid NOT NULL � `object_type` text NOT NULL � `file_name` text � `status` text NOT NULL � `total_rows` int4 NOT NULL � `inserted_rows` int4 NOT NULL � `skipped_rows` int4 NOT NULL � `error_rows` jsonb NOT NULL � `created_by` uuid � `created_at` timestamptz NOT NULL � `completed_at` timestamptz

### `public.crm_pipeline_stages`

`id` uuid NOT NULL � `organization_id` uuid NOT NULL � `name` text NOT NULL � `position` int4 NOT NULL � `color` text � `is_closed` bool NOT NULL � `is_won` bool NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.crm_saved_views`

`id` uuid NOT NULL � `organization_id` uuid NOT NULL � `user_id` uuid NOT NULL � `object_type` text NOT NULL � `name` text NOT NULL � `filters` jsonb NOT NULL � `is_default` bool NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.crm_tasks`

`id` uuid NOT NULL � `organization_id` uuid NOT NULL � `company_id` uuid NOT NULL � `contact_id` uuid � `deal_id` uuid � `title` text NOT NULL � `description` text � `due_date` timestamptz NOT NULL � `completed` bool NOT NULL � `completed_at` timestamptz � `assigned_to` uuid � `created_by` uuid � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.dispositions`

`id` int4 NOT NULL � `name` text NOT NULL � `color` text NOT NULL � `is_active` bool NOT NULL � `created_at` timestamptz NOT NULL

### `public.email_accounts`

`id` uuid NOT NULL � `from_name` text NOT NULL � `from_email` text NOT NULL � `smtp_host` text NOT NULL � `smtp_port` int4 NOT NULL � `smtp_user` text NOT NULL � `smtp_password` text NOT NULL � `is_default` bool NOT NULL � `daily_limit` int4 NOT NULL � `sent_today` int4 NOT NULL � `last_sent_reset_at` timestamptz NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL � `sending_domain_id` uuid � `provider` text NOT NULL � `daily_cap` int4 NOT NULL � `mailbox_timezone` text NOT NULL � `warmup_started_at` timestamptz NOT NULL � `status` outreach_mailbox_status NOT NULL � `email_engine_enabled` bool NOT NULL � `rotation_credit` numeric NOT NULL � `next_send_after` timestamptz NOT NULL � `inbound_provider` text NOT NULL � `inbound_credentials` text � `inbox_configured_at` timestamptz � `inbox_checked_at` timestamptz � `inbox_cursor` jsonb NOT NULL � `inbox_poll_after` timestamptz NOT NULL � `inbox_poll_token` uuid � `inbox_locked_at` timestamptz � `smtp_monitoring_mode` text NOT NULL � `signature` text � `label` text � `warmup_daily_cap` int4 � `archived_at` timestamptz

### `public.email_logs`

`id` uuid NOT NULL � `lead_id` uuid � `email_account_id` uuid � `sequence_id` uuid � `sequence_step_id` uuid � `to_email` text NOT NULL � `from_email` text NOT NULL � `subject` text NOT NULL � `body` text NOT NULL � `status` text NOT NULL � `opened_at` timestamptz � `replied_at` timestamptz � `sent_at` timestamptz NOT NULL

### `public.email_templates`

`id` uuid NOT NULL � `name` text NOT NULL � `subject` text NOT NULL � `body` text NOT NULL � `preview_text` text � `category` text NOT NULL � `tags` jsonb NOT NULL � `is_default` bool NOT NULL � `use_count` int4 NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.error_logs`

`id` uuid NOT NULL � `user_id` uuid � `organization_id` uuid � `session_id` text � `error_type` text NOT NULL � `error_message` text NOT NULL � `error_stack` text � `endpoint` text � `http_status` int4 � `request_payload` jsonb � `ip_address` text � `user_agent` text � `resolved` bool � `created_at` timestamptz

### `public.form_submissions`

`id` uuid NOT NULL � `form_id` uuid � `lead_id` uuid � `data` jsonb NOT NULL � `source_url` text � `created_at` timestamptz NOT NULL

### `public.forms`

`id` uuid NOT NULL � `name` text NOT NULL � `description` text � `status` text NOT NULL � `campaign_id` uuid � `fields` jsonb NOT NULL � `success_message` text � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.goals`

`id` uuid NOT NULL � `client_id` uuid NOT NULL � `kpi_name` text NOT NULL � `target_value` numeric NOT NULL � `period` text NOT NULL � `created_at` timestamptz NOT NULL

### `public.integration_alerts`

`id` uuid NOT NULL � `org_id` uuid � `provider` text NOT NULL � `alert_type` text NOT NULL � `severity` text NOT NULL � `status` text NOT NULL � `message` text NOT NULL � `metadata` jsonb NOT NULL � `first_seen_at` timestamptz NOT NULL � `last_seen_at` timestamptz NOT NULL � `acknowledged_at` timestamptz � `resolved_at` timestamptz

### `public.integration_health_snapshots`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `provider` text NOT NULL � `credentials_ok` bool NOT NULL � `webhook_ok` bool NOT NULL � `calls_sync_ok` bool NOT NULL � `recordings_sync_ok` bool NOT NULL � `last_webhook_at` timestamptz � `last_call_sync_at` timestamptz � `last_recording_sync_at` timestamptz � `last_error_code` text � `metrics` jsonb NOT NULL � `checked_at` timestamptz NOT NULL

### `public.integration_quarantine`

`id` uuid NOT NULL � `dedupe_key` text NOT NULL � `integration_type` text NOT NULL � `source_org_id` uuid � `external_id` text � `detected_numbers` text[] NOT NULL � `candidate_org_ids` uuid[] NOT NULL � `reason` text NOT NULL � `raw_payload` jsonb � `repaired_at` timestamptz � `repair_note` text � `created_at` timestamptz NOT NULL

### `public.integration_sync_jobs`

`id` uuid NOT NULL � `job_type` text NOT NULL � `status` text NOT NULL � `started_at` timestamptz � `completed_at` timestamptz � `records_processed` int4 � `error_message` text � `created_at` timestamptz � `org_id` uuid � `integration_type` text � `metadata` jsonb

### `public.integrations`

`id` uuid NOT NULL � `type` text NOT NULL � `name` text NOT NULL � `account_identifier` text � `status` text NOT NULL � `config` jsonb NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.invite_codes`

`id` uuid NOT NULL � `code_hash` text NOT NULL � `email` text NOT NULL � `name` text NOT NULL � `role` text NOT NULL � `team_member_id` uuid � `created_by` text NOT NULL � `used_by_user_id` text � `used_at` timestamptz � `expires_at` timestamptz NOT NULL � `created_at` timestamptz NOT NULL � `client_account_id` uuid � `org_id` uuid

### `public.invite_verification_codes`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `email` text NOT NULL � `invite_id` uuid � `code_hash` text NOT NULL � `expires_at` timestamptz NOT NULL � `consumed_at` timestamptz � `attempts` int4 NOT NULL � `created_at` timestamptz NOT NULL

### `public.invoice_items`

`id` uuid NOT NULL � `invoice_id` uuid NOT NULL � `description` text NOT NULL � `quantity` int4 NOT NULL � `unit_price` numeric NOT NULL � `total_price` numeric NOT NULL � `metadata` jsonb NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.invoice_line_items`

`id` uuid NOT NULL � `invoice_id` uuid NOT NULL � `description` text � `service_code` text � `quantity` numeric � `unit_price` numeric � `line_total` numeric � `metadata` jsonb � `created_at` timestamptz

### `public.invoices`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `invoice_number` text NOT NULL � `billing_period` daterange � `subtotal` numeric NOT NULL � `tax` numeric NOT NULL � `total` numeric NOT NULL � `currency` text NOT NULL � `status` text NOT NULL � `stripe_invoice_id` text � `stripe_customer_id` text � `issued_at` timestamptz � `due_at` timestamptz � `paid_at` timestamptz � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL � `stripe_subscription_id` text � `stripe_checkout_session_id` text � `stripe_payment_intent_id` text � `stripe_hosted_invoice_url` text � `stripe_invoice_pdf` text � `amount_due` numeric � `amount_paid` numeric

### `public.lead_duplicates`

`id` uuid NOT NULL � `phone` text NOT NULL � `source_lead_id` text � `received_at` timestamptz � `original_lead_id` uuid � `raw_payload` jsonb � `source` text

### `public.lead_list_uploads`

`id` uuid NOT NULL � `uploaded_by` uuid NOT NULL � `organization_id` uuid � `assigned_agent_id` uuid � `row_count` int4 NOT NULL � `inserted_count` int4 NOT NULL � `failed_count` int4 NOT NULL � `status` text NOT NULL � `created_at` timestamptz NOT NULL � `completed_at` timestamptz

### `public.lead_routing_events`

`id` uuid NOT NULL � `lead_id` uuid NOT NULL � `qualification_result_id` uuid � `assigned_agent` text NOT NULL � `assigned_agent_id` text � `hubspot_synced` bool NOT NULL � `hubspot_error` text � `created_at` timestamptz NOT NULL

### `public.lead_sources`

`id` uuid NOT NULL � `source_name` text NOT NULL � `campaign_id` text � `organization_id` uuid NOT NULL � `lead_type` text � `active` bool � `created_at` timestamptz � `campaign_name` text � `source_label` text � `description` text � `routing_priority` int4 NOT NULL � `updated_at` timestamptz NOT NULL

### `public.leads`

`id` uuid NOT NULL � `organization_id` uuid � `first_name` text � `last_name` text � `phone` text NOT NULL � `email` text � `state` text � `debt_amount` numeric � `lead_type` text � `opt_in_source` text � `ip_address` text � `tcpa_consent` bool � `tcpa_timestamp` timestamptz � `status` text � `assigned_agent_id` uuid � `assigned_at` timestamptz � `contacted_at` timestamptz � `transferred_at` timestamptz � `call_attempts` int4 � `notes` text � `source` text � `source_lead_id` text � `raw_payload` jsonb � `received_at` timestamptz � `created_at` timestamptz � `updated_at` timestamptz � `trusted_id` text � `form_number` text � `lead_source_id` uuid � `campaign_id` text � `campaign_name` text � `lead_list_upload_id` uuid � `company` text � `title` text � `score` int4 NOT NULL � `form_id` uuid � `pipeline_stage_id` uuid � `tags` text[] NOT NULL � `custom_fields` jsonb NOT NULL � `disposition` outreach_disposition � `contact_attempts` int4 NOT NULL � `client_account_id` uuid � `ai_campaign_id` uuid � `ai_resolution` text � `hubspot_contact_id` text � `qualification_score` numeric � `qualified_at` timestamptz � `timezone` outreach_timezone NOT NULL � `timezone_confirmed` bool NOT NULL � `next_action_at` timestamptz � `attempt_count` int4 NOT NULL � `first_attempt_at` timestamptz � `revisit_at` timestamptz � `dnc` bool NOT NULL � `suppressed_reason` outreach_suppression_reason � `normalized_email` text � `normalized_phone` text � `avg_job_value` numeric � `missed_calls_per_week` int4 � `after_hours_coverage` text � `uses_answering_service` bool � `email_verification_status` outreach_verification_status NOT NULL � `verified_at` timestamptz � `verified_email` text � `meeting_at` timestamptz � `meeting_timezone` text � `meeting_booked_by` uuid � `meeting_booked_at` timestamptz � `updated_by` uuid

### `public.live_agent_presence`

`org_id` uuid NOT NULL � `user_id` uuid NOT NULL � `extension` text NOT NULL � `email` text � `display_name` text � `on_call` bool NOT NULL � `status` text � `counterpart` text � `started_at` timestamptz � `source` text � `raw_status` text � `last_seen_at` timestamptz � `refreshed_at` timestamptz NOT NULL � `stale_after` timestamptz NOT NULL � `sync_version` text � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.live_agent_statuses`

`id` uuid NOT NULL � `org_id` uuid � `org_member_id` uuid � `mightycall_user_id` text � `agent_name` text � `extension` text � `status` text NOT NULL � `raw_status` text � `direction` text � `current_call_id` text � `from_number` text � `to_number` text � `business_number` text � `started_at` timestamptz � `connected_at` timestamptz � `last_seen_at` timestamptz NOT NULL � `raw_payload` jsonb � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.meeting_appointments`

`id` uuid NOT NULL � `event_type_id` uuid NOT NULL � `guest_name` text NOT NULL � `guest_email` text NOT NULL � `guest_phone` text � `guest_company` text � `start_at` timestamptz NOT NULL � `end_at` timestamptz NOT NULL � `timezone` text NOT NULL � `status` text NOT NULL � `notes` text � `answers` jsonb � `meeting_link` text � `cancel_reason` text � `lead_id` uuid � `reminder_sent_at` timestamptz � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.meeting_event_types`

`id` uuid NOT NULL � `slug` text NOT NULL � `title` text NOT NULL � `description` text � `duration_minutes` int4 NOT NULL � `color` text NOT NULL � `location` text � `is_active` bool NOT NULL � `requires_confirmation` bool NOT NULL � `buffer_before` int4 NOT NULL � `buffer_after` int4 NOT NULL � `max_bookings_per_day` int4 � `questions` jsonb � `available_days` text[] NOT NULL � `available_start` text NOT NULL � `available_end` text NOT NULL � `timezone` text NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.memberships`

`id` int8 NOT NULL � `user_id` uuid � `org_id` uuid � `role` text

### `public.mightycall_call_logs`

`id` uuid NOT NULL � `org_id` uuid � `external_id` text NOT NULL � `from_number` text � `to_number` text � `from_number_digits` text � `to_number_digits` text � `started_at` timestamptz � `answered_at` timestamptz � `ended_at` timestamptz � `duration_seconds` int4 � `status` text � `direction` text � `queue_name` text � `agent_extension` text � `metadata` jsonb NOT NULL � `raw_payload` jsonb NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.mightycall_extensions`

`id` uuid NOT NULL � `extension` text NOT NULL � `external_id` text � `display_name` text � `created_at` timestamptz � `updated_at` timestamptz

### `public.mightycall_recordings`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `phone_number_id` uuid � `call_id` uuid � `recording_url` text NOT NULL � `duration_seconds` int4 � `recording_date` timestamptz � `metadata` jsonb NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL � `from_number` text � `to_number` text � `external_call_id` text � `external_recording_id` text � `org_member_id` uuid � `mightycall_user_id` text � `extension` text � `direction` text � `business_number` text � `raw_payload` jsonb � `external_id` text � `recorded_at` timestamptz

### `public.mightycall_reports`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `phone_number_id` uuid � `report_type` text NOT NULL � `report_date` date NOT NULL � `data` jsonb NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.mightycall_sms_messages`

`id` uuid NOT NULL � `org_id` uuid � `phone_id` uuid � `external_id` text � `external_sms_id` text � `from_number` text � `to_number` text � `sender` text � `recipient` text � `direction` text � `status` text � `message` text � `body` text � `message_date` timestamptz � `sent_at` timestamptz � `created_at` timestamptz � `updated_at` timestamptz � `message_text` text � `metadata` jsonb � `external_message_id` text � `business_number` text � `raw_payload` jsonb

### `public.mightycall_webhook_inbox`

`id` uuid NOT NULL � `provider_event_id` text NOT NULL � `org_id` uuid � `event_type` text NOT NULL � `external_call_id` text � `extension` text � `occurred_at` timestamptz � `payload_encrypted` text NOT NULL � `status` text NOT NULL � `attempts` int4 NOT NULL � `error_code` text � `next_attempt_at` timestamptz � `processed_at` timestamptz � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.notes`

`id` uuid NOT NULL � `lead_id` uuid NOT NULL � `content` text NOT NULL � `created_at` timestamptz NOT NULL

### `public.notification_preferences`

`user_id` uuid NOT NULL � `org_id` uuid � `email` text � `billing_emails` bool NOT NULL � `payment_emails` bool NOT NULL � `account_emails` bool NOT NULL � `organization_emails` bool NOT NULL � `dashboard_update_emails` bool NOT NULL � `lead_emails` bool NOT NULL � `support_emails` bool NOT NULL � `sync_emails` bool NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.onboarding_progress`

`id` uuid NOT NULL � `sub_account_id` uuid NOT NULL � `completed_steps` text[] NOT NULL � `current_step` text NOT NULL � `is_completed` bool NOT NULL � `completed_at` timestamptz � `metadata` jsonb � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.org_api_keys`

`id` uuid NOT NULL � `org_id` uuid � `key_hash` text NOT NULL � `label` text � `created_by` uuid � `created_at` timestamptz � `last_used_at` timestamptz

### `public.org_billing_locks`

`org_id` uuid NOT NULL � `locked` bool NOT NULL � `reason` text � `locked_by` uuid � `locked_until` timestamptz � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.org_feature_access`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `feature_key` text NOT NULL � `enabled` bool NOT NULL � `visible_to_roles` text[] NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.org_integrations`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `provider` text NOT NULL � `encrypted_credentials` text NOT NULL � `metadata` jsonb NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.org_invites`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `email` text NOT NULL � `role` text NOT NULL � `invited_by` uuid � `invited_at` timestamptz

### `public.org_manager_permissions`

`id` uuid NOT NULL � `org_member_id` uuid NOT NULL � `can_manage_agents` bool � `can_manage_phone_numbers` bool � `can_edit_service_targets` bool � `can_view_billing` bool � `created_at` timestamptz � `updated_at` timestamptz

### `public.org_members`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `user_id` uuid NOT NULL � `role` text NOT NULL � `mightycall_extension` text � `created_at` timestamptz � `updated_at` timestamptz

### `public.org_numbers`

`id` int8 NOT NULL � `org_id` uuid NOT NULL � `phone_number` text NOT NULL � `label` text � `provider` text NOT NULL � `is_active` bool NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.org_packages`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `package_id` uuid NOT NULL � `status` text NOT NULL � `current_period_start` timestamptz NOT NULL � `current_period_end` timestamptz NOT NULL � `created_at` timestamptz � `updated_at` timestamptz

### `public.org_phone_numbers`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `phone_number` text NOT NULL � `label` text � `is_active` bool NOT NULL � `created_at` timestamptz NOT NULL � `phone_number_id` uuid

### `public.org_settings`

`org_id` uuid NOT NULL � `service_level_target_seconds` int4 NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.org_subscriptions`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `plan_id` uuid NOT NULL � `status` text � `billing_cycle_day` int4 � `next_billing_date` date � `auto_renew` bool � `created_at` timestamptz � `updated_at` timestamptz � `stripe_customer_id` text � `stripe_subscription_id` text � `stripe_price_id` text � `stripe_checkout_session_id` text � `current_period_start` timestamptz � `current_period_end` timestamptz � `cancel_at_period_end` bool � `seats` int4 � `metadata` jsonb

### `public.org_users`

`id` int8 NOT NULL � `org_id` uuid NOT NULL � `user_id` uuid NOT NULL � `role` org_role NOT NULL � `mightycall_extension` text � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.organizations`

`id` uuid NOT NULL � `name` text NOT NULL � `created_at` timestamptz � `leads_visibility` jsonb NOT NULL

### `public.outreach_audit`

`id` int8 NOT NULL � `lead_id` text � `actor` text NOT NULL � `reason` text NOT NULL � `details` jsonb NOT NULL � `created_at` timestamptz NOT NULL

### `public.outreach_call_outcomes`

`call_id` int8 NOT NULL � `connected` bool NOT NULL � `conversation` bool NOT NULL � `meeting_held_at` timestamptz � `updated_at` timestamptz NOT NULL

### `public.outreach_delivery_reports`

`mailbox_id` text NOT NULL � `event_id` text NOT NULL � `matched` int4 NOT NULL � `created_at` timestamptz NOT NULL

### `public.outreach_eligible_leads`

`id` uuid � `organization_id` uuid � `first_name` text � `last_name` text � `phone` text � `email` text � `state` text � `debt_amount` numeric � `lead_type` text � `opt_in_source` text � `ip_address` text � `tcpa_consent` bool � `tcpa_timestamp` timestamptz � `status` text � `assigned_agent_id` uuid � `assigned_at` timestamptz � `contacted_at` timestamptz � `transferred_at` timestamptz � `call_attempts` int4 � `notes` text � `source` text � `source_lead_id` text � `raw_payload` jsonb � `received_at` timestamptz � `created_at` timestamptz � `updated_at` timestamptz � `trusted_id` text � `form_number` text � `lead_source_id` uuid � `campaign_id` text � `campaign_name` text � `lead_list_upload_id` uuid � `company` text � `title` text � `score` int4 � `form_id` uuid � `pipeline_stage_id` uuid � `tags` text[] � `custom_fields` jsonb � `disposition` outreach_disposition � `contact_attempts` int4 � `client_account_id` uuid � `ai_campaign_id` uuid � `ai_resolution` text � `hubspot_contact_id` text � `qualification_score` numeric � `qualified_at` timestamptz � `timezone` outreach_timezone � `timezone_confirmed` bool � `next_action_at` timestamptz � `attempt_count` int4 � `first_attempt_at` timestamptz � `revisit_at` timestamptz � `dnc` bool � `suppressed_reason` outreach_suppression_reason � `normalized_email` text � `normalized_phone` text � `avg_job_value` numeric � `missed_calls_per_week` int4 � `after_hours_coverage` text � `uses_answering_service` bool � `email_verification_status` outreach_verification_status � `verified_at` timestamptz � `verified_email` text

### `public.outreach_email_alerts`

`id` int8 NOT NULL � `mailbox_id` text � `reason` text NOT NULL � `created_at` timestamptz NOT NULL � `acknowledged_at` timestamptz

### `public.outreach_email_events`

`provider` text NOT NULL � `event_id` text NOT NULL � `job_id` uuid NOT NULL � `type` text NOT NULL � `received_at` timestamptz NOT NULL

### `public.outreach_email_jobs`

`id` uuid NOT NULL � `lead_id` uuid � `mailbox_id` uuid NOT NULL � `enrollment_id` text � `to_email` text NOT NULL � `phone_snapshot` text � `subject` text NOT NULL � `body` text NOT NULL � `state` text NOT NULL � `not_before` timestamptz NOT NULL � `dispatched_at` timestamptz � `sent_at` timestamptz � `mailbox_day` date � `global_day` date � `provider_message_id` text � `claim_token` uuid � `unsubscribe_hash` text NOT NULL � `unsubscribe_token` text NOT NULL � `failure_reason` text � `created_at` timestamptz NOT NULL � `sequence_step_number` int4 � `rfc_message_id` text � `operator_verification_override` bool NOT NULL � `campaign_id` uuid

### `public.outreach_email_legacy_mailboxes`

`mailbox_id` text � `daily_limit` int4 � `sent_today` int4 � `last_sent_reset_at` timestamptz

### `public.outreach_email_settings`

`id` bool NOT NULL � `engine_enabled` bool NOT NULL � `global_daily_cap` int4 NOT NULL � `reset_timezone` text NOT NULL � `primary_domains` text[] NOT NULL � `direct_link_domains` text[] NOT NULL

### `public.outreach_inbound_messages`

`id` uuid NOT NULL � `mailbox_id` text NOT NULL � `provider_id` text NOT NULL � `from_email` text NOT NULL � `from_domain` text NOT NULL � `subject` text NOT NULL � `body` text NOT NULL � `received_at` timestamptz NOT NULL � `recorded_at` timestamptz NOT NULL � `is_auto_reply` bool NOT NULL � `return_at` timestamptz � `positive_reply` bool

### `public.outreach_legacy_leads`

`lead_id` text � `disposition` text � `contact_attempts` int4

### `public.outreach_mailbox_health`

`id` uuid � `from_name` text � `from_email` text � `provider` text � `sending_domain_id` uuid � `status` outreach_mailbox_status � `daily_cap` int4 � `mailbox_timezone` text � `warmup_started_at` timestamptz � `email_engine_enabled` bool � `created_at` timestamptz � `effective_cap` int4 � `sent_today` int4 � `bounce_rate_7d` numeric � `complaint_rate_7d` numeric � `label` text � `warmup_daily_cap` int4 � `archived_at` timestamptz

### `public.outreach_phase3_legacy_enrollments`

`id` text � `status` text � `next_send_at` timestamptz

### `public.outreach_phase3_restore`

`proname` name � `definition` text

### `public.outreach_phase3_seed`

`sequence_id` text NOT NULL

### `public.outreach_phase4_restore`

`name` text NOT NULL � `definition` text NOT NULL

### `public.outreach_suppressions`

`identity_type` text NOT NULL � `identity_value` text NOT NULL � `reason` outreach_suppression_reason NOT NULL � `created_at` timestamptz NOT NULL

### `public.outreach_verification_config`

`singleton` bool NOT NULL � `encrypted_credentials` text NOT NULL

### `public.outreach_workflow_logs`

`id` int8 NOT NULL � `run_id` uuid NOT NULL � `step_number` int4 � `node_type` text NOT NULL � `status` text NOT NULL � `details` jsonb NOT NULL � `created_at` timestamptz NOT NULL

### `public.outreach_workflow_runs`

`id` uuid NOT NULL � `workflow_id` uuid NOT NULL � `lead_id` text NOT NULL � `event_key` text NOT NULL � `status` text NOT NULL � `current_step` int4 NOT NULL � `next_step_at` timestamptz NOT NULL � `context` jsonb NOT NULL � `lease` uuid � `lease_until` timestamptz � `last_error` text � `created_at` timestamptz NOT NULL � `completed_at` timestamptz

### `public.packages`

`id` uuid NOT NULL � `name` text NOT NULL � `description` text � `type` text NOT NULL � `features` jsonb NOT NULL � `pricing` jsonb NOT NULL � `is_active` bool NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.page_view_logs`

`id` uuid NOT NULL � `user_id` uuid � `organization_id` uuid � `session_id` text � `page` text NOT NULL � `page_title` text � `referrer` text � `time_on_page_seconds` int4 � `ip_address` text � `user_agent` text � `created_at` timestamptz

### `public.payment_methods`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `type` text NOT NULL � `token` text � `last_four` text � `expiry_month` int4 � `expiry_year` int4 � `is_default` bool � `status` text � `created_at` timestamptz � `updated_at` timestamptz

### `public.payment_transactions`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `invoice_id` uuid � `payment_method_id` uuid � `amount` numeric � `status` text � `transaction_date` timestamptz � `external_id` text � `error_message` text � `metadata` jsonb � `created_at` timestamptz � `updated_at` timestamptz � `stripe_payment_intent_id` text � `stripe_charge_id` text � `stripe_invoice_id` text � `currency` text

### `public.phone_number_requests`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `requested_by` uuid NOT NULL � `requested_number` text NOT NULL � `requested_label` text � `reason` text NOT NULL � `status` text NOT NULL � `created_at` timestamptz � `reviewed_at` timestamptz � `reviewed_by` uuid

### `public.phone_numbers`

`id` uuid NOT NULL � `number` text NOT NULL � `external_id` text NOT NULL � `org_id` uuid � `label` text � `created_at` timestamptz � `updated_at` timestamptz � `phone_number` text � `number_digits` text � `e164` text � `is_active` bool � `metadata` jsonb � `last_synced_at` timestamptz

### `public.pipeline_stages`

`id` uuid NOT NULL � `name` text NOT NULL � `color` text NOT NULL � `position` int4 NOT NULL � `created_at` timestamptz NOT NULL � `pipeline_id` uuid � `key` text

### `public.pipelines`

`id` uuid NOT NULL � `name` text NOT NULL � `description` text � `is_default` bool NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.platform_api_keys`

`id` uuid NOT NULL � `key_hash` text NOT NULL � `label` text � `created_by` uuid � `created_at` timestamptz � `last_used_at` timestamptz

### `public.platform_manager_permissions`

`id` uuid NOT NULL � `user_id` uuid NOT NULL � `can_manage_phone_numbers_global` bool � `can_manage_agents_global` bool � `can_manage_orgs` bool � `can_view_billing_global` bool � `created_at` timestamptz � `updated_at` timestamptz

### `public.portal_activity_log`

`id` int8 NOT NULL � `actor_id` uuid � `actor_email` text � `actor_name` text � `organization_id` text � `client_account_id` text � `session_id` text � `event_type` text NOT NULL � `action` text NOT NULL � `page_path` text � `target` text � `request_method` text � `request_status` int4 � `ip_address` text � `user_agent` text � `metadata` jsonb NOT NULL � `created_at` timestamptz NOT NULL

### `public.profiles`

`id` uuid NOT NULL � `full_name` text � `is_global_admin` bool � `created_at` timestamptz � `global_role` text � `updated_at` timestamptz NOT NULL � `can_upload_leads` bool NOT NULL � `email` text

### `public.prospects`

`id` uuid NOT NULL � `first_name` text NOT NULL � `last_name` text NOT NULL � `email` text � `phone` text � `title` text � `seniority` text � `department` text � `company` text � `company_size` text � `industry` text � `website` text � `linkedin_url` text � `twitter_url` text � `city` text � `state` text � `country` text � `technologies` text[] � `keywords` text[] � `email_verified` bool NOT NULL � `enriched_at` timestamptz � `source` text NOT NULL � `saved_to_leads` bool NOT NULL � `lead_id` uuid � `intent_score` int4 NOT NULL � `last_funding_round` text � `funding_total` text � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.qualification_results`

`id` uuid NOT NULL � `call_id` uuid NOT NULL � `score` numeric NOT NULL � `qualified` bool NOT NULL � `reasoning` text NOT NULL � `next_action` text NOT NULL � `scoring_version` text NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.rate_limit_violations`

`id` uuid NOT NULL � `ip_address` text NOT NULL � `endpoint` text NOT NULL � `user_id` uuid � `timestamp` timestamptz NOT NULL

### `public.recording_access_logs`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `recording_id` text NOT NULL � `actor_id` uuid � `action` text NOT NULL � `request_id` text � `metadata` jsonb NOT NULL � `created_at` timestamptz NOT NULL

### `public.recording_archives`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `recording_id` uuid � `external_call_id` text � `storage_bucket` text NOT NULL � `storage_path` text NOT NULL � `content_type` text � `byte_size` int8 � `checksum_sha256` text � `consent_status` text NOT NULL � `retention_until` timestamptz � `legal_hold` bool NOT NULL � `archived_at` timestamptz NOT NULL � `metadata` jsonb NOT NULL

### `public.recording_consents`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `external_call_id` text � `phone_number` text � `consent_status` text NOT NULL � `consent_method` text � `consented_at` timestamptz � `evidence` jsonb NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.referrals`

`id` uuid NOT NULL � `affiliate_id` uuid NOT NULL � `referred_email` text NOT NULL � `referred_name` text � `referred_company` text � `status` text NOT NULL � `sub_account_id` uuid � `deal_value` numeric � `commission` numeric � `commission_paid` bool NOT NULL � `paid_at` timestamptz � `converted_at` timestamptz � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.review_requests`

`id` uuid NOT NULL � `contact_name` text NOT NULL � `contact_email` text � `contact_phone` text � `channel` text NOT NULL � `platform` text NOT NULL � `status` text NOT NULL � `sent_at` timestamptz NOT NULL � `clicked_at` timestamptz

### `public.review_sources`

`id` uuid NOT NULL � `platform` text NOT NULL � `name` text NOT NULL � `business_id` text � `review_url` text � `config` jsonb NOT NULL � `status` text NOT NULL � `review_count` int4 NOT NULL � `avg_rating` text NOT NULL � `is_active` bool NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.reviews`

`id` uuid NOT NULL � `source_id` uuid � `platform` text NOT NULL � `reviewer` text NOT NULL � `reviewer_avatar` text � `rating` int4 NOT NULL � `text` text � `reply` text � `replied_at` timestamptz � `platform_review_id` text � `review_url` text � `sentiment` text � `is_read` bool NOT NULL � `created_at` timestamptz NOT NULL

### `public.roles`

`id` uuid NOT NULL � `name` text NOT NULL � `created_at` timestamptz � `updated_at` timestamptz

### `public.segments`

`id` uuid NOT NULL � `name` text NOT NULL � `description` text � `filters` jsonb NOT NULL � `contact_count` int4 NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.sending_domains`

`id` uuid NOT NULL � `domain` text NOT NULL � `is_primary` bool NOT NULL � `spf_verified` bool NOT NULL � `dkim_verified` bool NOT NULL � `dmarc_verified` bool NOT NULL � `dkim_selector` text NOT NULL � `status` outreach_domain_status NOT NULL � `verified_at` timestamptz � `created_at` timestamptz NOT NULL � `allow_primary_sending` bool NOT NULL � `deleted_at` timestamptz � `spf_host` text

### `public.sequence_enrollments`

`id` uuid NOT NULL � `sequence_id` uuid NOT NULL � `lead_id` uuid NOT NULL � `current_step` int4 NOT NULL � `status` text NOT NULL � `next_send_at` timestamptz � `completed_at` timestamptz � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL � `assigned_mailbox_id` uuid � `pause_reason` text � `resume_at` timestamptz � `stopped_reason` text � `manual_email_outcome` text � `manual_email_outcome_at` timestamptz

### `public.sequence_steps`

`id` uuid NOT NULL � `sequence_id` uuid NOT NULL � `step_number` int4 NOT NULL � `subject` text NOT NULL � `body` text NOT NULL � `delay_days` int4 NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL � `channel` text NOT NULL

### `public.sequences`

`id` uuid NOT NULL � `name` text NOT NULL � `status` text NOT NULL � `email_account_id` uuid � `total_enrolled` int4 NOT NULL � `total_sent` int4 NOT NULL � `total_opened` int4 NOT NULL � `total_replied` int4 NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL � `label` text � `archived_at` timestamptz

### `public.slack_notification_log`

`id` int8 NOT NULL � `lead_id` text NOT NULL � `event_type` text NOT NULL � `request_id` int8 � `status` text NOT NULL � `http_status` int4 � `error_message` text � `created_at` timestamptz NOT NULL � `checked_at` timestamptz � `lead_table` text NOT NULL

### `public.sms_logs`

`id` uuid NOT NULL � `org_id` uuid � `from_number` text � `to_numbers` text[] � `message_text` text � `direction` text � `status` text � `sent_at` timestamptz � `metadata` jsonb � `created_at` timestamptz � `updated_at` timestamptz

### `public.sso_tokens`

`id` uuid NOT NULL � `token` text NOT NULL � `sub_account_id` uuid NOT NULL � `external_user_id` text NOT NULL � `email` text NOT NULL � `name` text � `role` text NOT NULL � `used_at` timestamptz � `expires_at` timestamptz NOT NULL � `created_at` timestamptz NOT NULL

### `public.sub_accounts`

`id` uuid NOT NULL � `name` text NOT NULL � `slug` text NOT NULL � `owner_email` text NOT NULL � `owner_name` text NOT NULL � `phone` text � `industry` text � `website` text � `status` text NOT NULL � `plan` text NOT NULL � `external_id` text � `leads_count` int4 NOT NULL � `campaigns_count` int4 NOT NULL � `last_active_at` timestamptz � `health_score` int4 NOT NULL � `onboarding_completed` bool NOT NULL � `notes` text � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.support_ticket_messages`

`id` uuid NOT NULL � `ticket_id` uuid NOT NULL � `sender_user_id` uuid NOT NULL � `message` text NOT NULL � `created_at` timestamptz

### `public.support_tickets`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `created_by` uuid NOT NULL � `subject` text NOT NULL � `priority` text NOT NULL � `status` text NOT NULL � `created_at` timestamptz � `updated_at` timestamptz

### `public.team_members`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `user_id` uuid � `role` text NOT NULL � `name` text NOT NULL � `email` text NOT NULL � `phone` text � `is_active` bool � `created_at` timestamptz � `updated_at` timestamptz � `auth_user_id` text � `client_account_id` uuid � `page_permissions` jsonb � `status` text NOT NULL

### `public.usage_charges`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `phone_number_id` uuid � `charge_type` text NOT NULL � `quantity` numeric � `unit_cost` numeric � `total_cost` numeric � `service_date` date � `billing_period` date � `metadata` jsonb � `created_at` timestamptz

### `public.user_feature_access`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `user_id` uuid NOT NULL � `feature_key` text NOT NULL � `enabled` bool NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.user_mfa_email`

`id` uuid NOT NULL � `user_id` uuid NOT NULL � `email` text NOT NULL � `code_hash` text � `code_expires_at` timestamptz � `verified` bool NOT NULL � `enabled_at` timestamptz � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.user_mfa_totp`

`id` uuid NOT NULL � `user_id` uuid NOT NULL � `secret_ciphertext` text NOT NULL � `secret_iv` text NOT NULL � `secret_tag` text NOT NULL � `verified` bool NOT NULL � `enabled_at` timestamptz � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.user_packages`

`id` uuid NOT NULL � `user_id` uuid NOT NULL � `package_id` uuid NOT NULL � `assigned_by` uuid � `assigned_at` timestamptz NOT NULL � `expires_at` timestamptz � `is_active` bool NOT NULL � `metadata` jsonb NOT NULL

### `public.user_password_change_codes`

`id` uuid NOT NULL � `user_id` uuid NOT NULL � `email` text NOT NULL � `code_hash` text NOT NULL � `expires_at` timestamptz NOT NULL � `consumed_at` timestamptz � `created_at` timestamptz NOT NULL

### `public.user_phone_assignments`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `user_id` uuid NOT NULL � `phone_number_id` uuid NOT NULL � `can_call` bool � `can_receive` bool � `created_at` timestamptz � `updated_at` timestamptz

### `public.user_security_questions`

`id` uuid NOT NULL � `user_id` uuid NOT NULL � `question_order` int4 NOT NULL � `question` text NOT NULL � `answer_hash` text NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.users_roles`

`id` uuid NOT NULL � `role_id` uuid NOT NULL � `user_id` uuid NOT NULL � `created_at` timestamptz � `updated_at` timestamptz

### `public.v_calls_api`

`id` uuid � `provider` text � `provider_call_id` text � `direction` text � `from_number` text � `to_number` text � `queue_or_number` text � `campaign_id` text � `started_at` timestamptz � `duration_sec` int4 � `aht_mmss` text � `result` text � `csat` numeric � `revenue` numeric � `first_call_resolution` bool � `is_missed` bool � `talk_sec` int4 � `listen_sec` int4 � `recording_url` text � `org_id` uuid � `organization_name` text � `org_slug` text � `agent_id` uuid � `agent_name` text � `sale_flag` int4

### `public.v_calls_unique`

`provider` text � `provider_call_id` text � `received_at` timestamptz � `direction` text � `status` text � `duration_seconds` int4 � `from_number` text � `to_number` text � `from_digits` text � `to_digits` text � `business_digits` text � `peer_digits` text � `payload` jsonb

### `public.v_clients`

`id` uuid � `name` text � `created_at` timestamptz

### `public.v_kpis_daily`

`client_id` uuid � `day` date � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8 � `avg_duration_sec` int4

### `public.v_kpis_monthly`

`client_id` uuid � `month_start` date � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8 � `avg_duration_sec` int4

### `public.v_kpis_weekly`

`client_id` uuid � `week_start` date � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8 � `avg_duration_sec` int4

### `public.v_portal_users`

`id` uuid � `email` text � `client_id` uuid � `organization` text � `role` text � `auth_user_id` uuid � `auth_created_at` timestamptz

### `public.v_team_members`

`client_id` uuid � `role` text � `user_id` uuid � `email` varchar � `user_created_at` timestamptz

### `public.voicemail_logs`

`id` uuid NOT NULL � `org_id` uuid � `external_id` text NOT NULL � `from_number` text � `to_number` text � `duration_seconds` int4 � `message_date` timestamptz � `status` text � `transcription` text � `metadata` jsonb � `created_at` timestamptz � `updated_at` timestamptz

### `public.vs_agent_presence`

`org_id` uuid NOT NULL � `agent_id` text NOT NULL � `status` text NOT NULL � `status_since` timestamptz NOT NULL � `occupancy_pct` numeric � `current_call_ext_id` text � `updated_at` timestamptz NOT NULL

### `public.vs_agent_rollups`

`agent_id` uuid � `name` text � `org_id` uuid � `calls_count` int4 � `sales_count` int4 � `avg_aht_sec` int4 � `conv_pct` numeric � `csat_avg` numeric � `revenue_total` numeric

### `public.vs_calls`

`id` int8 NOT NULL � `org_id` uuid � `call_id` text NOT NULL � `direction` text � `status` text � `started_at` timestamptz � `answered_at` timestamptz � `ended_at` timestamptz

### `public.vs_calls_raw`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `external_call_id` text � `direction` text � `from_number` text � `to_number` text � `queue_id` uuid � `agent_id` text � `status` text � `arrived_at` timestamptz � `answered_at` timestamptz � `ended_at` timestamptz � `talk_seconds` int4 � `hold_seconds` int4 � `wrap_seconds` int4 � `disposition` text � `recording_url` text � `csat_score` numeric � `first_contact_resolved` bool � `created_at` timestamptz � `updated_at` timestamptz

### `public.vs_clients`

`id` uuid NOT NULL � `name` text NOT NULL � `timezone` text

### `public.vs_csat_responses`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `call_ext_id` text � `score` numeric � `comment` text � `created_at` timestamptz

### `public.vs_kpis_by_number`

`day` date � `normalized_from` text � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8

### `public.vs_kpis_daily`

`id` text � `day` date � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8 � `inbound_answered` int8 � `outbound_total` int8 � `outbound_answered` int8 � `answer_rate_pct` numeric � `avg_duration_sec` int4

### `public.vs_kpis_daily_custom`

`noloco_custom_query_id` text � `day` date � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8 � `inbound_answered` int8 � `outbound_total` int8 � `outbound_answered` int8 � `avg_duration_sec` int4

### `public.vs_kpis_daily_ext`

`day` date � `normalized_from` text � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8

### `public.vs_kpis_daily_v`

`id` text � `day` date � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8 � `outbound_total` int8 � `avg_duration_sec` int4

### `public.vs_kpis_daily_v2`

`id` text � `day` date � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8 � `avg_duration_sec` int4 � `answer_rate_pct` numeric

### `public.vs_kpis_monthly`

`id` text � `month_start` date � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8 � `inbound_answered` int8 � `outbound_total` int8 � `outbound_answered` int8 � `answer_rate_pct` numeric � `avg_duration_sec` int4

### `public.vs_kpis_monthly_custom`

`noloco_custom_query_id` text � `month_start` date � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8 � `inbound_answered` int8 � `outbound_total` int8 � `outbound_answered` int8 � `avg_duration_sec` int4

### `public.vs_kpis_monthly_v`

`id` text � `month_start` date � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8 � `outbound_total` int8 � `avg_duration_sec` int4

### `public.vs_kpis_monthly_v2`

`id` text � `month_start` date � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8 � `avg_duration_sec` int4 � `answer_rate_pct` numeric

### `public.vs_kpis_weekly`

`week_start` date � `calls_total` int8 � `calls_missed` int8 � `inbound_total` int8 � `inbound_answered` int8 � `outbound_total` int8 � `outbound_answered` int8 � `answer_rate_pct` numeric � `avg_duration_sec` int4

### `public.vs_kpis_weekly_custom`

`noloco_custom_query_id` text � `week_start` date � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8 � `inbound_answered` int8 � `outbound_total` int8 � `outbound_answered` int8 � `answer_rate_pct` numeric � `avg_duration_sec` int4

### `public.vs_kpis_weekly_v`

`id` text � `week_start` date � `calls_total` int8 � `calls_answered` int8 � `calls_missed` int8 � `inbound_total` int8 � `outbound_total` int8 � `avg_duration_sec` int4

### `public.vs_monthly_summary`

`org_id` uuid � `month_start` date � `total_calls` int4 � `aht_sec` int4 � `conversion_pct` numeric � `csat_avg` numeric � `revenue_total` numeric

### `public.vs_qa_scores`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `call_ext_id` text � `agent_id` text � `rubric_score` numeric � `notes` text � `coaching_flag` bool � `created_at` timestamptz

### `public.vs_queues`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `name` text NOT NULL � `sla_seconds` int4 NOT NULL

### `public.vs_users`

`id` uuid NOT NULL � `email` text NOT NULL � `role` text NOT NULL � `org_id` uuid NOT NULL

### `public.vs_voicemails`

`id` uuid NOT NULL � `org_id` uuid NOT NULL � `queue_id` uuid � `caller` text � `created_at` timestamptz � `duration_seconds` int4 � `transcript` text � `recording_url` text � `resolved` bool

### `public.vs_weekly_summary`

`org_id` uuid � `week_start` date � `total_calls` int4 � `aht_sec` int4 � `conversion_pct` numeric � `csat_avg` numeric � `revenue_total` numeric

### `public.webhook_inbox`

`id` int8 NOT NULL � `received_at` timestamptz NOT NULL � `provider` text � `method` text � `content_type` text � `query` jsonb � `headers` jsonb � `raw_text` text � `parsed` jsonb

### `public.webhooks`

`id` uuid NOT NULL � `name` text NOT NULL � `url` text NOT NULL � `events` jsonb NOT NULL � `secret` text � `is_active` bool NOT NULL � `last_triggered_at` timestamptz � `success_count` int4 NOT NULL � `failure_count` int4 NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

### `public.weekly_stats`

`id` uuid NOT NULL � `client_id` uuid NOT NULL � `week_number` int2 � `calls_taken` int2 � `avg_handle_time` text � `conversion_rate` float8 � `csat` float8 � `notes` text

### `public.weekly_summary`

`id` uuid NOT NULL � `client_id` uuid NOT NULL � `week_start` date NOT NULL � `total_calls` int4 � `avg_handle_time_seconds` int4 � `conversion_rate` numeric � `csat_avg` numeric � `total_revenue` numeric � `created_at` timestamptz NOT NULL

### `public.wf_activity`

`id` uuid NOT NULL � `session_id` uuid NOT NULL � `minute_at` timestamptz NOT NULL � `key_count` int4 NOT NULL � `click_count` int4 NOT NULL � `movement_count` int4 NOT NULL � `app_name` text � `window_title` text

### `public.wf_assignments`

`id` uuid NOT NULL � `agent_id` uuid NOT NULL � `campaign_id` uuid NOT NULL � `client_id` uuid NOT NULL � `active` bool NOT NULL

### `public.wf_audit`

`id` uuid NOT NULL � `actor_id` uuid � `occurred_at` timestamptz NOT NULL � `entity` text NOT NULL � `entity_id` uuid � `action` text NOT NULL � `reason` text � `before_value` jsonb � `after_value` jsonb

### `public.wf_campaigns`

`id` uuid NOT NULL � `client_id` uuid NOT NULL � `name` text NOT NULL � `active` bool NOT NULL

### `public.wf_client_members`

`client_id` uuid NOT NULL � `user_id` uuid NOT NULL

### `public.wf_clients`

`id` uuid NOT NULL � `name` text NOT NULL � `timezone` text NOT NULL � `screenshots_enabled` bool NOT NULL

### `public.wf_consents`

`user_id` uuid NOT NULL � `disclosure_version` text NOT NULL � `accepted_at` timestamptz NOT NULL

### `public.wf_limits`

`id` uuid NOT NULL � `agent_id` uuid NOT NULL � `client_id` uuid � `daily_minutes` int4 � `weekly_minutes` int4

### `public.wf_overrides`

`id` uuid NOT NULL � `agent_id` uuid NOT NULL � `client_id` uuid � `period` text NOT NULL � `period_start` timestamptz NOT NULL � `extra_minutes` int4 NOT NULL � `expires_at` timestamptz NOT NULL � `reason` text NOT NULL � `created_by` uuid NOT NULL � `created_at` timestamptz NOT NULL

### `public.wf_provider_routes`

`id` uuid NOT NULL � `agent_id` uuid NOT NULL � `client_id` uuid NOT NULL � `campaign_id` uuid NOT NULL � `extension` text NOT NULL � `business_number` text NOT NULL � `active` bool NOT NULL

### `public.wf_retention_runs`

`id` uuid NOT NULL � `ran_at` timestamptz NOT NULL � `deleted_count` int4 NOT NULL � `error_count` int4 NOT NULL

### `public.wf_screenshots`

`id` uuid NOT NULL � `session_id` uuid NOT NULL � `object_path` text NOT NULL � `captured_at` timestamptz NOT NULL � `expires_at` timestamptz NOT NULL � `blurred` bool NOT NULL � `uploaded` bool NOT NULL

### `public.wf_segments`

`id` uuid NOT NULL � `session_id` uuid NOT NULL � `started_at` timestamptz NOT NULL � `ended_at` timestamptz � `authorized_until` timestamptz NOT NULL � `idle_flag` bool NOT NULL

### `public.wf_sessions`

`id` uuid NOT NULL � `agent_id` uuid NOT NULL � `client_id` uuid NOT NULL � `campaign_id` uuid NOT NULL � `started_at` timestamptz NOT NULL � `ended_at` timestamptz � `tracker_seen_at` timestamptz � `status` text NOT NULL � `stop_reason` text � `review_status` text NOT NULL

### `public.wf_settings`

`id` bool NOT NULL � `cap_timezone` text NOT NULL � `idle_minutes` int4 NOT NULL � `screenshot_min_minutes` int4 NOT NULL � `screenshot_max_minutes` int4 NOT NULL � `screenshots_enabled` bool NOT NULL � `blur_screenshots` bool NOT NULL � `window_titles_enabled` bool NOT NULL � `retention_days` int4 NOT NULL

### `public.wf_transfer_inbox`

`id` uuid NOT NULL � `source_key` text NOT NULL � `received_at` timestamptz NOT NULL � `payload` jsonb NOT NULL � `reason` text NOT NULL � `resolved` bool NOT NULL

### `public.wf_transfers`

`id` uuid NOT NULL � `agent_id` uuid NOT NULL � `client_id` uuid NOT NULL � `campaign_id` uuid NOT NULL � `occurred_at` timestamptz NOT NULL � `lead_name` text NOT NULL � `phone` text NOT NULL � `state` text NOT NULL � `qualifying_details` jsonb NOT NULL � `notes` text NOT NULL � `outcome` text � `source` text NOT NULL � `source_key` text

### `public.wf_users`

`user_id` uuid NOT NULL � `role` text NOT NULL � `display_name` text NOT NULL

### `public.white_label_settings`

`id` uuid NOT NULL � `sub_account_id` uuid NOT NULL � `brand_name` text NOT NULL � `logo_url` text � `favicon_url` text � `primary_color` text NOT NULL � `accent_color` text NOT NULL � `custom_domain` text � `custom_css` text � `support_email` text � `support_phone` text � `footer_text` text � `hide_powered_by` bool NOT NULL � `created_at` timestamptz NOT NULL � `updated_at` timestamptz NOT NULL

## Foreign keys

- `public.access_codes.client_id` ? `public.clients.id`
- `public.access_control.client_id` ? `public.clients.id`
- `public.activities.lead_id` ? `public.leads.id`
- `public.admin_client_lead_activities.lead_id` ? `public.admin_client_leads.id`
- `public.admin_client_lead_activities.organization_id` ? `public.organizations.id`
- `public.admin_client_leads.organization_id` ? `public.organizations.id`
- `public.agent_extensions.org_id` ? `public.organizations.id`
- `public.agent_live_status.org_id` ? `public.organizations.id`
- `public.agent_live_status.org_member_id` ? `public.org_members.id`
- `public.agents.client_id` ? `public.clients.id`
- `public.ai_calls.campaign_id` ? `public.ai_campaigns.id`
- `public.ai_calls.lead_id` ? `public.leads.id`
- `public.ai_campaigns.organization_id` ? `public.organizations.id`
- `public.api_keys.sub_account_id` ? `public.sub_accounts.id`
- `public.billing_records.org_id` ? `public.organizations.id`
- `public.call_events.org_id` ? `public.organizations.id`
- `public.call_history.org_id` ? `public.organizations.id`
- `public.call_intelligence.org_id` ? `public.organizations.id`
- `public.call_outcome_stage_mappings.organization_id` ? `public.organizations.id`
- `public.call_outcome_stage_mappings.target_stage_id` ? `public.crm_pipeline_stages.id`
- `public.call_recordings.org_id` ? `public.organizations.id`
- `public.call_reports.org_id` ? `public.organizations.id`
- `public.call_transfers.org_id` ? `public.organizations.id`
- `public.calls.agent_id` ? `public.agents.id`
- `public.calls.client_id` ? `public.clients.id`
- `public.calls.org_id` ? `public.organizations.id`
- `public.campaign_leads.campaign_id` ? `public.campaigns.id`
- `public.campaign_leads.lead_id` ? `public.leads.id`
- `public.company_activities.company_id` ? `public.companies.id`
- `public.company_files.company_id` ? `public.companies.id`
- `public.company_tasks.company_id` ? `public.companies.id`
- `public.contact_events.org_id` ? `public.organizations.id`
- `public.contact_tasks.lead_id` ? `public.leads.id`
- `public.contact_tasks.outreach_job_id` ? `public.outreach_email_jobs.id`
- `public.crm_activities.company_id` ? `public.crm_companies.id`
- `public.crm_activities.contact_id` ? `public.crm_contacts.id`
- `public.crm_activities.deal_id` ? `public.crm_deals.id`
- `public.crm_activities.organization_id` ? `public.organizations.id`
- `public.crm_companies.organization_id` ? `public.organizations.id`
- `public.crm_contacts.company_id` ? `public.crm_companies.id`
- `public.crm_contacts.organization_id` ? `public.organizations.id`
- `public.crm_contacts.source_lead_id` ? `public.leads.id`
- `public.crm_deals.company_id` ? `public.crm_companies.id`
- `public.crm_deals.organization_id` ? `public.organizations.id`
- `public.crm_deals.primary_contact_id` ? `public.crm_contacts.id`
- `public.crm_deals.source_lead_id` ? `public.leads.id`
- `public.crm_deals.stage_id` ? `public.crm_pipeline_stages.id`
- `public.crm_import_jobs.organization_id` ? `public.organizations.id`
- `public.crm_pipeline_stages.organization_id` ? `public.organizations.id`
- `public.crm_saved_views.organization_id` ? `public.organizations.id`
- `public.crm_tasks.company_id` ? `public.crm_companies.id`
- `public.crm_tasks.contact_id` ? `public.crm_contacts.id`
- `public.crm_tasks.deal_id` ? `public.crm_deals.id`
- `public.crm_tasks.organization_id` ? `public.organizations.id`
- `public.email_accounts.sending_domain_id` ? `public.sending_domains.id`
- `public.email_logs.email_account_id` ? `public.email_accounts.id`
- `public.email_logs.lead_id` ? `public.leads.id`
- `public.email_logs.sequence_id` ? `public.sequences.id`
- `public.email_logs.sequence_step_id` ? `public.sequence_steps.id`
- `public.form_submissions.form_id` ? `public.forms.id`
- `public.form_submissions.lead_id` ? `public.leads.id`
- `public.forms.campaign_id` ? `public.campaigns.id`
- `public.goals.client_id` ? `public.clients.id`
- `public.integration_alerts.org_id` ? `public.organizations.id`
- `public.integration_health_snapshots.org_id` ? `public.organizations.id`
- `public.integration_quarantine.source_org_id` ? `public.organizations.id`
- `public.integration_sync_jobs.org_id` ? `public.organizations.id`
- `public.invite_codes.client_account_id` ? `public.sub_accounts.id`
- `public.invite_codes.team_member_id` ? `public.team_members.id`
- `public.invite_verification_codes.org_id` ? `public.organizations.id`
- `public.invoice_items.invoice_id` ? `public.invoices.id`
- `public.invoice_line_items.invoice_id` ? `public.invoices.id`
- `public.invoices.org_id` ? `public.organizations.id`
- `public.lead_duplicates.original_lead_id` ? `public.leads.id`
- `public.lead_list_uploads.assigned_agent_id` ? `public.profiles.id`
- `public.lead_list_uploads.organization_id` ? `public.organizations.id`
- `public.lead_list_uploads.uploaded_by` ? `public.profiles.id`
- `public.lead_routing_events.lead_id` ? `public.leads.id`
- `public.lead_routing_events.qualification_result_id` ? `public.qualification_results.id`
- `public.lead_sources.organization_id` ? `public.organizations.id`
- `public.leads.ai_campaign_id` ? `public.ai_campaigns.id`
- `public.leads.client_account_id` ? `public.sub_accounts.id`
- `public.leads.lead_list_upload_id` ? `public.lead_list_uploads.id`
- `public.leads.lead_source_id` ? `public.lead_sources.id`
- `public.leads.organization_id` ? `public.organizations.id`
- `public.live_agent_presence.org_id` ? `public.organizations.id`
- `public.live_agent_statuses.org_id` ? `public.organizations.id`
- `public.live_agent_statuses.org_member_id` ? `public.org_members.id`
- `public.meeting_appointments.event_type_id` ? `public.meeting_event_types.id`
- `public.meeting_appointments.lead_id` ? `public.leads.id`
- `public.memberships.org_id` ? `public.organizations.id`
- `public.memberships.user_id` ? `public.profiles.id`
- `public.mightycall_call_logs.org_id` ? `public.organizations.id`
- `public.mightycall_recordings.org_id` ? `public.organizations.id`
- `public.mightycall_reports.org_id` ? `public.organizations.id`
- `public.mightycall_sms_messages.org_id` ? `public.organizations.id`
- `public.mightycall_sms_messages.phone_id` ? `public.phone_numbers.id`
- `public.mightycall_webhook_inbox.org_id` ? `public.organizations.id`
- `public.notes.lead_id` ? `public.leads.id`
- `public.onboarding_progress.sub_account_id` ? `public.sub_accounts.id`
- `public.org_api_keys.org_id` ? `public.organizations.id`
- `public.org_billing_locks.org_id` ? `public.organizations.id`
- `public.org_feature_access.org_id` ? `public.organizations.id`
- `public.org_invites.org_id` ? `public.organizations.id`
- `public.org_manager_permissions.org_member_id` ? `public.org_members.id`
- `public.org_members.org_id` ? `public.organizations.id`
- `public.org_numbers.org_id` ? `public.organizations.id`
- `public.org_packages.org_id` ? `public.organizations.id`
- `public.org_packages.package_id` ? `public.billing_packages.id`
- `public.org_phone_numbers.org_id` ? `public.organizations.id`
- `public.org_settings.org_id` ? `public.organizations.id`
- `public.org_subscriptions.org_id` ? `public.organizations.id`
- `public.org_subscriptions.plan_id` ? `public.billing_plans.id`
- `public.org_users.org_id` ? `public.organizations.id`
- `public.outreach_call_outcomes.call_id` ? `public.outreach_audit.id`
- `public.outreach_email_events.job_id` ? `public.outreach_email_jobs.id`
- `public.outreach_email_jobs.campaign_id` ? `public.campaigns.id`
- `public.outreach_email_jobs.lead_id` ? `public.leads.id`
- `public.outreach_email_jobs.mailbox_id` ? `public.email_accounts.id`
- `public.outreach_workflow_logs.run_id` ? `public.outreach_workflow_runs.id`
- `public.outreach_workflow_runs.workflow_id` ? `public.automation_workflows.id`
- `public.payment_methods.org_id` ? `public.organizations.id`
- `public.payment_transactions.invoice_id` ? `public.invoices.id`
- `public.payment_transactions.org_id` ? `public.organizations.id`
- `public.payment_transactions.payment_method_id` ? `public.payment_methods.id`
- `public.phone_number_requests.org_id` ? `public.organizations.id`
- `public.phone_numbers.org_id` ? `public.organizations.id`
- `public.pipeline_stages.pipeline_id` ? `public.pipelines.id`
- `public.prospects.lead_id` ? `public.leads.id`
- `public.qualification_results.call_id` ? `public.ai_calls.id`
- `public.recording_access_logs.org_id` ? `public.organizations.id`
- `public.recording_archives.org_id` ? `public.organizations.id`
- `public.recording_consents.org_id` ? `public.organizations.id`
- `public.referrals.affiliate_id` ? `public.affiliates.id`
- `public.referrals.sub_account_id` ? `public.sub_accounts.id`
- `public.reviews.source_id` ? `public.review_sources.id`
- `public.sequence_enrollments.assigned_mailbox_id` ? `public.email_accounts.id`
- `public.sequence_enrollments.lead_id` ? `public.leads.id`
- `public.sequence_enrollments.sequence_id` ? `public.sequences.id`
- `public.sequence_steps.sequence_id` ? `public.sequences.id`
- `public.sequences.email_account_id` ? `public.email_accounts.id`
- `public.sms_logs.org_id` ? `public.organizations.id`
- `public.sso_tokens.sub_account_id` ? `public.sub_accounts.id`
- `public.support_ticket_messages.ticket_id` ? `public.support_tickets.id`
- `public.support_tickets.org_id` ? `public.organizations.id`
- `public.team_members.client_account_id` ? `public.sub_accounts.id`
- `public.team_members.org_id` ? `public.organizations.id`
- `public.usage_charges.org_id` ? `public.organizations.id`
- `public.user_feature_access.org_id` ? `public.organizations.id`
- `public.user_packages.package_id` ? `public.packages.id`
- `public.user_phone_assignments.org_id` ? `public.organizations.id`
- `public.users_roles.role_id` ? `public.roles.id`
- `public.voicemail_logs.org_id` ? `public.organizations.id`
- `public.vs_agent_presence.org_id` ? `public.vs_clients.id`
- `public.vs_calls.org_id` ? `public.organizations.id`
- `public.vs_calls_raw.org_id` ? `public.vs_clients.id`
- `public.vs_calls_raw.queue_id` ? `public.vs_queues.id`
- `public.vs_csat_responses.org_id` ? `public.vs_clients.id`
- `public.vs_qa_scores.org_id` ? `public.vs_clients.id`
- `public.vs_queues.org_id` ? `public.vs_clients.id`
- `public.vs_users.org_id` ? `public.vs_clients.id`
- `public.vs_voicemails.org_id` ? `public.vs_clients.id`
- `public.vs_voicemails.queue_id` ? `public.vs_queues.id`
- `public.weekly_summary.client_id` ? `public.clients.id`
- `public.wf_activity.session_id` ? `public.wf_sessions.id`
- `public.wf_assignments.agent_id` ? `public.wf_users.user_id`
- `public.wf_assignments.campaign_id` ? `public.wf_campaigns.id`
- `public.wf_assignments.campaign_id` ? `public.wf_campaigns.client_id`
- `public.wf_assignments.client_id` ? `public.wf_campaigns.id`
- `public.wf_assignments.client_id` ? `public.wf_campaigns.client_id`
- `public.wf_campaigns.client_id` ? `public.wf_clients.id`
- `public.wf_client_members.client_id` ? `public.wf_clients.id`
- `public.wf_client_members.user_id` ? `public.wf_users.user_id`
- `public.wf_clients.id` ? `public.organizations.id`
- `public.wf_consents.user_id` ? `public.wf_users.user_id`
- `public.wf_limits.agent_id` ? `public.wf_users.user_id`
- `public.wf_limits.client_id` ? `public.wf_clients.id`
- `public.wf_overrides.agent_id` ? `public.wf_users.user_id`
- `public.wf_overrides.client_id` ? `public.wf_clients.id`
- `public.wf_provider_routes.agent_id` ? `public.wf_users.user_id`
- `public.wf_provider_routes.campaign_id` ? `public.wf_campaigns.client_id`
- `public.wf_provider_routes.campaign_id` ? `public.wf_campaigns.id`
- `public.wf_provider_routes.client_id` ? `public.wf_campaigns.client_id`
- `public.wf_provider_routes.client_id` ? `public.wf_campaigns.id`
- `public.wf_screenshots.session_id` ? `public.wf_sessions.id`
- `public.wf_segments.session_id` ? `public.wf_sessions.id`
- `public.wf_sessions.agent_id` ? `public.wf_users.user_id`
- `public.wf_sessions.campaign_id` ? `public.wf_campaigns.client_id`
- `public.wf_sessions.campaign_id` ? `public.wf_campaigns.id`
- `public.wf_sessions.client_id` ? `public.wf_campaigns.client_id`
- `public.wf_sessions.client_id` ? `public.wf_campaigns.id`
- `public.wf_transfers.agent_id` ? `public.wf_users.user_id`
- `public.wf_transfers.campaign_id` ? `public.wf_campaigns.client_id`
- `public.wf_transfers.campaign_id` ? `public.wf_campaigns.id`
- `public.wf_transfers.client_id` ? `public.wf_campaigns.client_id`
- `public.wf_transfers.client_id` ? `public.wf_campaigns.id`
- `public.wf_users.user_id` ? `public.profiles.id`
- `public.white_label_settings.sub_account_id` ? `public.sub_accounts.id`

## PostgreSQL enums

- `org_role`: `vs_admin`, `org_admin`, `org_manager`, `agent`
- `outreach_disposition`: `no_answer`, `voicemail`, `gatekeeper`, `wrong_number`, `not_interested`, `callback_scheduled`, `meeting_booked`, `dnc`
- `outreach_domain_status`: `warming`, `active`, `burned`
- `outreach_mailbox_status`: `warming`, `active`, `paused`, `burned`
- `outreach_suppression_reason`: `dnc`, `unsubscribed`, `bounced_hard`, `manual_exclude`
- `outreach_timezone`: `Etc/UTC`, `America/New_York`, `America/Chicago`, `America/Denver`, `America/Phoenix`, `America/Los_Angeles`, `America/Anchorage`, `America/Adak`, `Pacific/Honolulu`, `America/Detroit`, `America/Indiana/Indianapolis`, `America/Indiana/Knox`, `America/Indiana/Tell_City`, `America/Indiana/Marengo`, `America/Indiana/Petersburg`, `America/Indiana/Vevay`, `America/Indiana/Vincennes`, `America/Indiana/Winamac`, `America/Kentucky/Louisville`, `America/Kentucky/Monticello`, `America/Menominee`, `America/North_Dakota/Beulah`, `America/North_Dakota/Center`, `America/North_Dakota/New_Salem`, `Europe/Amsterdam`, `America/Toronto`
- `outreach_verification_status`: `valid`, `risky`, `invalid`, `unverified`

## Active public RLS policies

- `public.access_codes` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.access_codes` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.access_control` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.access_control` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.activities` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.activities` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.activity_logs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.activity_logs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.admin_client_lead_activities` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.admin_client_lead_activities` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.admin_client_leads` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.admin_client_leads` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.affiliates` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.affiliates` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.agent_extensions` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.agent_extensions` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.agent_live_status` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.agent_live_status` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.agents` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.agents` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.ai_calls` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.ai_calls` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.ai_campaigns` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.ai_campaigns` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.api_keys` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.api_keys` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.api_logs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.api_logs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.audit_logs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.audit_logs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.auth_lockouts` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.auth_lockouts` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.auth_logs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.auth_logs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.automation_workflows` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.automation_workflows` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.billing_packages` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.billing_packages` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.billing_plans` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.billing_plans` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.billing_records` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.billing_records` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.booking_appointments` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.booking_appointments` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.call_events` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.call_events` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.call_history` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.call_history` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.call_intelligence` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.call_intelligence` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.call_outcome_stage_mappings` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.call_outcome_stage_mappings` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.call_recordings` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.call_recordings` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.call_reports` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.call_reports` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.call_transfers` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.call_transfers` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.calls` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.calls` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.calls_raw` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.calls_raw` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.campaign_leads` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.campaign_leads` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.campaigns` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.campaigns` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.clients` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.clients` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.companies` / `crm_company_admin_claim`: ALL; PERMISSIVE; roles "{authenticated}"; USING ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text])); WITH CHECK ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text]))
- `public.companies` / `crm_company_admin_guard`: ALL; RESTRICTIVE; roles "{authenticated}"; USING (((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text])) OR (wf_role() = 'admin'::text)); WITH CHECK (((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text])) OR (wf_role() = 'admin'::text))
- `public.companies` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.company_activities` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.company_activities` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.company_files` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.company_files` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.company_tasks` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.company_tasks` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.contact_events` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.contact_events` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.contact_tasks` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.contact_tasks` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_activities` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_activities` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_companies` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_companies` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_contacts` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_contacts` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_deals` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_deals` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_import_jobs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_import_jobs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_pipeline_stages` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_pipeline_stages` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_saved_views` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_saved_views` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_tasks` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.crm_tasks` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.dispositions` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.dispositions` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.email_accounts` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.email_accounts` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.email_logs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.email_logs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.email_templates` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.email_templates` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.error_logs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.error_logs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.form_submissions` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.form_submissions` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.forms` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.forms` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.goals` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.goals` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.integration_alerts` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.integration_alerts` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.integration_health_snapshots` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.integration_health_snapshots` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.integration_quarantine` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.integration_quarantine` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.integration_sync_jobs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.integration_sync_jobs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.integrations` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.integrations` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.invite_codes` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.invite_codes` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.invite_verification_codes` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.invite_verification_codes` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.invoice_items` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.invoice_items` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.invoice_line_items` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.invoice_line_items` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.invoices` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.invoices` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.lead_duplicates` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.lead_duplicates` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.lead_list_uploads` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.lead_list_uploads` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.lead_routing_events` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.lead_routing_events` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.lead_sources` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.lead_sources` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.leads` / `crm_lead_delete`: DELETE; PERMISSIVE; roles "{authenticated}"; USING crm_lead_can_write(client_account_id, custom_fields); WITH CHECK �
- `public.leads` / `crm_lead_delete_guard`: DELETE; RESTRICTIVE; roles "{authenticated}"; USING crm_lead_can_write(client_account_id, custom_fields); WITH CHECK �
- `public.leads` / `crm_lead_insert`: INSERT; PERMISSIVE; roles "{authenticated}"; USING �; WITH CHECK crm_lead_can_write(client_account_id, custom_fields)
- `public.leads` / `crm_lead_insert_guard`: INSERT; RESTRICTIVE; roles "{authenticated}"; USING �; WITH CHECK crm_lead_can_write(client_account_id, custom_fields)
- `public.leads` / `crm_lead_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING crm_lead_can_read(client_account_id, custom_fields); WITH CHECK �
- `public.leads` / `crm_lead_read_guard`: SELECT; RESTRICTIVE; roles "{authenticated}"; USING crm_lead_can_read(client_account_id, custom_fields); WITH CHECK �
- `public.leads` / `crm_lead_update`: UPDATE; PERMISSIVE; roles "{authenticated}"; USING crm_lead_can_write(client_account_id, custom_fields); WITH CHECK crm_lead_can_write(client_account_id, custom_fields)
- `public.leads` / `crm_lead_update_guard`: UPDATE; RESTRICTIVE; roles "{authenticated}"; USING crm_lead_can_write(client_account_id, custom_fields); WITH CHECK crm_lead_can_write(client_account_id, custom_fields)
- `public.live_agent_presence` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.live_agent_presence` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.live_agent_statuses` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.live_agent_statuses` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.meeting_appointments` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.meeting_appointments` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.meeting_event_types` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.meeting_event_types` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.memberships` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.memberships` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.mightycall_call_logs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.mightycall_call_logs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.mightycall_extensions` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.mightycall_extensions` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.mightycall_recordings` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.mightycall_recordings` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.mightycall_reports` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.mightycall_reports` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.mightycall_sms_messages` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.mightycall_sms_messages` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.mightycall_webhook_inbox` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.mightycall_webhook_inbox` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.notes` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.notes` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.notification_preferences` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.notification_preferences` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.onboarding_progress` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.onboarding_progress` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_api_keys` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_api_keys` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_billing_locks` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_billing_locks` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_feature_access` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_feature_access` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_integrations` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_integrations` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_invites` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_invites` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_manager_permissions` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_manager_permissions` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_members` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_members` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_numbers` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_numbers` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_packages` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_packages` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_phone_numbers` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_phone_numbers` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_settings` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_settings` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_subscriptions` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_subscriptions` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_users` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.org_users` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.organizations` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.organizations` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_audit` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_audit` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_call_outcomes` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_call_outcomes` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_delivery_reports` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_delivery_reports` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_email_alerts` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_email_alerts` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_email_events` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_email_events` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_email_jobs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_email_jobs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_email_legacy_mailboxes` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_email_legacy_mailboxes` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_email_settings` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_email_settings` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_inbound_messages` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_inbound_messages` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_legacy_leads` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_legacy_leads` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_phase3_legacy_enrollments` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_phase3_legacy_enrollments` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_phase3_restore` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_phase3_restore` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_phase3_seed` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_phase3_seed` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_phase4_restore` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_phase4_restore` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_suppressions` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_suppressions` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_verification_config` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_verification_config` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_workflow_logs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_workflow_logs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_workflow_runs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.outreach_workflow_runs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.packages` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.packages` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.page_view_logs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.page_view_logs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.payment_methods` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.payment_methods` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.payment_transactions` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.payment_transactions` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.phone_number_requests` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.phone_number_requests` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.phone_numbers` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.phone_numbers` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.pipeline_stages` / `crm_stages_delete_guard`: DELETE; RESTRICTIVE; roles "{authenticated}"; USING ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])); WITH CHECK �
- `public.pipeline_stages` / `crm_stages_insert_guard`: INSERT; RESTRICTIVE; roles "{authenticated}"; USING �; WITH CHECK ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))
- `public.pipeline_stages` / `crm_stages_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'agent'::text, 'viewer'::text, 'client'::text])); WITH CHECK �
- `public.pipeline_stages` / `crm_stages_update_guard`: UPDATE; RESTRICTIVE; roles "{authenticated}"; USING ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])); WITH CHECK ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))
- `public.pipeline_stages` / `crm_stages_write`: ALL; PERMISSIVE; roles "{authenticated}"; USING ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])); WITH CHECK ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))
- `public.pipelines` / `crm_pipeline_delete_guard`: DELETE; RESTRICTIVE; roles "{authenticated}"; USING ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])); WITH CHECK �
- `public.pipelines` / `crm_pipeline_insert_guard`: INSERT; RESTRICTIVE; roles "{authenticated}"; USING �; WITH CHECK ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))
- `public.pipelines` / `crm_pipeline_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'agent'::text, 'viewer'::text, 'client'::text])); WITH CHECK �
- `public.pipelines` / `crm_pipeline_update_guard`: UPDATE; RESTRICTIVE; roles "{authenticated}"; USING ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])); WITH CHECK ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))
- `public.pipelines` / `crm_pipeline_write`: ALL; PERMISSIVE; roles "{authenticated}"; USING ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])); WITH CHECK ((auth.jwt() ->> 'crm_role'::text) = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))
- `public.platform_api_keys` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.platform_api_keys` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.platform_manager_permissions` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.platform_manager_permissions` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.portal_activity_log` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.portal_activity_log` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.profiles` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.profiles` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.prospects` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.prospects` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.qualification_results` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.qualification_results` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.rate_limit_violations` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.rate_limit_violations` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.recording_access_logs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.recording_access_logs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.recording_archives` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.recording_archives` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.recording_consents` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.recording_consents` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.referrals` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.referrals` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.review_requests` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.review_requests` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.review_sources` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.review_sources` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.reviews` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.reviews` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.roles` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.roles` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.segments` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.segments` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.sending_domains` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.sending_domains` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.sequence_enrollments` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.sequence_enrollments` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.sequence_steps` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.sequence_steps` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.sequences` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.sequences` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.sms_logs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.sms_logs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.sso_tokens` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.sso_tokens` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.sub_accounts` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.sub_accounts` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.support_ticket_messages` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.support_ticket_messages` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.support_tickets` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.support_tickets` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.team_members` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.team_members` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.usage_charges` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.usage_charges` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.user_feature_access` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.user_feature_access` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.user_mfa_email` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.user_mfa_email` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.user_mfa_totp` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.user_mfa_totp` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.user_packages` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.user_packages` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.user_password_change_codes` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.user_password_change_codes` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.user_phone_assignments` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.user_phone_assignments` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.user_security_questions` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.user_security_questions` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.users_roles` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.users_roles` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.voicemail_logs` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.voicemail_logs` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_agent_presence` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_agent_presence` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_calls` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_calls` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_calls_raw` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_calls_raw` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_clients` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_clients` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_csat_responses` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_csat_responses` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_qa_scores` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_qa_scores` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_queues` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_queues` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_users` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_users` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_voicemails` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.vs_voicemails` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.webhook_inbox` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.webhook_inbox` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.webhooks` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.webhooks` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.weekly_stats` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.weekly_stats` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.weekly_summary` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.weekly_summary` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.wf_activity` / `activity_self`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (EXISTS ( SELECT 1
   FROM wf_sessions s
  WHERE ((s.id = wf_activity.session_id) AND (s.agent_id = auth.uid())))); WITH CHECK �
- `public.wf_activity` / `workforce_monitor_admin`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_assignments` / `workforce_admin_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_assignments` / `workforce_admin_write`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.wf_assignments` / `workforce_assignment_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING ((agent_id = auth.uid()) OR wf_client_access(client_id)); WITH CHECK �
- `public.wf_audit` / `workforce_admin_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_campaigns` / `workforce_admin_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_campaigns` / `workforce_admin_write`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.wf_campaigns` / `workforce_campaign_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_client_access(client_id) OR wf_assigned(auth.uid(), client_id, id)); WITH CHECK �
- `public.wf_client_members` / `workforce_admin_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_client_members` / `workforce_admin_write`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.wf_client_members` / `workforce_membership_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (user_id = auth.uid()); WITH CHECK �
- `public.wf_clients` / `workforce_admin_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_clients` / `workforce_admin_write`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.wf_clients` / `workforce_client_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_client_access(id) OR (EXISTS ( SELECT 1
   FROM wf_assignments
  WHERE ((wf_assignments.agent_id = auth.uid()) AND (wf_assignments.client_id = wf_clients.id) AND wf_assignments.active)))); WITH CHECK �
- `public.wf_consents` / `consent_self`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (user_id = auth.uid()); WITH CHECK �
- `public.wf_consents` / `workforce_monitor_admin`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_limits` / `workforce_admin_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_limits` / `workforce_admin_write`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.wf_limits` / `workforce_limits_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING ((wf_role() = 'agent'::text) AND (agent_id = auth.uid())); WITH CHECK �
- `public.wf_overrides` / `workforce_admin_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_overrides` / `workforce_override_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING ((wf_role() = 'agent'::text) AND (agent_id = auth.uid())); WITH CHECK �
- `public.wf_provider_routes` / `admin_routes`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.wf_retention_runs` / `workforce_monitor_admin`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_screenshots` / `screenshot_scope`: SELECT; PERMISSIVE; roles "{authenticated}"; USING ((expires_at > now()) AND (EXISTS ( SELECT 1
   FROM wf_sessions s
  WHERE ((s.id = wf_screenshots.session_id) AND ((s.agent_id = auth.uid()) OR (wf_visible(s.agent_id, s.client_id, s.campaign_id) AND (EXISTS ( SELECT 1
           FROM wf_clients c
          WHERE ((c.id = s.client_id) AND c.screenshots_enabled))))))))); WITH CHECK �
- `public.wf_screenshots` / `workforce_admin_screenshot_delete`: DELETE; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_screenshots` / `workforce_monitor_admin`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_segments` / `workforce_admin_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_segments` / `workforce_segment_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (EXISTS ( SELECT 1
   FROM wf_sessions s
  WHERE ((s.id = wf_segments.session_id) AND wf_visible(s.agent_id, s.client_id, s.campaign_id)))); WITH CHECK �
- `public.wf_sessions` / `workforce_admin_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_sessions` / `workforce_session_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING wf_visible(agent_id, client_id, campaign_id); WITH CHECK �
- `public.wf_settings` / `workforce_admin_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_settings` / `workforce_admin_write`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.wf_settings` / `workforce_settings_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'agent'::text); WITH CHECK �
- `public.wf_transfer_inbox` / `admin_transfer_inbox`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.wf_transfers` / `admin_transfer_write`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.wf_transfers` / `workforce_admin_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_transfers` / `workforce_transfer_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING wf_visible(agent_id, client_id, campaign_id); WITH CHECK �
- `public.wf_users` / `workforce_admin_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK �
- `public.wf_users` / `workforce_admin_write`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.wf_users` / `workforce_user_read`: SELECT; PERMISSIVE; roles "{authenticated}"; USING ((user_id = auth.uid()) OR ((wf_role() = 'client'::text) AND (EXISTS ( SELECT 1
   FROM wf_assignments a
  WHERE ((a.agent_id = wf_users.user_id) AND a.active AND wf_client_access(a.client_id)))))); WITH CHECK �
- `public.white_label_settings` / `workforce_legacy_admin`: ALL; PERMISSIVE; roles "{authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
- `public.white_label_settings` / `workforce_legacy_boundary`: ALL; RESTRICTIVE; roles "{anon,authenticated}"; USING (wf_role() = 'admin'::text); WITH CHECK (wf_role() = 'admin'::text)
