import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, contactTasksTable, leadsTable } from "@workspace/db";
import { z } from "zod";
import { leadAccessCondition } from "../lib/client-scope.js";

const router: IRouter = Router();

router.get("/leads/:leadId/tasks", async (req, res): Promise<void> => {
  const leadId = parseInt(req.params.leadId ?? "");
  if (isNaN(leadId)) { res.status(400).json({ error: "Invalid leadId" }); return; }
  const [lead] = await db.select({ id: leadsTable.id }).from(leadsTable).where(leadAccessCondition(leadId, res)).limit(1);
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  const tasks = await db.select().from(contactTasksTable).where(eq(contactTasksTable.leadId, leadId)).orderBy(desc(contactTasksTable.createdAt));
  res.json(tasks.map((t) => ({
    ...t,
    dueDate: t.dueDate?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
  })));
});

router.post("/leads/:leadId/tasks", async (req, res): Promise<void> => {
  const leadId = parseInt(req.params.leadId ?? "");
  if (isNaN(leadId)) { res.status(400).json({ error: "Invalid leadId" }); return; }
  const [lead] = await db.select({ id: leadsTable.id }).from(leadsTable).where(leadAccessCondition(leadId, res)).limit(1);
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  const body = z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    dueDate: z.string().datetime().optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [task] = await db.insert(contactTasksTable).values({
    leadId,
    title: body.data.title,
    description: body.data.description,
    dueDate: body.data.dueDate ? new Date(body.data.dueDate) : undefined,
    priority: body.data.priority ?? "medium",
  }).returning();
  res.status(201).json({ ...task!, dueDate: task!.dueDate?.toISOString() ?? null, completedAt: null, createdAt: task!.createdAt.toISOString() });
});

router.patch("/leads/:leadId/tasks/:taskId", async (req, res): Promise<void> => {
  const leadId = parseInt(req.params.leadId ?? "");
  const taskId = parseInt(req.params.taskId ?? "");
  if (isNaN(leadId) || isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [lead] = await db.select({ id: leadsTable.id }).from(leadsTable).where(leadAccessCondition(leadId, res)).limit(1);
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  const body = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    isCompleted: z.boolean().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const updates: Record<string, unknown> = { ...body.data };
  if (body.data.dueDate !== undefined) updates.dueDate = body.data.dueDate ? new Date(body.data.dueDate) : null;
  if (body.data.isCompleted === true) updates.completedAt = new Date();
  if (body.data.isCompleted === false) updates.completedAt = null;
  const [task] = await db.update(contactTasksTable).set(updates).where(and(eq(contactTasksTable.id, taskId), eq(contactTasksTable.leadId, leadId))).returning();
  if (!task) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...task, dueDate: task.dueDate?.toISOString() ?? null, completedAt: task.completedAt?.toISOString() ?? null, createdAt: task.createdAt.toISOString() });
});

router.delete("/leads/:leadId/tasks/:taskId", async (req, res): Promise<void> => {
  const leadId = parseInt(req.params.leadId ?? "");
  const taskId = parseInt(req.params.taskId ?? "");
  if (isNaN(leadId) || isNaN(taskId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [lead] = await db.select({ id: leadsTable.id }).from(leadsTable).where(leadAccessCondition(leadId, res)).limit(1);
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  await db.delete(contactTasksTable).where(and(eq(contactTasksTable.id, taskId), eq(contactTasksTable.leadId, leadId)));
  res.sendStatus(204);
});

export default router;
