# Social workspace setup

The social CRM and workspace migrations are additive. The live database includes `supabase/migrations/20261022_social_workspace.sql`; run `node scripts/apply-social-workspace-migration.mjs` to verify it in another environment. The owner controls access under **Team > Social workspace access**. Clients and viewers cannot access the social workspace; grant internal teammates only the permissions they need.

## Existing server configuration

The app still needs its existing Supabase and worker settings: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY`), `SUPABASE_ANON_KEY`, `DATABASE_URL`, and `OUTREACH_WORKER_TOKEN`. The existing Supabase Vault secrets `victorysync_leadgen_origin`, `victorysync_native_worker_token`, and Slack webhook must remain configured. `OPENROUTER_API_KEY` enables intent classification and AI drafts. The older `META_*`, `WHATSAPP_*`, and `TOKEN_ENCRYPTION_KEY` variables remain supported for previously provisioned accounts, but **new UI connections do not need social provider env vars**. App secrets, verify tokens, and account tokens are stored in Supabase Vault and are never returned to clients.

## Facebook Pages and Instagram Professional

1. At [Meta for Developers](https://developers.facebook.com/apps/), create a Business app. Add Facebook Login for Business, Messenger, Instagram, and Webhooks. Note the App ID and App Secret. Keep the app in development mode for app-role testing.
2. Change the Instagram account to Professional (Business or Creator) and link it to a Facebook Page you manage. [Meta's Instagram API documentation](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api) requires a linked Page for Facebook Login and excludes personal Instagram accounts.
3. In Victory Sync, open **Settings > Connected Accounts**. Enter the App ID, App Secret, and Graph API version. Save the app. Copy the displayed OAuth callback into **Facebook Login for Business > Settings > Valid OAuth Redirect URIs**.
4. Copy the displayed webhook callback into the Meta Webhooks product. Copy the one-time verify token immediately; the UI shows it only once. Subscribe messaging webhook events, including echoes where the Meta dashboard offers them. The endpoint verifies `X-Hub-Signature-256` before processing.
5. Request `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `pages_messaging`, `pages_manage_posts`, `instagram_basic`, `instagram_manage_messages`, and `instagram_content_publish`. App-role users can test role-linked accounts in development mode; broader use needs Meta App Review and Advanced Access as applicable.
6. Click **Connect Facebook and Instagram** in Victory Sync and authorize the Pages. The callback discovers Page tokens and linked Instagram IDs through [Meta's Page token workflow](https://www.postman.com/meta/instagram/request/lpx8lul/get-access-tokens-of-pages-you-manage). Confirm that both accounts appear in Settings. Send a test inbound message and a manual app message to verify webhook and echo capture.
7. Open **Social workspace** to draft or schedule Facebook Page text/image posts and Instagram Professional image posts. Images must have a public HTTPS URL. The five-minute Supabase worker publishes due posts; Instagram uses a media container and `media_publish` per [Meta's official publishing collection](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api).

The [Messenger Send API](https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api) limits ordinary API replies to the 24-hour customer messaging window. This CRM enforces the window. It does not automate cold sends from personal accounts.

## WhatsApp Business Cloud API

1. In Meta Business Manager, create or choose a WhatsApp Business Account and business phone number. Record the WABA ID and Phone Number ID.
2. In **Settings > Connected Accounts**, enter those IDs and a Cloud API token. The server verifies the phone through [Meta's official phone number endpoint](https://www.postman.com/meta/whatsapp-business-platform/request/86mq7mn/get-phone-numbers), stores the token in Vault, and subscribes the WABA webhook.
3. Use the Meta webhook callback and verify token from the UI. Test an inbound message and reply inside the rolling 24-hour support window. Sending outside that window requires approved templates and opt-in; cold WhatsApp is unavailable.

## Daily use and limits

- **DM queue** records human assisted follows, engagement, and sends. It applies per-account caps, warmup, suppression, and reply stopping rules.
- **Unified inbox** combines social, email, and MightyCall SMS replies. Incoming messages are matched to CRM records, classified for intent, and surfaced in an Unmatched view if no record matches. AI drafts are never auto-sent.
- **Social workspace** stores drafts, scheduled posts, publish outcomes, and basic per-post likes/comments/shares where Meta returns them. Its 30-day report counts real inbound and outbound messages, interested conversations, tasks, and published posts. Reach remains zero until a supported provider insight endpoint is configured.
- **Team** lets the owner grant inbox view/reply, queue work, campaign management, social profile editing, account management, post creation/publishing, report viewing, and social MCP permission. Client accounts are excluded by database guard and server authorization.
- **MCP** offers the original social CRM tools plus social post listing/scheduling, a social report, and owner team access tools. Existing MCP authentication still uses `MCP_ALLOWED_EMAILS`; granting the `mcp_use` flag alone does not provide a team member an MCP credential.
- LinkedIn, TikTok, X, Threads, Yelp, Nextdoor, and Angi remain manual assisted for DMs. Additional post types such as reels, stories, carousels, and video are not in the native publisher.

The previous server-side provisioning script remains available for legacy account recovery. Do not paste tokens into tickets, logs, or source control.
