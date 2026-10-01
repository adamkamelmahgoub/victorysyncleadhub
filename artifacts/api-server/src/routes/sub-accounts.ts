import { Router } from "express";
import { db } from "@workspace/db";
import { subAccountsTable, whiteLabelSettingsTable, insertSubAccountSchema, insertWhiteLabelSchema, leadsTable, notesTable } from "@workspace/db/schema";
import { eq, desc, ilike, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requirePlatformManager } from "../lib/client-scope.js";

const router = Router();

router.get("/sub-accounts", async (req, res) => {
  if (!requirePlatformManager(res)) return;
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
  if (!requirePlatformManager(res)) return;
  const parsed = insertSubAccountSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const slug = parsed.data.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  const [account] = await db.insert(subAccountsTable).values({ ...parsed.data, slug }).returning();
  await db.insert(whiteLabelSettingsTable).values({ subAccountId: account.id, brandName: account.name }).onConflictDoNothing();
  res.status(201).json(account);
});

router.get("/sub-accounts/:id", async (req, res) => {
  if (!requirePlatformManager(res)) return;
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid client account id" }); return; }
  const [account] = await db.select().from(subAccountsTable).where(eq(subAccountsTable.id, id.data));
  if (!account) { res.status(404).json({ error: "Not found" }); return; }
  const [wl] = await db.select().from(whiteLabelSettingsTable).where(eq(whiteLabelSettingsTable.subAccountId, account.id));
  res.json({ ...account, whiteLabel: wl || null });
});

router.patch("/sub-accounts/:id", async (req, res) => {
  if (!requirePlatformManager(res)) return;
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid client account id" }); return; }
  const body = insertSubAccountSchema.partial().omit({ name: true }).extend({
    name: z.string().min(1).optional(),
    status: z.enum(["active", "suspended", "cancelled"]).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [updated] = await db.update(subAccountsTable).set({ ...body.data, updatedAt: new Date() }).where(eq(subAccountsTable.id, id.data)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/sub-accounts/:id", async (req, res) => {
  if (!requirePlatformManager(res)) return;
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid client account id" }); return; }
  await db.delete(subAccountsTable).where(eq(subAccountsTable.id, id.data));
  res.status(204).send();
});

router.get("/sub-accounts/:id/white-label", async (req, res) => {
  if (!requirePlatformManager(res)) return;
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid client account id" }); return; }
  const [wl] = await db.select().from(whiteLabelSettingsTable).where(eq(whiteLabelSettingsTable.subAccountId, id.data));
  res.json(wl || { subAccountId: id.data, brandName: "VictorySync", primaryColor: "#f97316", accentColor: "#1e293b", hidePoweredBy: false });
});

router.put("/sub-accounts/:id/white-label", async (req, res) => {
  if (!requirePlatformManager(res)) return;
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid client account id" }); return; }
  const parsed = insertWhiteLabelSchema.omit({ subAccountId: true }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [existing] = await db.select().from(whiteLabelSettingsTable).where(eq(whiteLabelSettingsTable.subAccountId, id.data));
  if (existing) {
    const [updated] = await db.update(whiteLabelSettingsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(whiteLabelSettingsTable.subAccountId, id.data)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(whiteLabelSettingsTable).values({ ...parsed.data, subAccountId: id.data }).returning();
  res.status(201).json(created);
});

router.get("/sub-accounts/:id/workspace-stats", async (req, res) => {
  if (!requirePlatformManager(res)) return;
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: "Invalid client account id" }); return; }

  const [statusRows, dispositionRows, noteRows, latestRows] = await Promise.all([
    db.select({ name: leadsTable.status, count: sql<number>`count(*)::int` })
      .from(leadsTable)
      .where(eq(leadsTable.clientAccountId, id.data))
      .groupBy(leadsTable.status),
    db.select({ name: leadsTable.disposition, count: sql<number>`count(*)::int` })
      .from(leadsTable)
      .where(eq(leadsTable.clientAccountId, id.data))
      .groupBy(leadsTable.disposition),
    db.select({ count: sql<number>`count(*)::int` })
      .from(notesTable)
      .innerJoin(leadsTable, eq(notesTable.leadId, leadsTable.id))
      .where(eq(leadsTable.clientAccountId, id.data)),
    db.select({ updatedAt: leadsTable.updatedAt })
      .from(leadsTable)
      .where(eq(leadsTable.clientAccountId, id.data))
      .orderBy(desc(leadsTable.updatedAt))
      .limit(1),
  ]);

  const statuses = Object.fromEntries(statusRows.map((row) => [row.name, row.count]));
  const dispositions = Object.fromEntries(dispositionRows.filter((row) => row.name).map((row) => [row.name!, row.count]));
  const total = statusRows.reduce((sum, row) => sum + row.count, 0);
  res.json({ total, statuses, dispositions, notes: noteRows[0]?.count ?? 0, lastUpdatedAt: latestRows[0]?.updatedAt?.toISOString() ?? null });
});

router.get("/sub-accounts-stats", async (_req, res) => {
  if (!requirePlatformManager(res)) return;
  const accounts = await db.select().from(subAccountsTable);
  const total = accounts.length;
  const active = accounts.filter(a => a.status === "active").length;
  const atRisk = accounts.filter(a => a.healthScore < 50).length;
  const plans = accounts.reduce((acc, a) => { acc[a.plan] = (acc[a.plan] || 0) + 1; return acc; }, {} as Record<string, number>);
  res.json({ total, active, atRisk, inactive: total - active, plans });
});

export default router;
