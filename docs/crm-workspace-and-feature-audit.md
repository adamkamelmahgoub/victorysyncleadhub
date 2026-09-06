# CRM workspace redesign and feature audit

## Branding and layout

The redesign was checked against [VictorySync's live website](https://www.victorysync.com/) on September 6, 2026 using computed browser styles and its actual logo asset, `/LOGO_VS.png`. The website uses Inter, primary blue `#2563EB`, white surfaces, slate text (`#0F172A` / `#475569`) and restrained 8px rounding. The previous orange treatment came from this repository's old favicon and did not match the current website.

The working CRM now opens directly on the Companies table. The large home cards and marketing-style banners are removed from the active home/company routes. A light collapsible sidebar groups the existing modules. Company records open in a side panel, with a full-record route available. The optional board is more compact; changes to stages use the record editor or bulk action rather than drag-and-drop.

## Implemented in this update

- Company table/board toggle, search across companies/people/tags/custom-property values, stage and follow-up filters, sorting, column visibility, saved browser views, CSV export, and bulk stage changes with partial-failure reporting. Trial constraints still apply to every bulk update.
- One multi-tab editor for creating and updating records: Overview, People, Trial & Sales, Follow-up, Properties.
- Email, website, full business address, multiple named contacts with roles/email/phone, tags, and named custom text properties.
- Next action and follow-up time; coverage hours/timezone; expected leads per day; trial success criteria, results, monthly price/currency, close-call time and decision notes.
- Persisted company tasks: task/callback/email/meeting/close-call types, due times, priority, status, assignee name, notes, edit/complete/reopen controls, and a global Tasks & Follow-ups page.
- Private company files, up to 10 MB each: PDF, PNG/JPEG, plain text/CSV, DOCX/XLSX. File downloads use short-lived signed links. Failed metadata saves attempt cleanup of only the newly uploaded file.
- Conversation replies now call the existing server endpoint and show its real queued status. Fabricated sent messages, unread indicators, timestamps and sample reply snippets were removed. This does not add a mail-delivery worker.

Saved views are stored per signed-in user in this browser, not synchronized across devices. Task assignees are manually entered names, not a new permission system. Due dates are in-app reminders; this update does not send notifications. Coverage hours are operational notes, not automatic call routing. Proposed prices are records, not invoices or charges. Company contacts are additional people on the record, not automatic copies into the older Contacts table.

## HubSpot comparison and remaining scope

HubSpot's [product catalog](https://www.hubspot.com/products) spans CRM, sales, marketing, service, content, data, revenue/billing, and AI-agent products. This is a scoped implementation plus a source-code audit, **not a claim of full HubSpot feature parity**. Existing menu items do not prove production readiness.

| Area           | Current repository / this update                                                                                     | Remaining work for comparable functionality                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| CRM records    | Companies, contacts, activities, properties, tags, tasks, files, search, views and exports                           | Bidirectional company/contact associations, import mapping for companies, merge/deduplication rules, field permissions, audit history |
| Sales pipeline | Existing configurable contact pipelines plus fixed company trial stages; monthly-price and close tracking            | Separate company opportunities, products/line items, forecasts, quotes, approvals, document signatures                                |
| Outreach       | Existing sequences, email templates and mailbox configuration screens; inbox now persists queued requests truthfully | Verify provider delivery and queue workers, unsubscribe/suppression behavior, inbound sync, tracking, retry/idempotency guarantees    |
| Calling        | Call/lead activity logging, response-time reporting and inbound trial capacity                                       | Connected dialer/phone provider, recordings, number provisioning and consent-aware workflows                                          |
| Scheduling     | Existing meeting scheduler and trial date queue                                                                      | Verify provider calendar connections and synchronization, team round-robin booking, automated reminders                               |
| Marketing      | Existing campaign, form, segment and workflow configuration pages                                                    | Verify background execution, enrollment and reporting end-to-end; social/ad publishing, attribution and experiment infrastructure     |
| Service        | Company notes, activities and follow-up tasks; existing reputation module                                            | Tickets/help desk, live chat, knowledge base, SLAs, customer portal and service-specific reports                                      |
| Content        | Existing form editor                                                                                                 | Website/blog CMS, themes, SEO tools, publishing, analytics and content lifecycle                                                      |
| Data           | Existing contact import/duplicate utilities and API/webhook routes                                                   | Cross-source sync, durable retries, reconciliation, data quality controls, custom object administration                               |
| Commerce       | Recorded proposed prices and existing account/billing integration surfaces                                           | Payment provider connection, product catalog, invoices, subscriptions, tax and reconciliation                                         |
| AI             | No new AI service in this change                                                                                     | Selected model/provider, credentials, budget limits, grounded retrieval, evaluation and workflow controls                             |

These gaps require separate workflows and, in many cases, connected providers. None is represented by a decorative “working” button in the new company workspace. The unmodified older modules still require their own production audits.

## Database and deployment

Apply `supabase/migrations/20260905_company_trials.sql` first if it has not already been applied, then **`supabase/migrations/20260906_company_workspace.sql`**. Do not rerun an already-applied migration or historical destructive cleanup scripts. Both migrations were executed against disposable PostgreSQL in tests; the second preserves company rows and adds fields, task/file tables, and a private storage bucket with policies.

No live database migration was executed from this environment: it has no verified Supabase migration connection. The new API reports missing schema as a setup error rather than claiming a save succeeded. Existing company trial overlap protection, Supabase authentication and pipeline permissions remain in use.

## Validation

- `pnpm test:crm`: six suites covering date calculations, expanded inputs, attribution, API paging/authorization and both real SQL migrations in PGlite. SQL tests exercise preservation of company/contact rows, tasks, files, private storage policies, viewer restrictions and trial/KPI invariants.
- Frontend and Vercel API typechecks; production frontend/server builds.
- Chromium desktop/mobile check with mocked auth/API/storage: multi-tab creation with people/tags/properties, trial/price edits, task creation/completion, file upload, filters, saved view, CSV export, board/table switch and mobile navigation. No live customer records or messages were created during these checks.
