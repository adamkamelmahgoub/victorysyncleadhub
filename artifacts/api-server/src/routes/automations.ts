import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, automationsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const ActionSchema = z.object({
  type: z.string(),
  config: z.record(z.string(), z.string()).default({}),
});

const AutomationBody = z.object({
  name: z.string().min(1),
  triggerType: z.string().min(1),
  triggerConfig: z.record(z.string(), z.unknown()).default({}),
  actions: z.array(ActionSchema).default([]),
  isActive: z.boolean().default(false),
});

router.get("/automations", async (req, res): Promise<void> => {
  const rows = await db.select().from(automationsTable).orderBy(desc(automationsTable.createdAt));
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })));
});

router.post("/automations", async (req, res): Promise<void> => {
  const body = AutomationBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [row] = await db.insert(automationsTable).values(body.data).returning();
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

router.get("/automations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(automationsTable).where(eq(automationsTable.id, id));
  if (!row) { res.status(404).json({ error: "Automation not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

router.patch("/automations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = z.object({
    name: z.string().min(1).optional(),
    triggerType: z.string().optional(),
    triggerConfig: z.record(z.string(), z.unknown()).optional(),
    actions: z.array(ActionSchema).optional(),
    isActive: z.boolean().optional(),
    enrolledCount: z.number().int().optional(),
    completedCount: z.number().int().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [row] = await db.update(automationsTable).set({ ...body.data, updatedAt: new Date() }).where(eq(automationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Automation not found" }); return; }
  res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

router.delete("/automations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.delete(automationsTable).where(eq(automationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Automation not found" }); return; }
  res.sendStatus(204);
});

export default router;
