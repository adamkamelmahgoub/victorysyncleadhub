import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, emailTemplatesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

router.get("/email-templates", async (_req, res): Promise<void> => {
  const templates = await db.select().from(emailTemplatesTable).orderBy(desc(emailTemplatesTable.createdAt));
  res.json(templates.map((template) => ({
    ...template,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  })));
});

router.post("/email-templates", async (req, res): Promise<void> => {
  const body = z.object({
    name: z.string().min(1),
    subject: z.string().min(1),
    body: z.string().min(1),
    previewText: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [template] = await db.insert(emailTemplatesTable).values(body.data).returning();
  res.status(201).json({ ...template!, createdAt: template!.createdAt.toISOString(), updatedAt: template!.updatedAt.toISOString() });
});

router.patch("/email-templates/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    name: z.string().optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    previewText: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [template] = await db.update(emailTemplatesTable).set({ ...body.data, updatedAt: new Date() }).where(eq(emailTemplatesTable.id, id)).returning();
  if (!template) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...template, createdAt: template.createdAt.toISOString(), updatedAt: template.updatedAt.toISOString() });
});

router.delete("/email-templates/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(emailTemplatesTable).where(eq(emailTemplatesTable.id, id));
  res.sendStatus(204);
});

export default router;
