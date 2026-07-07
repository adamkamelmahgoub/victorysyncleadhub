import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, integrationsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

router.get("/integrations", async (req, res): Promise<void> => {
  const rows = await db.select().from(integrationsTable).orderBy(desc(integrationsTable.createdAt));
  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })));
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
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
    return;
  }

  const [row] = await db.insert(integrationsTable).values(body.data).returning();
  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
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
  res.json({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

router.delete("/integrations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.delete(integrationsTable).where(eq(integrationsTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Integration not found" }); return; }
  res.sendStatus(204);
});

export default router;
