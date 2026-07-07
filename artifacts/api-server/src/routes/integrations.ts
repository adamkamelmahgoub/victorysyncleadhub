import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, integrationsTable, leadsTable, activitiesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

type IntegrationConfig = Record<string, unknown>;

function serializeIntegration(row: typeof integrationsTable.$inferSelect) {
  const config = row.config as IntegrationConfig;
  const redactedConfig = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      /token|secret|password|key/i.test(key) ? "********" : value,
    ]),
  );

  return {
    ...row,
    config: redactedConfig,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function getSecret(config: IntegrationConfig, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value : "";
}

async function refreshAccessTokenIfPossible(
  integration: typeof integrationsTable.$inferSelect,
  config: IntegrationConfig,
) {
  const refreshToken = getSecret(config, "refresh_token");
  if (!refreshToken) return getSecret(config, "access_token");

  const refreshProviders: Record<string, {
    tokenUrl: string;
    clientId: string | undefined;
    clientSecret: string | undefined;
  }> = {
    gmail: {
      tokenUrl: "https://oauth2.googleapis.com/token",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    google_business: {
      tokenUrl: "https://oauth2.googleapis.com/token",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    calendly: {
      tokenUrl: "https://auth.calendly.com/oauth/token",
      clientId: process.env.CALENDLY_CLIENT_ID,
      clientSecret: process.env.CALENDLY_CLIENT_SECRET,
    },
  };
  const refreshConfig = refreshProviders[integration.type];

  if (!refreshConfig?.clientId || !refreshConfig.clientSecret) {
    return getSecret(config, "access_token");
  }

  const tokenRes = await fetch(refreshConfig.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: refreshConfig.clientId,
      client_secret: refreshConfig.clientSecret,
    }).toString(),
  });

  const tokenData = await tokenRes.json().catch(() => ({})) as Record<string, unknown>;
  if (!tokenRes.ok || !tokenData.access_token) {
    return getSecret(config, "access_token");
  }

  const nextConfig = {
    ...config,
    access_token: String(tokenData.access_token),
    refresh_token: String(tokenData.refresh_token ?? refreshToken),
    token_type: String(tokenData.token_type ?? config.token_type ?? "Bearer"),
    expires_in: tokenData.expires_in ?? config.expires_in,
    token_refreshed_at: new Date().toISOString(),
  };

  await db.update(integrationsTable)
    .set({ config: nextConfig, updatedAt: new Date() })
    .where(eq(integrationsTable.id, integration.id));

  Object.assign(config, nextConfig);
  return String(tokenData.access_token);
}

async function getIntegration(id: number) {
  const [integration] = await db
    .select()
    .from(integrationsTable)
    .where(eq(integrationsTable.id, id))
    .limit(1);
  return integration;
}

async function upsertLeadFromIntegration(input: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  source: string;
  externalId?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}) {
  const email =
    input.email?.trim().toLowerCase() ||
    (input.phone ? `${input.phone.replace(/\D/g, "") || "unknown"}@${input.source}.local` : "");

  if (!email) return { created: false };

  const existing = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.email, email))
    .limit(1);

  if (existing[0]) return { created: false, id: existing[0].id };

  const fallbackName = email.split("@")[0] || input.source;
  const [lead] = await db
    .insert(leadsTable)
    .values({
      firstName: input.firstName || fallbackName,
      lastName: input.lastName || "",
      email,
      phone: input.phone,
      company: input.company,
      source: input.source,
      status: "new",
      score: 10,
      tags: input.tags ?? [input.source],
      customFields: {
        externalId: input.externalId,
        importedFrom: input.source,
        ...(input.customFields ?? {}),
      },
    })
    .returning();

  await db.insert(activitiesTable).values({
    leadId: lead.id,
    type: "imported",
    description: `Lead imported from ${input.source}`,
  });

  return { created: true, id: lead.id };
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function extractEmail(value: string) {
  const match = value.match(/<([^>]+)>/) ?? value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (match?.[1] ?? match?.[0] ?? "").trim().toLowerCase();
}

router.get("/integrations", async (req, res): Promise<void> => {
  const rows = await db.select().from(integrationsTable).orderBy(desc(integrationsTable.createdAt));
  res.json(rows.map(serializeIntegration));
});

router.post("/integrations", async (req, res): Promise<void> => {
  const body = z.object({
    type: z.string().min(1),
    name: z.string().min(1),
    accountIdentifier: z.string().optional(),
    status: z.enum(["connected", "disconnected", "error"]).default("connected"),
    config: z.record(z.string(), z.unknown()).default({}),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const existing = await db.select().from(integrationsTable).where(eq(integrationsTable.type, body.data.type)).limit(1);
  if (existing[0]) {
    const [updated] = await db.update(integrationsTable)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(integrationsTable.type, body.data.type))
      .returning();
    res.json(serializeIntegration(updated));
    return;
  }

  const [row] = await db.insert(integrationsTable).values(body.data).returning();
  res.status(201).json(serializeIntegration(row));
});

router.patch("/integrations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = z.object({
    status: z.enum(["connected", "disconnected", "error"]).optional(),
    accountIdentifier: z.string().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await db.update(integrationsTable).set({ ...body.data, updatedAt: new Date() }).where(eq(integrationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Integration not found" }); return; }
  res.json(serializeIntegration(row));
});

router.post("/integrations/stripe/validate", async (req, res): Promise<void> => {
  const body = z.object({
    publishableKey: z.string().optional(),
    secretKey: z.string().min(1),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const accountRes = await fetch("https://api.stripe.com/v1/account", {
    headers: { Authorization: `Bearer ${body.data.secretKey}` },
  });
  const account = await accountRes.json().catch(() => ({})) as Record<string, unknown>;
  if (!accountRes.ok) {
    res.status(400).json({ error: String(account.error ?? "Invalid Stripe secret key") });
    return;
  }

  const accountIdentifier = String(account.email ?? account.id ?? "Stripe account");
  const integrationData = {
    type: "stripe",
    name: "Stripe",
    accountIdentifier,
    status: "connected" as const,
    config: {
      publishable_key: body.data.publishableKey ?? "",
      secret_key: body.data.secretKey,
      stripe_account_id: String(account.id ?? ""),
    },
    updatedAt: new Date(),
  };

  const existing = await db.select().from(integrationsTable).where(eq(integrationsTable.type, "stripe")).limit(1);
  if (existing[0]) {
    await db.update(integrationsTable).set(integrationData).where(eq(integrationsTable.type, "stripe"));
  } else {
    await db.insert(integrationsTable).values(integrationData);
  }

  res.json({ success: true, accountIdentifier });
});

router.post("/integrations/:id/sync", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const integration = await getIntegration(id);
  if (!integration) { res.status(404).json({ error: "Integration not found" }); return; }
  if (integration.status !== "connected") {
    res.status(400).json({ error: "Integration is not connected" });
    return;
  }

  const config = integration.config as IntegrationConfig;
  let pulled = 0;
  let imported = 0;

  try {
    if (integration.type === "gmail") {
      const token = await refreshAccessTokenIfPossible(integration, config);
      const listRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = await listRes.json() as { messages?: { id: string }[]; error?: unknown };
      if (!listRes.ok) throw new Error(String(list.error ?? "Failed to pull Gmail messages"));

      for (const msg of list.messages ?? []) {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!msgRes.ok) continue;
        const data = await msgRes.json() as { payload?: { headers?: { name: string; value: string }[] } };
        const from = data.payload?.headers?.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
        const email = extractEmail(from);
        if (!email) continue;
        pulled++;
        const displayName = from.replace(/<[^>]+>/g, "").replace(/"/g, "").trim();
        const names = splitName(displayName);
        const result = await upsertLeadFromIntegration({
          email,
          firstName: names.firstName,
          lastName: names.lastName,
          source: "gmail",
          externalId: msg.id,
          tags: ["gmail", "email"],
        });
        if (result.created) imported++;
      }
    } else if (integration.type === "calendly") {
      const token = await refreshAccessTokenIfPossible(integration, config);
      const meRes = await fetch("https://api.calendly.com/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const me = await meRes.json() as { resource?: { uri?: string }; message?: string };
      if (!meRes.ok || !me.resource?.uri) throw new Error(me.message ?? "Failed to pull Calendly user");

      const eventsRes = await fetch(`https://api.calendly.com/scheduled_events?user=${encodeURIComponent(me.resource.uri)}&count=10&sort=start_time:desc`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const events = await eventsRes.json() as { collection?: { uri: string; name?: string }[]; message?: string };
      if (!eventsRes.ok) throw new Error(events.message ?? "Failed to pull Calendly events");

      for (const event of events.collection ?? []) {
        const inviteesRes = await fetch(`${event.uri}/invitees`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!inviteesRes.ok) continue;
        const invitees = await inviteesRes.json() as { collection?: { email?: string; name?: string; uri?: string }[] };
        for (const invitee of invitees.collection ?? []) {
          if (!invitee.email) continue;
          pulled++;
          const names = splitName(invitee.name ?? "");
          const result = await upsertLeadFromIntegration({
            email: invitee.email,
            firstName: names.firstName,
            lastName: names.lastName,
            source: "calendly",
            externalId: invitee.uri,
            tags: ["calendly", "booking"],
            customFields: { eventName: event.name },
          });
          if (result.created) imported++;
        }
      }
    } else if (integration.type === "stripe") {
      const secretKey = getSecret(config, "secret_key");
      const customersRes = await fetch("https://api.stripe.com/v1/customers?limit=25", {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      const customers = await customersRes.json() as { data?: { id: string; email?: string; name?: string; phone?: string }[]; error?: unknown };
      if (!customersRes.ok) throw new Error(String(customers.error ?? "Failed to pull Stripe customers"));

      for (const customer of customers.data ?? []) {
        if (!customer.email && !customer.phone) continue;
        pulled++;
        const names = splitName(customer.name ?? "");
        const result = await upsertLeadFromIntegration({
          email: customer.email,
          phone: customer.phone,
          firstName: names.firstName,
          lastName: names.lastName,
          source: "stripe",
          externalId: customer.id,
          tags: ["stripe", "customer"],
        });
        if (result.created) imported++;
      }
    } else if (integration.type === "twilio_sms") {
      const accountSid = getSecret(config, "account_sid");
      const authToken = getSecret(config, "auth_token");
      const messagesRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json?PageSize=25`, {
        headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
      });
      const messages = await messagesRes.json() as { messages?: { sid: string; from?: string; body?: string }[]; message?: string };
      if (!messagesRes.ok) throw new Error(messages.message ?? "Failed to pull Twilio messages");

      const seen = new Set<string>();
      for (const message of messages.messages ?? []) {
        if (!message.from || seen.has(message.from)) continue;
        seen.add(message.from);
        pulled++;
        const result = await upsertLeadFromIntegration({
          phone: message.from,
          firstName: message.from,
          source: "twilio_sms",
          externalId: message.sid,
          tags: ["twilio", "sms"],
          customFields: { lastMessagePreview: message.body?.slice(0, 120) },
        });
        if (result.created) imported++;
      }
    } else if (integration.type === "google_business") {
      const token = await refreshAccessTokenIfPossible(integration, config);
      const accountsRes = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const accounts = await accountsRes.json() as { accounts?: { name: string; accountName?: string }[]; error?: unknown };
      if (!accountsRes.ok) throw new Error(String(accounts.error ?? "Failed to pull Google Business accounts"));
      pulled = accounts.accounts?.length ?? 0;
    } else if (integration.type === "zapier") {
      const webhookUrl = getSecret(config, "webhook_url");
      const hookRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "sync_test", source: "victorysync", timestamp: new Date().toISOString() }),
      });
      if (!hookRes.ok) throw new Error("Zapier webhook did not accept the test event");
      pulled = 1;
    } else {
      res.status(400).json({ error: `Sync is not implemented for ${integration.name}` });
      return;
    }

    await db.update(integrationsTable)
      .set({
        status: "connected",
        config: { ...config, last_sync_at: new Date().toISOString(), last_sync_pulled: pulled, last_sync_imported: imported },
        updatedAt: new Date(),
      })
      .where(eq(integrationsTable.id, id));

    res.json({ success: true, pulled, imported });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await db.update(integrationsTable)
      .set({ status: "error", config: { ...config, last_sync_error: message }, updatedAt: new Date() })
      .where(eq(integrationsTable.id, id));
    res.status(400).json({ error: message });
  }
});

router.delete("/integrations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.delete(integrationsTable).where(eq(integrationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Integration not found" }); return; }
  res.sendStatus(204);
});

export default router;
