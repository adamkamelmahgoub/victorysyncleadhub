# Victory Sync client operations

## Create a client

1. Sign in as an agency admin with two-step verification enabled.
2. Open **Client portal** in the workspace. In **Add a client**, select a company marked Client or enter a new business name, phone, and website. The **Client accounts** screen uses the same provisioning flow.
3. Choose the package and enter the owner's name and email. Select **Create client account**. The package template is applied automatically.
4. If the email provider is configured, the owner receives a seven-day invitation. Otherwise, copy the private invitation link shown on screen and share it securely.
5. Review the new account's onboarding tasks, business settings, and monthly recurring revenue in **Accounts overview**.

The three existing sub-accounts remain in place. To provision one of them, select **Apply template** in **Accounts overview**. Applying the same template again skips existing keyed items.

## Package templates

Templates are stored in `account_templates.payload` and seeded by `20261030_05_account_templates_ops.sql`. Starter, Scale, Domination, Overflow, Business Hours, 24/7 Coverage, Part-Time Appointments, Full-Time Appointments, Revive, and Custom are available. Each includes a pipeline, lead form, draft landing page, follow-up and review sequences, workflows, onboarding tasks, report frequency, and page permissions. The draft page uses placeholders that need approved client content before publishing.

Agency admins can apply a template from **Accounts overview**. The operation matches existing items by template key or name. It does not overwrite client edits. Review task assignments and dates after applying it.

## Invite client users

Create the client owner during account creation. For additional users, open the client account, go to **Settings**, and use the invite form. Client users are restricted to their account by database RLS and page permissions. Agency staff need an explicit account assignment. Agency admins can use **View as client** to inspect a read-only client view; starting and ending that view is logged.

## Agency two-step verification

Agency admins and staff must complete authenticator verification before the portal API or database exposes agency accounts. After signing in, choose **Continue**, scan the QR code in an authenticator app, enter its current code, and choose **Verify code**. On later sign-ins, enter the code from the enrolled app. A legacy `admin`, `owner`, or `member` claim does not bypass this requirement.

If **Continue** reports an enrollment or verification error, check the project's Supabase Auth MFA settings for TOTP enrollment and verification, then retry after signing in again. Supabase documents the [TOTP enrollment flow](https://supabase.com/docs/guides/auth/auth-mfa/totp) and [MFA controls](https://supabase.com/docs/guides/auth/auth-mfa). Do not disable the agency API or database gate to work around a setup failure.

## Connect a domain and publish a page

Set server-only `VERCEL_API_TOKEN` and `VERCEL_PROJECT_ID` in Vercel. For a team-owned project, also set `VERCEL_TEAM_ID` (or use Vercel's `VERCEL_ORG_ID`). Set `PUBLIC_PAGES_BASE_URL` to the public pages origin. The client keeps control of their domain and DNS; do not collect registrar credentials.

Open the page editor's **Page settings**, enter the client's domain or subdomain without `https://`, and choose **Connect domain**. The CRM registers it on the Vercel project and displays any TXT verification challenge. Ask the client to add that record and the A or CNAME record Vercel specifies for the domain. Choose **Check verification** after DNS propagates. Confirm the page is published, HTTPS works, and the domain root renders the correct page before sharing it. A platform URL under `/p/` remains available while DNS is pending. Changing a page's domain does not remove the prior domain from Vercel; remove unused domains from the Vercel project after checking that no page uses them.

Open the account's **Pages** tab. The template page starts as a draft. Replace placeholders with approved services, imagery, and business details, connect its form, preview, then publish. Check the public URL and submit a test form. Draft edits should not be treated as published content until saved and published.

**Save draft** updates the editor without changing the live page. **Publish** copies the draft to the live page and records a numbered version. Open **Version history** inside the page editor and choose **Restore to draft** to recover an older version's sections and theme. The live page remains on its current version until you publish again. Client users need the `client_page_editing` feature to restore or publish; agency admins and assigned marketing staff can edit their accounts.

The client editor also autosaves an edited draft after two seconds. Wait for **Saved** before leaving it. Hide, duplicate, reorder, or delete sections from the section list; Undo and Redo work until the editor closes. AI output appears as a suggestion. Review it and select **Apply to draft** before publishing.

## AI page assistant

Enable `landing_page_builder` and `landing_page_ai` in the feature manager. Open a page in the editor and enter a prompt. Review all generated copy and sections before saving. Only use testimonials, ratings, awards, licenses, and guarantees supplied by the client. The assistant uses the existing OpenRouter configuration.

## Operations and reports

The **Accounts overview** table shows package, MRR, health, lead goal, response time, answering minutes, texts, AI tokens, and manager. Agency admins can edit MRR. A nightly database job refreshes health scores. **Failed automations** shows recent failed runs; correct the underlying provider or data issue, then select **Retry**. The delivery worker must be scheduled and `delivery_automation` enabled for jobs to run. Reports are drafted from account data and require a manager to review the narrative before sending.

Missed-call text-back reserves the caller's number for 24 hours before sending. If MightyCall times out after accepting a message, the reservation remains to prevent a duplicate. Check the failed automation and MightyCall message history before retrying; a new automatic text-back can send after the 24-hour window.

## Secrets and provider activation

Set server secrets in Vercel production environment variables, then redeploy. Never place them in client code or `NEXT_PUBLIC_` variables. The main variables are `SUPABASE_SERVICE_ROLE_KEY`, `PORTAL_BASE_URL`, `PUBLIC_PAGES_BASE_URL`, `MIGHTYCALL_API_KEY`, `MIGHTYCALL_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `INVITE_FROM_EMAIL`, `SLACK_WEBHOOK_URL`, and `CLIENT_DELIVERY_WORKER_SECRET`. The app also uses its existing OpenRouter variables. Check the specific integration handlers before changing a provider secret name.

Set `PORTAL_BASE_URL` to the exact HTTPS origin used by clients, such as `https://portal.victorysync.com`. Stripe billing portal sessions return there. The billing button reports a configuration error if this value is missing or invalid.

MightyCall API delivery also requires `MIGHTYCALL_SECRET_KEY` (or `MIGHTYCALL_USER_KEY`) in Vercel. This is the account's API User key or Classic extension, and is separate from `MIGHTYCALL_WEBHOOK_SECRET`. Set `MIGHTYCALL_PRODUCT=call_center` for a Call Center account; omit it for Classic. Call Center uses the `ccapi.mightycall.com` host and `/contactcenter/messages/send` path, while Classic uses `api.mightycall.com` and `/messages/send`. Verify the product type before enabling automated texts.

The client delivery worker and checkout webhook run only when Vercel reports `VERCEL_ENV=production`. Setting `CLIENT_DELIVERY_SANDBOX=1` disables them even in production. Client invite emails and client-creation Slack alerts also respect this gate. Preview and local runs do not send through these paths. Verify provider credentials and a single controlled event before clearing sandbox mode in production.

To rotate a secret, add the new value in Vercel, update the provider webhook or API credential, redeploy, test a single event, and then revoke the old value. Update any matching Supabase Vault secret used by Edge Functions or scheduled jobs. Stripe and MightyCall webhooks must be pointed at the production handlers and signed with the matching secrets.

For client checkout provisioning, subscribe the Stripe endpoint `/api/client-stripe-webhook` to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. A completed checkout with an unpaid delayed payment waits; the signed success event provisions the account after payment. Include `company_id` and `package` in the Checkout Session metadata, plus owner name and email there or in customer details.

## Opt-out

Inbound STOP, UNSUBSCRIBE, CANCEL, END, or QUIT marks the lead `dnc`, cancels follow-up work, and sends one confirmation. Inspect the lead and its automation jobs if an opt-out is disputed. Do not manually re-enroll an opted-out lead without a new, documented consent event.

## Verification

Run `node --test tests/account-templates-ops.test.mjs` with `DATABASE_URL` to test migration idempotence, all package templates, and agency-only operations inside a rolled-back transaction. Run the repository test and typecheck commands before deploying. Provider delivery, webhook timing, billing, and live domain checks require configured production credentials and test events.
