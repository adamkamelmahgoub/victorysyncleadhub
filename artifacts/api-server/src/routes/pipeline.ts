import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { pipelineStagesTable, leadsTable, insertPipelineStageSchema } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/pipeline/stages", async (_req, res) => {
  const stages = await db
    .select()
    .from(pipelineStagesTable)
    .orderBy(asc(pipelineStagesTable.position));
  res.json(stages);
});

router.post("/pipeline/stages", async (req, res) => {
  const parsed = insertPipelineStageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [stage] = await db.insert(pipelineStagesTable).values(parsed.data).returning();
  res.status(201).json(stage);
});

router.put("/pipeline/stages/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = insertPipelineStageSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [stage] = await db
    .update(pipelineStagesTable)
    .set(parsed.data)
    .where(eq(pipelineStagesTable.id, id))
    .returning();
  if (!stage) return res.status(404).json({ error: "Not found" });
  res.json(stage);
});

router.delete("/pipeline/stages/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.update(leadsTable).set({ pipelineStageId: null }).where(eq(leadsTable.pipelineStageId, id));
  await db.delete(pipelineStagesTable).where(eq(pipelineStagesTable.id, id));
  res.status(204).end();
});

router.get("/pipeline/leads", async (_req, res) => {
  const stages = await db
    .select()
    .from(pipelineStagesTable)
    .orderBy(asc(pipelineStagesTable.position));
  const leads = await db.select().from(leadsTable);
  const result = stages.map((stage) => ({
    ...stage,
    leads: leads.filter((l) => l.pipelineStageId === stage.id),
  }));
  const unassigned = leads.filter((l) => !l.pipelineStageId);
  res.json({ stages: result, unassigned });
});

router.patch("/pipeline/leads/:id/stage", async (req, res) => {
  const id = Number(req.params.id);
  const { stageId } = req.body as { stageId: number | null };
  const [lead] = await db
    .update(leadsTable)
    .set({ pipelineStageId: stageId ?? null })
    .where(eq(leadsTable.id, id))
    .returning();
  if (!lead) return res.status(404).json({ error: "Not found" });
  res.json(lead);
});

export default router;
