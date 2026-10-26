# Marketing pages and reports

The Marketing menu contains **Landing pages** and **Forms**. The Reports menu contains **Marketing reports**.

The landing page editor provides ordered sections (hero, text, features, image, call to action, form), a live desktop or mobile preview, theme colors, page metadata, and draft or published status. Drag a section or use its arrow controls to reorder it. Published pages are served at `/api/public/landing/{slug}`. Their form sections embed active forms served at `/api/public/forms/{id}`.

Marketing reports show page views, page attributed submissions, conversion rates, and submissions per form for the last 7 days, last 30 days, or all time. A public form submission is stored in `form_submissions`; when an email or phone field is mapped, the API also creates a CRM lead.

## Database setup

Apply `supabase/migrations/20261023_marketing_pages.sql` after the platform schema migration. The API needs `SUPABASE_SERVICE_ROLE_KEY` (or the existing supported service key alias) for public page and form routes. Do not expose the service key to the browser.

## Checks

Run `node --test tests/marketing-pages.test.mjs`. This checks HTML escaping and validates the migration in an in memory PostgreSQL instance. A full workspace typecheck and live route check still require a complete dependency install and a configured Supabase project.
