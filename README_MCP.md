# Victory Sync remote MCP connector

Status: deployed to `https://app.victorysync.com/api/mcp` on 2026-10-06. The MCP migration is applied. OAuth discovery, registration, unauthorized access, and an authenticated read-only MCP call were verified. An interactive Claude authorization still requires the admin to sign in from Claude.

## Deployment

This repository is Vite on Vercel, not Next.js. `api/mcp.ts` is a dedicated Vercel function. Root OAuth discovery and registration paths are rewritten to it by `vercel.json`; `/api/mcp` is the Streamable HTTP connector URL. Use `https://YOUR_DOMAIN/api/mcp` in claude.ai custom connectors after deployment.

Set server-side Vercel environment variables:

| Variable | Purpose |
| --- | --- |
| `MCP_PUBLIC_URL` | Exact HTTPS origin, for example `https://app.victorysync.io`; no path or trailing slash. |
| `MCP_ALLOWED_EMAILS` | Comma-separated Supabase Auth email addresses permitted to authorize; initially set only your admin email. |
| `DATABASE_URL` | Supabase Postgres connection string for server-side SQL. |
| `SUPABASE_SERVICE_ROLE_KEY` or existing `SUPABASE_SERVICE_KEY` | Server-only Supabase service key. The handler refuses to start without one. |
| `SUPABASE_URL` | Supabase project URL used for Auth. |
| `SUPABASE_ANON_KEY` | Public Supabase Auth key used for sign-in and user verification. |

Keep `DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` out of Vite variables, client bundles, and logs. The authorization form signs in through Supabase Auth and checks the verified email against `MCP_ALLOWED_EMAILS`. This initial form supports password sign-in; accounts that require SSO or MFA need an additional authorization-page integration before use.

`supabase/migrations/20261008_mcp_oauth.sql` was reviewed and applied. It adds clients, one-time codes, hashed access/refresh tokens, audit logs, and row backups. Existing CRM RLS and normal-user auth are unchanged.

## OAuth and revocation

The connector exposes protected-resource metadata at `/.well-known/oauth-protected-resource` and authorization-server metadata at `/.well-known/oauth-authorization-server`. Dynamic registration accepts only these callbacks:

- `https://claude.ai/api/mcp/auth_callback`
- `https://claude.com/api/mcp/auth_callback`

OAuth uses authorization code with S256 PKCE, one-time five-minute codes, one-hour access tokens, rotating 30-day refresh tokens, hashed token storage, and 120 MCP requests per token per minute. Revoke a token by posting its token and client ID to `/revoke`, or revoke all tokens for an account with a server-side SQL update:

```sql
update public.mcp_oauth_tokens set revoked_at=now() where email=lower('admin@example.com') and revoked_at is null;
```

To add an allowed account, add its verified Supabase Auth email to `MCP_ALLOWED_EMAILS` and redeploy. Remove an email from the variable to deny existing access immediately; revoke its tokens to clear stored grants.

## Tool and recovery notes

Generic tools cover current and future public tables. `update_rows` and `upsert_rows` accept `return_rows: false` to return counts instead of records. `bulk_tag_leads` accepts either `lead_ids` (up to 5,000 UUIDs) or a `sql_where` expression, plus `add_tags` and `remove_tags`; it returns only `{matched, updated}`. Removals take precedence over additions. Its statement timeout is 120 seconds.

`run_sql` can also reach non-public schemas if the database role permits it and has a 60-second statement timeout. Specialized lead booking, call, DNC, and sequence tools use existing database triggers and functions. Every write and SQL call creates `mcp_audit_log`; `delete_rows` saves matched rows in `mcp_deleted_backup`. For plain `UPDATE ... WHERE` statements on public tables, `run_sql` backs up only matching rows; complex destructive SQL retains the broad public-table snapshot fallback. Arbitrary SQL can still change schemas, functions, or the backup table itself; this in-database backup is not an independent disaster recovery copy. Maintain a Supabase backup or PITR policy for true recovery.

The scorecard exposes `sprints_closed` as null because the discovered schema has no authoritative sprint-close event. `audits_booked` maps to logged `meeting_booked` calls and `audits_held` to classified call outcomes; verify those business definitions before using the figures as operating metrics.

## Additional verification

1. Use `corepack pnpm dlx @modelcontextprotocol/inspector` against the production URL with an authorized OAuth session to exercise the interactive PKCE flow.
2. Check token rotation, write tools, DNC skip behavior, booking Slack audit, deletion backup, SQL timeout, and revocation before depending on them for live CRM work. These destructive and external-effect paths were not exercised during deployment.
