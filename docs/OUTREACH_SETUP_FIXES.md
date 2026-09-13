# Email setup and campaign membership fixes

The domain creation endpoint now restores archived domains instead of failing on their reserved names. Existing visible domains return successfully without resetting DNS or primary-domain permission. Restored domains retain their IDs and mailbox history; their DNS checks reset and their mailboxes remain paused. Burned domains cannot be restored.

Install `supabase/migrations/20260915_outreach_domain_restore.sql` after Phase 4. Its rollback is in `supabase/rollbacks/20260915_outreach_domain_restore.sql`. This migration installs only a server RPC and its permissions; it does not restore any domain or enable sending itself.

The public unsubscribe origin resolves from `OUTREACH_PUBLIC_URL`, then `APP_URL`, then `https://VERCEL_PROJECT_PRODUCTION_URL`. Explicit malformed values still produce an actionable error. The production fallback is supplied by Vercel, not by request headers. See [Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables). On other hosting, set one of the two explicit HTTPS origins and redeploy.

Campaign details preserve string/UUID IDs and work at both `/campaigns/:id` and `/leadgen/campaigns/:id`. The Supabase membership response now matches the client’s `leads` list format, paginates through all members, and preserves member status when an assignment is retried.

The campaign picker reads all contact pages and does not trust the older truncated total count. The visible list loads in groups of 100 while Select All selects every matching contact. Assignment uses requests of 200 IDs with no total campaign membership limit. Existing campaign pages also have Add leads. After an interrupted creation, retry uses the same campaign; already-added Supabase members are ignored without restarting their status. Sending caps are separate from campaign membership.

Regression tests cover more than 1,000 contacts, bounded assignment requests, partial failures, UUID API routes, member pagination/response shape, duplicate preservation, production URL resolution, domain creation, restoration, burned-domain blocking, permissions and migration rollback for integer and UUID schemas.
