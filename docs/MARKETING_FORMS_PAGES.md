# Forms and landing pages

This feature is scoped to Victory Sync's internal organization. It uses the existing Supabase Auth session, the `forms` page permission, and server-side Postgres access. A client workspace cannot manage forms or pages. Owners and admins can use it; members need the **Sites / Forms** page permission. The public `/f/{slug}` and `/p/{slug}` routes do not require login.

## Deploy

1. Apply `supabase/migrations/20261105_marketing_forms_landing_pages.sql`, then `supabase/migrations/20261106_marketing_internal_boundary.sql`, after the existing social workspace migrations. `node scripts/apply-marketing-migration.mjs` applies the first file; pass the second filename as an argument to apply its org boundary. The script reads `DATABASE_URL` or `SOCIAL_DB_ENV_FILE` and uses the Supabase transaction pooler when the supplied URL is a shared session pooler URL.
2. Deploy the Vercel app. The `vercel.json` routes direct `/api/forms`, `/api/landing-pages`, `/f/{slug}`, and `/p/{slug}` to the marketing API.
3. Confirm **Forms** and **Landing pages** appear in the Marketing navigation. The existing database URL, Supabase URL, and Supabase anon key are required. No new provider environment variable is needed.

## Use

1. Create a form. It starts inactive. Add fields, set required values and lead mappings, edit the success message or HTTPS redirect, then switch it to active and save. Copy its public link or iframe embed code.
2. Create a landing page using a lead capture, event, or blank layout. Edit section content and order, select an active form for a form section, set theme and search metadata, then save and publish.
3. Use the **Reports** tab for views, form submissions, conversion rate, daily totals, and referring domains. The form editor shows recent submissions and exports CSV.

Public submissions use a hidden spam field, field validation, a ten-minute per-IP limit, and an idempotency key. They create or match a CRM lead, save a form submission, and add a timeline activity. A submission from a published page also creates a page conversion event. IP addresses are stored only as keyed hashes in the rate-limit table. Embedded forms require a published active form. Only HTTPS redirects are accepted.

MCP users with access to the internal workspace and Sites / Forms can use `list_forms`, `create_form`, `update_form`, `list_form_submissions`, `list_landing_pages`, `create_landing_page`, `update_landing_page`, `publish_landing_page`, and `get_landing_page_report`.

## MCP connection

Use `https://app.victorysync.com/api/mcp` as the remote MCP URL. The server publishes protected-resource and authorization-server metadata and supports authorization-code PKCE with dynamic client registration. The callback allowlist supports Claude and ChatGPT's callback-specific and legacy stable redirect URIs. The account email must appear in `MCP_ALLOWED_EMAILS` and the user must have internal workspace access. An unauthenticated request to `/api/mcp` should return `401` with a `WWW-Authenticate` challenge; a `200` response from both `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` confirms discovery is available. The complete browser authorization flow needs an interactive sign-in by the connecting user.

## Current bounds

The landing page editor provides structured sections, a live desktop/mobile preview, and publishing on the Victory Sync domain. It does not provide arbitrary HTML/JavaScript blocks or custom domains. This keeps public content escaped and avoids giving page editors script execution in the CRM origin. Image sections use public HTTPS image URLs. Page event totals count requests and are not a substitute for bot-filtered analytics.
