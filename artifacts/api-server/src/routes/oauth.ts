import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, integrationsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

function getBaseUrl(req: { headers: Record<string, string | string[] | undefined> }): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) return `https://${domains.split(",")[0]}`;
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) return `https://${devDomain}`;
  const host = req.headers.host;
  return `http://${host ?? "localhost"}`;
}

// Simple in-memory state store (for CSRF)
const oauthStates = new Map<string, { provider: string; createdAt: number }>();
function genState(): string {
  const s = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return s;
}

const PROVIDER_CONFIG: Record<string, {
  name: string;
  integrationKey: string;
  authUrl: string;
  tokenUrl: string;
  scope: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  userInfoUrl?: string;
  userInfoEmailField?: string;
}> = {
  google: {
    name: "Gmail",
    integrationKey: "gmail",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    userInfoEmailField: "email",
  },
  facebook: {
    name: "Facebook",
    integrationKey: "facebook",
    authUrl: "https://www.facebook.com/v18.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
    scope: "email,pages_messaging,pages_show_list,pages_read_engagement",
    clientIdEnv: "FACEBOOK_APP_ID",
    clientSecretEnv: "FACEBOOK_APP_SECRET",
    userInfoUrl: "https://graph.facebook.com/me?fields=email,name",
    userInfoEmailField: "email",
  },
  instagram: {
    name: "Instagram",
    integrationKey: "instagram",
    authUrl: "https://api.instagram.com/oauth/authorize",
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    scope: "user_profile,user_media",
    clientIdEnv: "INSTAGRAM_APP_ID",
    clientSecretEnv: "INSTAGRAM_APP_SECRET",
  },
  slack: {
    name: "Slack",
    integrationKey: "slack",
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scope: "incoming-webhook,chat:write,channels:read",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
  },
  linkedin: {
    name: "LinkedIn",
    integrationKey: "linkedin",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scope: "r_liteprofile r_emailaddress w_member_social",
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
    userInfoUrl: "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))",
  },
  google_business: {
    name: "Google Business",
    integrationKey: "google_business",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/userinfo.email",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    userInfoEmailField: "email",
  },
  calendly: {
    name: "Calendly",
    integrationKey: "calendly",
    authUrl: "https://auth.calendly.com/oauth/authorize",
    tokenUrl: "https://auth.calendly.com/oauth/token",
    scope: "default",
    clientIdEnv: "CALENDLY_CLIENT_ID",
    clientSecretEnv: "CALENDLY_CLIENT_SECRET",
  },
};

// GET /oauth/providers — which providers have env vars configured
router.get("/oauth/providers", (_req, res): void => {
  const status: Record<string, { configured: boolean; callbackUrl?: string }> = {};
  for (const [key, cfg] of Object.entries(PROVIDER_CONFIG)) {
    const configured = !!(process.env[cfg.clientIdEnv] && process.env[cfg.clientSecretEnv]);
    status[key] = { configured };
  }
  res.json(status);
});

// GET /oauth/callback-url — return the callback URL for a provider
router.get("/oauth/callback-url", (req, res): void => {
  const base = getBaseUrl(req as Parameters<typeof getBaseUrl>[0]);
  const urls: Record<string, string> = {};
  for (const key of Object.keys(PROVIDER_CONFIG)) {
    urls[key] = `${base}/api/oauth/${key}/callback`;
  }
  res.json(urls);
});

// GET /oauth/:provider/start — initiate OAuth
router.get("/oauth/:provider/start", (req, res): void => {
  const { provider } = req.params as { provider: string };
  const cfg = PROVIDER_CONFIG[provider];
  if (!cfg) { res.status(404).json({ error: "Unknown provider" }); return; }

  const clientId = process.env[cfg.clientIdEnv];
  if (!clientId) {
    const base = getBaseUrl(req as Parameters<typeof getBaseUrl>[0]);
    res.redirect(`${base}/integrations?error=not_configured&provider=${provider}`);
    return;
  }

  const base = getBaseUrl(req as Parameters<typeof getBaseUrl>[0]);
  const redirectUri = `${base}/api/oauth/${provider}/callback`;
  const state = genState();
  oauthStates.set(state, { provider, createdAt: Date.now() });

  // Cleanup old states
  for (const [k, v] of oauthStates.entries()) {
    if (Date.now() - v.createdAt > 10 * 60 * 1000) oauthStates.delete(k);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: cfg.scope,
    response_type: "code",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  res.redirect(`${cfg.authUrl}?${params.toString()}`);
});

// GET /oauth/:provider/callback — exchange code for token
router.get("/oauth/:provider/callback", async (req, res): Promise<void> => {
  const { provider } = req.params as { provider: string };
  const { code, state, error } = req.query as Record<string, string>;

  const base = getBaseUrl(req as Parameters<typeof getBaseUrl>[0]);
  const frontendBase = base;

  if (error) {
    res.redirect(`${frontendBase}/integrations?error=${encodeURIComponent(error)}&provider=${provider}`);
    return;
  }

  const stateData = oauthStates.get(state ?? "");
  if (!stateData || stateData.provider !== provider) {
    res.redirect(`${frontendBase}/integrations?error=invalid_state&provider=${provider}`);
    return;
  }
  oauthStates.delete(state ?? "");

  const cfg = PROVIDER_CONFIG[provider];
  if (!cfg) { res.status(404).json({ error: "Unknown provider" }); return; }

  const clientId = process.env[cfg.clientIdEnv] ?? "";
  const clientSecret = process.env[cfg.clientSecretEnv] ?? "";
  const redirectUri = `${base}/api/oauth/${provider}/callback`;

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: code ?? "", redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }).toString(),
    });
    const tokenData = await tokenRes.json() as Record<string, unknown>;

    if (!tokenRes.ok || tokenData.error) {
      throw new Error(String(tokenData.error_description ?? tokenData.error ?? "Token exchange failed"));
    }

    const accessToken = String(tokenData.access_token ?? "");
    let accountIdentifier = "";

    // Fetch user info if available
    if (cfg.userInfoUrl && accessToken) {
      try {
        const infoRes = await fetch(cfg.userInfoUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (infoRes.ok) {
          const info = await infoRes.json() as Record<string, unknown>;
          if (cfg.userInfoEmailField) accountIdentifier = String(info[cfg.userInfoEmailField] ?? "");
          else if (info.name) accountIdentifier = String(info.name);
          else if (info.email) accountIdentifier = String(info.email);
        }
      } catch { /* ignore */ }
    }

    // Upsert integration record
    const existing = await db.select().from(integrationsTable).where(eq(integrationsTable.type, cfg.integrationKey)).limit(1);
    const integrationData = {
      type: cfg.integrationKey,
      name: cfg.name,
      accountIdentifier: accountIdentifier || `${cfg.name} account`,
      status: "connected" as const,
      config: { access_token: accessToken, token_type: String(tokenData.token_type ?? "Bearer") },
      updatedAt: new Date(),
    };

    if (existing[0]) {
      await db.update(integrationsTable).set(integrationData).where(eq(integrationsTable.type, cfg.integrationKey));
    } else {
      await db.insert(integrationsTable).values(integrationData);
    }

    res.redirect(`${frontendBase}/integrations?success=true&provider=${provider}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.redirect(`${frontendBase}/integrations?error=${encodeURIComponent(msg)}&provider=${provider}`);
  }
});

// POST /oauth/twilio/validate — validate Twilio credentials
router.post("/oauth/twilio/validate", async (req, res): Promise<void> => {
  const body = z.object({
    accountSid: z.string().min(1),
    authToken: z.string().min(1),
    fromNumber: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  try {
    const { accountSid, authToken, fromNumber } = body.data;
    const twilioRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
      headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
    });

    if (!twilioRes.ok) {
      res.status(400).json({ error: "Invalid Twilio credentials. Check your Account SID and Auth Token." });
      return;
    }

    const info = await twilioRes.json() as Record<string, unknown>;
    const accountName = String(info.friendly_name ?? accountSid);

    // Upsert integration record
    const existing = await db.select().from(integrationsTable).where(eq(integrationsTable.type, "twilio_sms")).limit(1);
    const integrationData = {
      type: "twilio_sms",
      name: "Twilio SMS",
      accountIdentifier: fromNumber ?? accountName,
      status: "connected" as const,
      config: { account_sid: accountSid, from_number: fromNumber ?? "" },
      updatedAt: new Date(),
    };
    if (existing[0]) {
      await db.update(integrationsTable).set(integrationData).where(eq(integrationsTable.type, "twilio_sms"));
    } else {
      await db.insert(integrationsTable).values(integrationData);
    }

    res.json({ success: true, accountName });
  } catch {
    res.status(500).json({ error: "Failed to verify Twilio credentials" });
  }
});

// POST /oauth/zapier/validate — validate Zapier webhook
router.post("/oauth/zapier/validate", async (req, res): Promise<void> => {
  const body = z.object({ webhookUrl: z.string().url() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid webhook URL" }); return; }

  try {
    const testRes = await fetch(body.data.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "test", source: "victorysync", timestamp: new Date().toISOString() }),
    });

    const existing = await db.select().from(integrationsTable).where(eq(integrationsTable.type, "zapier")).limit(1);
    const integrationData = {
      type: "zapier",
      name: "Zapier",
      accountIdentifier: "Webhook connected",
      status: "connected" as const,
      config: { webhook_url: body.data.webhookUrl },
      updatedAt: new Date(),
    };
    if (existing[0]) {
      await db.update(integrationsTable).set(integrationData).where(eq(integrationsTable.type, "zapier"));
    } else {
      await db.insert(integrationsTable).values(integrationData);
    }

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to reach webhook URL" });
  }
});

export default router;
