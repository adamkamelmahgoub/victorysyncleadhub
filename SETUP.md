# Social DM setup

The social migrations are committed. The live database inspected on 2026-10-20 already contains all 13 social tables; check the migration history before applying anything again. Complete the account and webhook checklist below before enabling replies. The frontend and API need the same deployed schema version.

## Environment

Set these on the Vercel project as server variables unless noted:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL for server PostgREST and Auth. |
| `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY` | Server-only key for webhook and social API database writes. Never use a `VITE_` prefix. |
| `SUPABASE_ANON_KEY` | Verifies a signed-in user with Supabase Auth. |
| `DATABASE_URL` | Direct Postgres connection for scheduled DM queue and MCP tools. |
| `MCP_ALLOWED_EMAILS` | Comma-separated admin allowlist used by the existing MCP and social API. |
| `TOKEN_ENCRYPTION_KEY` | Base64-encoded 32-byte AES key. Generate once with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`; keep it backed up securely. |
| `META_APP_ID`, `META_APP_SECRET` | Meta app credentials. The current webhook uses `META_APP_SECRET`; OAuth connection is pending. |
| `META_WEBHOOK_VERIFY_TOKEN` | Random webhook challenge secret that you enter in the Meta dashboard. |
| `META_GRAPH_VERSION` | Explicit current Graph API version, such as `v25.0`, after checking the version offered by your Meta app. |
| `SOCIAL_X_DM_ENABLED` | Optional feature flag for a future paid X DM integration; defaults to disabled. Enabling the flag does not enable sending until an approved adapter is configured. |
| `CRON_SECRET` | Vercel cron bearer secret for `/api/social-worker` and `/api/social-daily`. |
| `OPENROUTER_API_KEY` | Existing free-model intent classification and enrichment. |
| `OPENROUTER_MODEL` | Optional; defaults to `nvidia/nemotron-3.5-lightning:free`. |
| `SLACK_WEBHOOK_URL` | Existing enrichment alert setting. DM alerts use the current Supabase Vault webhook instead. |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID` | Optional notes for provisioning WhatsApp Cloud API. Runtime tokens go into `connected_account_secrets` through the server-only provisioning script. |
| `SOCIAL_ACCOUNT_PLATFORM`, `SOCIAL_ACCOUNT_EXTERNAL_ID`, `SOCIAL_ACCOUNT_LABEL`, `SOCIAL_ACCOUNT_ORG_ID`, `SOCIAL_ACCOUNT_TOKEN` | Temporary environment variables for `scripts/connect-social-account.mjs`; never commit them. |

For Slack alerts, keep the existing Vault secrets `victorysync_slack_meeting_webhook` and `victorysync_leadgen_origin`. The new social SQL function uses the same `pg_net` delivery and `slack_notification_log` reconciliation pattern as meeting alerts.

## Database

1. Back up the Supabase database and review the current staged migrations in this working tree.
2. Run `node scripts/validate-social-migrations.mjs`, `node scripts/test-social-sql.mjs`, `node scripts/test-dm-campaign-sql.mjs`, and `node scripts/test-social-cascade-sql.mjs`. The SQL tests roll back. If all 13 tables already exist, they inspect and exercise the installed schema instead of replaying the foundation migrations.
3. If the schema is absent in another environment, apply `supabase/migrations/20261020_social_dm_foundation.sql`, then `supabase/migrations/20261020_z_social_dm_guards.sql`, `20261021_social_review_status.sql`, `20261021_z_social_lead_list.sql`, and `20261021_zz_social_suppression_cascade.sql` through the normal migration deployment process. The three October 21 migrations were applied to the inspected live database and verified on 2026-10-20. Do not push unrelated pending migrations without review.
4. Run `node --experimental-strip-types scripts/backfill-social-profiles.mjs` to preview old handle data. Add `--apply` only after the two migrations are deployed. On 2026-10-20, the preview found zero stored handle strings.
5. Set `SOCIAL_ACCOUNT_ORG_ID` to the intended organization UUID, then preview and apply the optional sample campaign with `node scripts/seed-dm-campaign.mjs` and `node scripts/seed-dm-campaign.mjs --apply`.

## Meta app and Instagram Professional account

1. In [Meta for Developers](https://developers.facebook.com/apps/), create a Business app for the organization and record its App ID and App Secret in Vercel. Keep the app in development mode while testing with app-role users.
2. In the Instagram mobile app, change the account type to Professional (Business or Creator). Link it to a Facebook Page that you administer. The [official Meta Instagram API collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) states that the Facebook Login variant requires this Page link and cannot access personal Instagram accounts.
3. Add the Facebook Login for Business, Messenger, and Instagram products to the Meta app. Request `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `pages_messaging`, `instagram_basic`, and `instagram_manage_messages` for the Page and Instagram messaging path. [Meta's Messenger Conversations API collection](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a) lists these permissions and explains the app-role versus Advanced Access boundary. App admins/testers can test their own role-linked accounts before App Review; conversations with people outside app roles require the appropriate Advanced Access and business verification.
4. In Meta Webhooks, set the callback URL to `https://YOUR_DOMAIN/api/social-webhook` and enter the exact `META_WEBHOOK_VERIFY_TOKEN`. Subscribe the Page/Instagram messaging object to message events, including message echoes where available in the current dashboard. The endpoint verifies `X-Hub-Signature-256` against the raw body before storing the event. Subscribe the actual Page and Instagram account to the app; dashboard test delivery alone does not subscribe a real account.
5. Use Meta's Graph API Explorer or Page access-token workflow to obtain a Page token as an app-role user with the messaging task. Meta's [Page token request](https://www.postman.com/meta/instagram/request/lpx8lul/get-access-tokens-of-pages-you-manage) uses `/me/accounts?fields=name,access_token,tasks,instagram_business_account` to locate the Page ID, Page token, and linked Instagram business ID.
6. Provision the Page account with `SOCIAL_ACCOUNT_PLATFORM=facebook`, `SOCIAL_ACCOUNT_EXTERNAL_ID=PAGE_ID`, and `SOCIAL_ACCOUNT_TOKEN=PAGE_ACCESS_TOKEN`. Provision the Instagram account separately with `SOCIAL_ACCOUNT_PLATFORM=instagram`, `SOCIAL_ACCOUNT_EXTERNAL_ID=IG_BUSINESS_ID`, and its authorized token. Set the organization ID and label, then run `node --experimental-strip-types scripts/connect-social-account.mjs` to preview and `... --apply` to store the AES-GCM encrypted token. Tokens are stored in a table with no client grants.
7. Open **Settings → Connected Accounts** to check webhook health and caps. Test one inbound message and one manual app send from an app-role account. The social worker runs every five minutes. API replies are currently enabled only for Facebook Pages and WhatsApp within 24 hours; Instagram API sending remains disabled pending verified Facebook Login send-endpoint testing. Instagram manual sends can be logged in the DM Queue and confirmed by an echo if Meta delivers it.

The [official Meta Messenger Send API collection](https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api) requires the person to have messaged the Page in the 24-hour window or separately agreed to an allowed outside-window message. This implementation sends only replies within 24 hours, without a Human Agent extension.

## WhatsApp Business Cloud API

1. In Meta Business Manager, create or select a WhatsApp Business Account, register a business phone number, and note its WABA ID and Phone Number ID.
2. Subscribe the app to the WABA `messages` webhook and use the same `/api/social-webhook` callback. The [official Meta Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api) shows the WABA subscription and phone-number endpoints.
3. Provision `SOCIAL_ACCOUNT_PLATFORM=whatsapp`, `SOCIAL_ACCOUNT_EXTERNAL_ID=PHONE_NUMBER_ID`, and the authorized Cloud API token with the same server-only script.
4. Test inbound and reply inside the rolling 24-hour customer support window. Outside it, Meta requires approved templates and opt-in; this CRM deliberately has **no cold WhatsApp or outside-window send path**. The [official status documentation](https://www.postman.com/meta/whatsapp-business-platform/folder/fuaee8l/statuses-object) distinguishes the customer support window from the billing conversation window.

## Operations

- Vercel cron calls `/api/social-worker` every five minutes for verified webhook events plus email/SMS backfill, and `/api/social-daily` at 05:00 UTC for DM tasks, stale-task expiry, and token-expiry alerts. Confirm your Vercel plan supports the configured cron frequency.
- The Inbox includes an **Unmatched** filter. Link a thread to an existing CRM record or create a lead; the platform user ID is copied to an existing social profile when one is available. Do not guess a social handle from a platform ID. Related channel history, assignee and account filters, DNC, stage, meeting, and task actions are available. AI reply suggestions fill the composer for human review and never send automatically.
- The DM Queue never sends on its own. A user marks a manual action complete; `Sent` records an outbound message. Facebook and WhatsApp API reply buttons appear only while the 24-hour window is open and a connected account is present.
- The **DM campaigns** page creates draft templates and multi-step campaigns, activates them, and enrolls record UUIDs. The daily cron turns eligible steps into manual queue tasks. The existing Victory Sync CRM MCP server exposes social profile, discovery, inbox, draft, enrollment, queue, account, manual log, and permitted reply tools. Writes are audited in `mcp_audit_log`.
- CSV/XLSX contact and company imports recognize Instagram/IG, Facebook/FB, LinkedIn, X/Twitter, TikTok, and website columns. Contact and company CSV exports include primary social handles. Social handles are normalized into `social_profiles`; low-confidence discoveries appear in **Review socials** for approval or rejection. Contact list social filters cover Has Instagram, No socials, DM'd in seven days, and Replied, and they can be saved as views. Company list filters cover Has Instagram and No socials. Bulk contact actions include Find socials and Enroll in DM campaign; company lists also have bulk Find socials.
- WhatsApp delivery and read statuses are merged into existing messages when the Cloud API delivers status webhooks. Email and MightyCall SMS replies are classified with the same intent model as social replies.
- `x`, LinkedIn, TikTok, Threads, Nextdoor, Yelp, and Angi remain manual-assisted. There is no browser automation, private-platform scraping, or personal-account auto-send.
- The current connection path uses a server-only provisioning script. A complete Facebook Login OAuth connect/reconnect flow and in-app WhatsApp setup are still required before calling this a self-service production integration.
