# Victory Sync enrichment

This is a review draft. Apply `supabase/migrations/20261009_lead_enrichment.sql` only after review, then deploy the four Supabase Edge Functions in `supabase/functions/` and the Vercel app. The new tables are service-role only; the Vercel UI endpoint checks the current Supabase Auth user against `MCP_ALLOWED_EMAILS`.

The UI and MCP tools remain hidden until the migration and secrets are ready. Set `VITE_ENRICHMENT_ENABLED=true` and `ENRICHMENT_ENABLED=true` in Vercel to enable them.

## Required secrets

Set `OPEN_PLACES_API_KEY`, `GOOGLE_PLACES_API_KEY` and `OPENROUTER_API_KEY` as **Supabase Edge Function secrets**. The default `OPENROUTER_MODEL` is `nvidia/nemotron-3.5-lightning:free`. The free endpoint receives only the public company name, state, and research question. It does not receive the lead's phone, email, stored research, or notes, and owner names are suppressed. Use a paid model if person-level research is needed. The existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are also needed by the Edge Functions. The Vercel app already uses `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `DATABASE_URL`, `MCP_ALLOWED_EMAILS`, and `OUTREACH_WORKER_TOKEN`. The database cron uses the existing Vault entries `victorysync_leadgen_origin` and `victorysync_native_worker_token`.

After the migration, set a monthly budget before any paid call:

```sql
update public.enrichment_settings set enrichment_budget_usd = 1 where id = true;
```

The default budget is zero. The requested production cap is $1/month; the five-lead 5x5 Google plus AI trial is conservatively estimated at $7.05 and cannot run under that cap. Every external call reserves a conservative estimated cost atomically through `enrichment_reserve_cost`. The queue pauses when the monthly budget or a job cap is reached. Google Text Search Enterprise calls are estimated at $0.035 each; OpenRouter research reserves up to $0.50 per request and settles against token and search usage. These are estimates, not an invoice.

## Google data handling

Google's standard Places terms permit keeping place IDs indefinitely and Places latitude/longitude temporarily for up to 30 days. They do not grant a 30-day cache for ratings, reviews, hours, names, or addresses. The draft therefore saves only the place ID and a fetch timestamp in `leads.custom_fields.google`. It shows fresh Places results in the UI immediately after a request and does not store the grid or exact Places data. The proposed grid tags are returned but not saved. AI research is saved to `leads.custom_fields.enrichment` and prepended to `leads.notes`; it is instructed not to repeat Google Maps content. A separate Google agreement or an independently licensed ranking source is needed for the original persistent Google grid, ratings, notes, and tags specification. See [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies) and [Google Maps Platform terms](https://cloud.google.com/maps-platform/terms).

The Google card displays Google Maps attribution and keeps source data only in browser memory for the current page. No Google page scraping is used. The implementation uses Places Text Search (New) and `pageSize: 20`; Google has deprecated `maxResultCount`.

## Queue and first run

The Edge worker claims at most ten leads per run and processes two at a time. Items retry up to three times with backoff. Postgres `pg_cron` calls the existing Vercel worker endpoint every minute; the Vercel endpoint invokes the Supabase Edge worker. A finished job posts counts, tag totals, and estimated spend to Slack if `SLACK_WEBHOOK_URL` is set as an Edge secret.

Wittmaier Plumbing exists in the live CRM as `576af283-eb26-407a-a17a-ccdaf8be9049`. The current intersection of `top3-prospect` and `region-tristate` matches **278** leads. With both modes, the conservative reservation estimate is **$7.05** for five 5×5 leads and **$236.30** for 278 leads at 3×3. Use `enrichment_cost_preview` before `bulk_enrich` or the UI's **Enrich all** panel. Do not queue the 278 until the five-lead trial is checked for matching accuracy and costs.

Run the queue test without touching production:

```sh
pnpm exec tsx --test tests/enrichment-queue.test.ts
```

## Open Places

Open Places runs first and saves the matched business listing under `leads.custom_fields.open_places`. It fills missing city/state, prepends a dated business-listing note, and adds `enrich-op-not-found` if unmatched. Google then uses one narrow match call and an IDs-only rank grid centered on the Open Places location. The lead card attributes the listing to Open Places / Overture separately from Google ratings and ranks.

The `enrichment_api_usage` table caps Open Places at 9,500 calls and Google match calls at 900 per UTC calendar month. Open Places HTTP 402 blocks calls until next month. `find_new_leads` browses Overture `plumbing` and `hvac_service` categories with at most 40 calls per run, and skips existing and DNC phone numbers. City coordinates come from the 2025 US Census Places Gazetteer: https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2025.html . Open Places data rights: https://openplacesapi.com/data-rights ; Overture attribution: https://docs.overturemaps.org/attribution/ .

IDs-only rank searches do not include competitor review counts. Review-ratio tags therefore cannot be recalculated from the Google response without additional licensed rating calls.
