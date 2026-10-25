import type { IncomingMessage, ServerResponse } from "node:http";
import {
  allowedMcpRedirect,
  hashSecret,
  issuerUrl,
  mcpPool,
  newSecret,
  resourceUrl,
  verifySupabasePassword,
} from "./mcp-auth.js";

const send = (res: ServerResponse, status: number, value: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
};
const html = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const authorizeFormCsp =
  "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://claude.ai https://claude.com https://chatgpt.com; base-uri 'none'; frame-ancestors 'none'";
async function body(req: IncomingMessage): Promise<Record<string, string>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16384)
      throw Object.assign(new Error("Request too large"), { status: 413 });
  }
  if (req.headers["content-type"]?.includes("application/json"))
    return JSON.parse(raw || "{}");
  return Object.fromEntries(new URLSearchParams(raw));
}
async function clientFor(id: string, redirect: string) {
  if (!allowedMcpRedirect(redirect))
    throw Object.assign(new Error("Redirect URI is not allowed"), {
      status: 400,
    });
  const q = await mcpPool.query(
    "select client_id from public.mcp_oauth_clients where client_id=$1 and $2 = any(redirect_uris)",
    [id, redirect],
  );
  if (!q.rowCount)
    throw Object.assign(new Error("Unknown OAuth client or redirect URI"), {
      status: 400,
    });
}
function authorizeParams(p: Record<string, string>) {
  if (
    p.response_type !== "code" ||
    !p.client_id ||
    !p.redirect_uri ||
    !p.state ||
    !p.code_challenge ||
    p.code_challenge_method !== "S256" ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge)
  )
    throw Object.assign(
      new Error("Authorization code, state and S256 PKCE are required"),
      { status: 400 },
    );
  if (p.resource && p.resource !== resourceUrl())
    throw Object.assign(new Error("Incorrect MCP resource"), { status: 400 });
  return p;
}
function renderAuthorizeForm(
  res: ServerResponse,
  p: Record<string, string>,
  error?: string,
  status = 200,
) {
  const fields = [
    "response_type",
    "client_id",
    "redirect_uri",
    "state",
    "code_challenge",
    "code_challenge_method",
    "resource",
    "scope",
  ]
    .map((k) => `<input type="hidden" name="${k}" value="${html(p[k] || "")}">`)
    .join("");
  res.statusCode = status;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader(
    "content-security-policy",
    authorizeFormCsp,
  );
  res.end(
    `<!doctype html><html><meta charset="utf-8"><title>Authorize Victory Sync</title><style>body{font:16px system-ui;max-width:420px;margin:8vh auto;padding:20px}label{display:block;margin:14px 0}input{display:block;width:100%;padding:10px;box-sizing:border-box}button{padding:12px 20px}.error{color:#a00}</style><h1>Connect Victory Sync CRM</h1><p>This grants CRM read and write access to the selected MCP client. Sign in with your Victory Sync account to authorize.</p>${error ? `<p class="error" role="alert">${html(error)}</p>` : ""}<form method="post" action="/authorize">${fields}<label>Email<input name="email" type="email" value="${html(p.email || "")}" required autocomplete="username"></label><label>Password<input name="password" type="password" required autocomplete="current-password"></label><button type="submit">Authorize</button></form></html>`,
  );
}
export async function handleMcpOAuth(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): Promise<void> {
  if (
    !issuerUrl() ||
    !process.env.DATABASE_URL ||
    !process.env.MCP_ALLOWED_EMAILS
  ) {
    send(res, 503, { error: "MCP is not configured" });
    return;
  }
  if (
    req.method === "GET" &&
    pathname === "/.well-known/oauth-protected-resource"
  ) {
    send(res, 200, {
      resource: resourceUrl(),
      authorization_servers: [issuerUrl()],
      scopes_supported: ["mcp:full", "offline_access"],
      bearer_methods_supported: ["header"],
    });
    return;
  }
  if (
    req.method === "GET" &&
    pathname === "/.well-known/oauth-authorization-server"
  ) {
    send(res, 200, {
      issuer: issuerUrl(),
      authorization_endpoint: `${issuerUrl()}/authorize`,
      token_endpoint: `${issuerUrl()}/token`,
      registration_endpoint: `${issuerUrl()}/register`,
      revocation_endpoint: `${issuerUrl()}/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["mcp:full", "offline_access"],
    });
    return;
  }
  if (req.method === "POST" && pathname === "/register") {
    const p = (await body(req)) as Record<string, any>;
    if (
      !Array.isArray(p.redirect_uris) ||
      !p.redirect_uris.length ||
      p.redirect_uris.some((x: string) => !allowedMcpRedirect(x)) ||
      (p.token_endpoint_auth_method && p.token_endpoint_auth_method !== "none")
    )
      throw Object.assign(
        new Error("Only approved Claude or ChatGPT callback URIs and public clients are accepted"),
        { status: 400 },
      );
    const id = newSecret();
    await mcpPool.query(
      "insert into public.mcp_oauth_clients(client_id,client_name,redirect_uris) values($1,$2,$3)",
      [id, String(p.client_name || "MCP client").slice(0, 100), p.redirect_uris],
    );
    send(res, 201, {
      client_id: id,
      client_name: p.client_name || "MCP client",
      redirect_uris: p.redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    return;
  }
  if (pathname === "/authorize" && req.method === "GET") {
    const p = authorizeParams(
      Object.fromEntries(new URL(req.url || "", issuerUrl()).searchParams),
    );
    await clientFor(p.client_id, p.redirect_uri);
    renderAuthorizeForm(res, p);
    return;
  }
  if (pathname === "/authorize" && req.method === "POST") {
    const p = authorizeParams(await body(req));
    await clientFor(p.client_id, p.redirect_uri);
    let user: { id: string; email: string };
    try {
      user = await verifySupabasePassword(p.email, p.password);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 401 && status !== 403) throw error;
      renderAuthorizeForm(res, p, (error as Error).message, status);
      return;
    }
    const code = newSecret();
    await mcpPool.query(
      `insert into public.mcp_oauth_codes(code_hash,client_id,user_id,email,redirect_uri,code_challenge,resource,expires_at) values($1,$2,$3,$4,$5,$6,$7,now()+interval '5 minutes')`,
      [
        hashSecret(code),
        p.client_id,
        user.id,
        user.email,
        p.redirect_uri,
        p.code_challenge,
        resourceUrl(),
      ],
    );
    const callback = new URL(p.redirect_uri);
    callback.searchParams.set("code", code);
    callback.searchParams.set("state", p.state);
    res.statusCode = 302;
    res.setHeader("location", callback.toString());
    res.setHeader("cache-control", "no-store");
    res.end();
    return;
  }
  if (pathname === "/token" && req.method === "POST") {
    const p = await body(req);
    if (p.grant_type === "authorization_code") {
      if (
        !p.code ||
        !p.client_id ||
        !p.redirect_uri ||
        !p.code_verifier ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(p.code_verifier)
      )
        throw Object.assign(new Error("Invalid code exchange"), {
          status: 400,
        });
      await clientFor(p.client_id, p.redirect_uri);
      const challenge = Buffer.from(
        hashSecret(p.code_verifier),
        "hex",
      ).toString("base64url");
      const q = await mcpPool.query(
        `delete from public.mcp_oauth_codes where code_hash=$1 and client_id=$2 and redirect_uri=$3 and code_challenge=$4 and resource=$5 and expires_at>now() returning user_id,email`,
        [
          hashSecret(p.code),
          p.client_id,
          p.redirect_uri,
          challenge,
          resourceUrl(),
        ],
      );
      if (!q.rowCount)
        throw Object.assign(
          new Error("Invalid or expired authorization code"),
          { status: 400 },
        );
      const access = newSecret(),
        refresh = newSecret();
      await mcpPool.query(
        `insert into public.mcp_oauth_tokens(access_token_hash,refresh_token_hash,client_id,user_id,email,resource,access_expires_at,refresh_expires_at) values($1,$2,$3,$4,$5,$6,now()+interval '1 hour',now()+interval '30 days')`,
        [
          hashSecret(access),
          hashSecret(refresh),
          p.client_id,
          q.rows[0].user_id,
          q.rows[0].email,
          resourceUrl(),
        ],
      );
      send(res, 200, {
        access_token: access,
        refresh_token: refresh,
        token_type: "Bearer",
        expires_in: 3600,
        scope: "mcp:full offline_access",
      });
      return;
    }
    if (p.grant_type === "refresh_token") {
      if (!p.refresh_token || !p.client_id)
        throw Object.assign(new Error("Missing refresh token or client ID"), {
          status: 400,
        });
      const access = newSecret(),
        refresh = newSecret();
      const q = await mcpPool.query(
        `update public.mcp_oauth_tokens set access_token_hash=$1,refresh_token_hash=$2,access_expires_at=now()+interval '1 hour',refresh_expires_at=now()+interval '30 days',window_count=0,window_started_at=now() where refresh_token_hash=$3 and client_id=$4 and revoked_at is null and refresh_expires_at>now() and resource=$5 returning email`,
        [
          hashSecret(access),
          hashSecret(refresh),
          hashSecret(p.refresh_token),
          p.client_id,
          resourceUrl(),
        ],
      );
      if (!q.rowCount)
        throw Object.assign(new Error("Invalid refresh token"), {
          status: 400,
        });
      if (
        !process.env.MCP_ALLOWED_EMAILS?.split(",")
          .map((x) => x.trim().toLowerCase())
          .includes(q.rows[0].email.toLowerCase())
      )
        throw Object.assign(new Error("Account is no longer allowed"), {
          status: 403,
        });
      send(res, 200, {
        access_token: access,
        refresh_token: refresh,
        token_type: "Bearer",
        expires_in: 3600,
        scope: "mcp:full offline_access",
      });
      return;
    }
    throw Object.assign(new Error("Unsupported grant type"), { status: 400 });
  }
  if (pathname === "/revoke" && req.method === "POST") {
    const p = await body(req);
    if (p.token && p.client_id)
      await mcpPool.query(
        `update public.mcp_oauth_tokens set revoked_at=now() where client_id=$1 and (access_token_hash=$2 or refresh_token_hash=$2)`,
        [p.client_id, hashSecret(p.token)],
      );
    send(res, 200, {});
    return;
  }
  send(res, 404, { error: "Not found" });
}
