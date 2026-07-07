import { Router } from "express";
import { db } from "@workspace/db";
import { subAccountsTable, whiteLabelSettingsTable, insertSubAccountSchema, insertWhiteLabelSchema } from "@workspace/db/schema";
import { eq, desc, ilike, or, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router = Router();

router.get("/sub-accounts", async (req, res) => {
  const { search, status, plan } = req.query as Record<string, string>;
  let query = db.select().from(subAccountsTable);
  const conditions: any[] = [];
  if (search) conditions.push(or(ilike(subAccountsTable.name, `%${search}%`), ilike(subAccountsTable.ownerEmail, `%${search}%`)));
  if (status) conditions.push(eq(subAccountsTable.status, status));
  if (plan) conditions.push(eq(subAccountsTable.plan, plan));
  const accounts = await db.select().from(subAccountsTable)
    .where(conditions.length ? sql`${conditions.reduce((a, b) => sql`${a} AND ${b}`)}` : undefined)
    .orderBy(desc(subAccountsTable.createdAt));
  res.json(accounts);
});

router.post("/sub-accounts", async (req, res) => {
  const parsed = insertSubAccountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  const [account] = await db.insert(subAccountsTable).values({ ...parsed.data, slug }).returning();
  await db.insert(whiteLabelSettingsTable).values({ subAccountId: account.id, brandName: account.name }).onConflictDoNothing();
  res.status(201).json(account);
});

router.get("/sub-accounts/:id", async (req, res) => {
  const [account] = await db.select().from(subAccountsTable).where(eq(subAccountsTable.id, parseInt(req.params.id)));
  if (!account) return res.status(404).json({ error: "Not found" });
  const [wl] = await db.select().from(whiteLabelSettingsTable).where(eq(whiteLabelSettingsTable.subAccountId, account.id));
  res.json({ ...account, whiteLabel: wl || null });
});

router.patch("/sub-accounts/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [updated] = await db.update(subAccountsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(subAccountsTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.delete("/sub-accounts/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(subAccountsTable).where(eq(subAccountsTable.id, id));
  res.status(204).send();
});

router.get("/sub-accounts/:id/white-label", async (req, res) => {
  const id = parseInt(req.params.id);
  const [wl] = await db.select().from(whiteLabelSettingsTable).where(eq(whiteLabelSettingsTable.subAccountId, id));
  res.json(wl || { subAccountId: id, brandName: "VictorySync", primaryColor: "#f97316", accentColor: "#1e293b", hidePoweredBy: false });
});

router.put("/sub-accounts/:id/white-label", async (req, res) => {
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(whiteLabelSettingsTable).where(eq(whiteLabelSettingsTable.subAccountId, id));
  if (existing) {
    const [updated] = await db.update(whiteLabelSettingsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(whiteLabelSettingsTable.subAccountId, id)).returning();
    return res.json(updated);
  }
  const [created] = await db.insert(whiteLabelSettingsTable).values({ ...req.body, subAccountId: id }).returning();
  res.status(201).json(created);
});

router.get("/sub-accounts-stats", async (_req, res) => {
  const accounts = await db.select().from(subAccountsTable);
  const total = accounts.length;
  const active = accounts.filter(a => a.status === "active").length;
  const atRisk = accounts.filter(a => a.healthScore < 50).length;
  const plans = accounts.reduce((acc, a) => { acc[a.plan] = (acc[a.plan] || 0) + 1; return acc; }, {} as Record<string, number>);
  res.json({ total, active, atRisk, inactive: total - active, plans });
});

export default router;
