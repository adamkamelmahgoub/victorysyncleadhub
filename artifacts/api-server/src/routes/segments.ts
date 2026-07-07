import { Router, type IRouter } from "express";
import { eq, desc, and, gte, lte, ilike } from "drizzle-orm";
import { db, segmentsTable, leadsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const FiltersSchema = z.object({
  status: z.string().optional(),
  source: z.string().optional(),
  scoreMin: z.number().optional(),
  scoreMax: z.number().optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
});

router.get("/segments", async (_req, res): Promise<void> => {
  const segments = await db.select().from(segmentsTable).orderBy(desc(segmentsTable.createdAt));
  res.json(segments.map((s) => ({ ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() })));
});

router.post("/segments", async (req, res): Promise<void> => {
  const body = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    filters: FiltersSchema,
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  // Count matching contacts
  const { filters } = body.data;
  const conditions = [];
  if (filters.status) conditions.push(eq(leadsTable.status, filters.status));
  if (filters.source) conditions.push(eq(leadsTable.source, filters.source));
  if (filters.scoreMin !== undefined) conditions.push(gte(leadsTable.score, filters.scoreMin));
  if (filters.scoreMax !== undefined) conditions.push(lte(leadsTable.score, filters.scoreMax));
  if (filters.search) conditions.push(ilike(leadsTable.firstName, `%${filters.search}%`));

  const contacts = await db.select({ id: leadsTable.id }).from(leadsTable).where(conditions.length ? and(...conditions) : undefined);
  const [segment] = await db.insert(segmentsTable).values({ ...body.data, contactCount: contacts.length }).returning();
  res.status(201).json({ ...segment, createdAt: segment.createdAt.toISOString(), updatedAt: segment.updatedAt.toISOString() });
});

router.patch("/segments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({ name: z.string().optional(), description: z.string().optional(), filters: FiltersSchema.optional() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [segment] = await db.update(segmentsTable).set({ ...body.data, updatedAt: new Date() }).where(eq(segmentsTable.id, id)).returning();
  if (!segment) { res.status(404).json({ error: "Segment not found" }); return; }
  res.json({ ...segment, createdAt: segment.createdAt.toISOString(), updatedAt: segment.updatedAt.toISOString() });
});

router.delete("/segments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [segment] = await db.delete(segmentsTable).where(eq(segmentsTable.id, id)).returning();
  if (!segment) { res.status(404).json({ error: "Segment not found" }); return; }
  res.sendStatus(204);
});

export default router;
