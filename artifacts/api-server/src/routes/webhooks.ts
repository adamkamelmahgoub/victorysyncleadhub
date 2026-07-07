import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, webhooksTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

router.get("/webhooks", async (_req, res): Promise<void> => {
  const hooks = await db.select().from(webhooksTable).orderBy(desc(webhooksTable.createdAt));
  res.json(hooks.map((h) => ({
    ...h,
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
    lastTriggeredAt: h.lastTriggeredAt?.toISOString() ?? null,
  })));
});

router.post("/webhooks", async (req, res): Promise<void> => {
  const body = z.object({
    name: z.string().min(1),
    url: z.string().url(),
    events: z.array(z.string()),
    secret: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [hook] = await db.insert(webhooksTable).values(body.data).returning();
  res.status(201).json({ ...hook!, createdAt: hook!.createdAt.toISOString(), updatedAt: hook!.updatedAt.toISOString() });
});

router.patch("/webhooks/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    name: z.string().optional(),
    url: z.string().url().optional(),
    events: z.array(z.string()).optional(),
    secret: z.string().optional(),
    isActive: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [hook] = await db.update(webhooksTable).set({ ...body.data, updatedAt: new Date() }).where(eq(webhooksTable.id, id)).returning();
  if (!hook) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...hook, createdAt: hook.createdAt.toISOString(), updatedAt: hook.updatedAt.toISOString() });
});

router.delete("/webhooks/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(webhooksTable).where(eq(webhooksTable.id, id));
  res.sendStatus(204);
});

// Test fire a webhook
router.post("/webhooks/:id/test", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [hook] = await db.select().from(webhooksTable).where(eq(webhooksTable.id, id));
  if (!hook) { res.status(404).json({ error: "Not found" }); return; }

  try {
    const start = Date.now();
    const r = await fetch(hook.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(hook.secret ? { "X-Webhook-Secret": hook.secret } : {}) },
      body: JSON.stringify({ event: "test", source: "victorysync", timestamp: new Date().toISOString(), data: { contact: { firstName: "Test", lastName: "Contact", email: "test@example.com" } } }),
    });
    const ms = Date.now() - start;
    if (r.ok) {
      await db.update(webhooksTable).set({ lastTriggeredAt: new Date(), successCount: hook.successCount + 1, updatedAt: new Date() }).where(eq(webhooksTable.id, id));
      res.json({ success: true, status: r.status, ms });
    } else {
      await db.update(webhooksTable).set({ failureCount: hook.failureCount + 1, updatedAt: new Date() }).where(eq(webhooksTable.id, id));
      res.status(400).json({ success: false, status: r.status, ms });
    }
  } catch (e) {
    await db.update(webhooksTable).set({ failureCount: hook.failureCount + 1, updatedAt: new Date() }).where(eq(webhooksTable.id, id));
    res.status(500).json({ success: false, error: String(e) });
  }
});

export default router;
