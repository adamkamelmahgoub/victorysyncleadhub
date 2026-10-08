# Prospecting and Lead Finder

**Prospecting** (`/prospect-search`) searches live Open Places / Overture plumbing and HVAC business listings around a US city. Enter a city, state, and radius (1–50 miles). Search uses up to four Open Places calls, shows the returned listings, and marks phone numbers already in the CRM or suppression list. Select listings and add them to leads. The database import function checks duplicates and DNC again at write time. Imported leads are tagged `op-new` and `needs-enrichment`.

The stored-prospect list below the discovery form reads `public.prospects`. Its filter choices come from current prospect data. Saving a stored prospect checks existing leads and suppressions, and records its new lead ID so it cannot be saved twice.

**Lead Finder** (`/scraper`) reads public HTML pages from a company domain or direct URL and extracts email addresses found there. Domain scans check the home, about, team, people, and contact pages. Imports skip existing email/phone identities and suppressed contacts. The page no longer offers an unconfigured general web search; local business discovery is in Prospecting.

The Open Places Edge Function uses `OPEN_PLACES_API_KEY` and the existing monthly usage cap. The web finder needs no provider key. Both app endpoints require Victory Sync sign-in and the existing prospecting permission; Open Places discovery additionally uses the enrichment administrator check.
