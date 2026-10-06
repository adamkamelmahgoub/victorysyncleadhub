import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;
export const mcpPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});
export const hashSecret = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");
export const newSecret = () => crypto.randomBytes(32).toString("base64url");
export const allowedEmail = (email: string) =>
  process.env.MCP_ALLOWED_EMAILS?.split(",")
    .map((x) => x.trim().toLowerCase())
    .includes(email.toLowerCase()) === true;
export const resourceUrl = () =>
  `${process.env.MCP_PUBLIC_URL?.replace(/\/$/, "")}/api/mcp`;
export const issuerUrl = () =>
  process.env.MCP_PUBLIC_URL?.replace(/\/$/, "") || "";
export const allowedRedirects = new Set([
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
]);

export type McpIdentity = {
  tokenId: string;
  userId: string;
  email: string;
  clientId: string;
};

export async function authenticateToken(
  header: string | undefined,
): Promise<McpIdentity | null> {
  const raw = /^Bearer ([A-Za-z0-9_-]+)$/.exec(header || "")?.[1];
  if (!raw) return null;
  const result = await mcpPool.query(
    `update public.mcp_oauth_tokens
    set window_started_at = case when window_started_at < now() - interval '1 minute' then now() else window_started_at end,
        window_count = case when window_started_at < now() - interval '1 minute' then 1 else window_count + 1 end
    where access_token_hash=$1 and revoked_at is null and access_expires_at>now()
    returning id,user_id,email,client_id,window_count`,
    [hashSecret(raw)],
  );
  const row = result.rows[0];
  if (!row || !allowedEmail(row.email)) return null;
  if (row.window_count > 120)
    throw Object.assign(
      new Error("MCP rate limit exceeded; retry in one minute"),
      { status: 429 },
    );
  const base = process.env.SUPABASE_URL,
    service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!base || !service) return null;
  const profile = await fetch(`${base}/auth/v1/admin/users/${row.user_id}`, {
    headers: { apikey: service, authorization: `Bearer ${service}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!profile.ok) return null;
  const current = (await profile.json()) as {
    email?: string;
    email_confirmed_at?: string;
  };
  if (
    !current.email ||
    !current.email_confirmed_at ||
    current.email.toLowerCase() !== row.email.toLowerCase() ||
    !allowedEmail(current.email)
  )
    return null;
  return {
    tokenId: row.id,
    userId: row.user_id,
    email: row.email,
    clientId: row.client_id,
  };
}

export async function verifySupabasePassword(
  email: string,
  password: string,
): Promise<{ id: string; email: string }> {
  const base = process.env.SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !anon) throw new Error("Supabase Auth is not configured");
  const login = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(10000),
  });
  if (!login.ok)
    throw Object.assign(new Error("Supabase sign-in failed"), { status: 401 });
  const session = (await login.json()) as { access_token?: string };
  const profile = await fetch(`${base}/auth/v1/user`, {
    headers: { apikey: anon, authorization: `Bearer ${session.access_token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!profile.ok)
    throw Object.assign(new Error("Could not verify Supabase account"), {
      status: 401,
    });
  const user = (await profile.json()) as {
    id: string;
    email: string;
    email_confirmed_at?: string;
  };
  if (!user.email_confirmed_at || !allowedEmail(user.email))
    throw Object.assign(new Error("Account is not allowed to authorize MCP"), {
      status: 403,
    });
  return { id: user.id, email: user.email };
}
