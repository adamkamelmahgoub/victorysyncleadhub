import { Router } from "express";
import { db } from "@workspace/db";
import { subAccountsTable, apiKeysTable, onboardingProgressTable, leadsTable, campaignsTable } from "@workspace/db/schema";
import { eq, count, desc, gte, sql } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

function verifyApiKey(authHeader: string | undefined): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const key = authHeader.slice(7);
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return true;
}

router.post("/provision/accounts", async (req, res) => {
  const { name, ownerEmail, ownerName, plan, externalId, phone, industry } = req.body;
  if (!name || !ownerEmail || !ownerName) return res.status(400).json({ error: "name, ownerEmail, ownerName required" });

  const existing = externalId ? await db.select().from(subAccountsTable).where(eq(subAccountsTable.externalId, externalId)) : [];
  if (existing.length) return res.status(409).json({ error: "Account with this externalId already exists", account: existing[0] });

  const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;
  const [account] = await db.insert(subAccountsTable).values({ name, slug, ownerEmail, ownerName, plan: plan || "starter", externalId, phone, industry, status: "active" }).returning();
  await db.insert(onboardingProgressTable).values({ subAccountId: account.id, currentStep: "connect_integrations" }).onConflictDoNothing();

  res.status(201).json({ success: true, account, message: `Sub-account "${name}" created successfully` });
});

router.patch("/provision/accounts/:externalId/status", async (req, res) => {
  const { status } = req.body;
  if (!["active", "suspended", "cancelled"].includes(status)) return res.status(400).json({ error: "status must be active, suspended, or cancelled" });
  const [updated] = await db.update(subAccountsTable).set({ status, updatedAt: new Date() }).where(eq(subAccountsTable.externalId, req.params.externalId)).returning();
  if (!updated) return res.status(404).json({ error: "Account not found" });
  res.json({ success: true, account: updated });
});

router.patch("/provision/accounts/:externalId/plan", async (req, res) => {
  const { plan } = req.body;
  if (!plan) return res.status(400).json({ error: "plan is required" });
  const [updated] = await db.update(subAccountsTable).set({ plan, updatedAt: new Date() }).where(eq(subAccountsTable.externalId, req.params.externalId)).returning();
  if (!updated) return res.status(404).json({ error: "Account not found" });
  res.json({ success: true, account: updated });
});

router.get("/provision/accounts/:externalId/stats", async (req, res) => {
  const [account] = await db.select().from(subAccountsTable).where(eq(subAccountsTable.externalId, req.params.externalId));
  if (!account) return res.status(404).json({ error: "Account not found" });

  const [{ leadCount }] = await db.select({ leadCount: count() }).from(leadsTable);
  const [{ campaignCount }] = await db.select({ campaignCount: count() }).from(campaignsTable);

  res.json({
    account: { id: account.id, name: account.name, status: account.status, plan: account.plan, healthScore: account.healthScore, lastActiveAt: account.lastActiveAt },
    usage: { leads: Number(leadCount), campaigns: Number(campaignCount), onboardingCompleted: account.onboardingCompleted },
  });
});

router.get("/provision/stats", async (_req, res) => {
  const accounts = await db.select().from(subAccountsTable);
  const [{ totalLeads }] = await db.select({ totalLeads: count() }).from(leadsTable);
  const active = accounts.filter(a => a.status === "active").length;
  const suspended = accounts.filter(a => a.status === "suspended").length;
  const plans: Record<string, number> = {};
  accounts.forEach(a => { plans[a.plan] = (plans[a.plan] || 0) + 1; });
  res.json({ totalAccounts: accounts.length, active, suspended, plans, totalLeads: Number(totalLeads) });
});

export default router;
