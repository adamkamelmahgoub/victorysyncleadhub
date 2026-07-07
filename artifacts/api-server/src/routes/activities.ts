import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, activitiesTable, leadsTable } from "@workspace/db";
import {
  ListLeadActivitiesParams,
  CreateLeadActivityParams,
  CreateLeadActivityBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/leads/:id/activities", async (req, res): Promise<void> => {
  const params = ListLeadActivitiesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const activities = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.leadId, params.data.id))
    .orderBy(desc(activitiesTable.createdAt));

  res.json(
    activities.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    }))
  );
});

router.post("/leads/:id/activities", async (req, res): Promise<void> => {
  const params = CreateLeadActivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = CreateLeadActivityBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, params.data.id))
    .limit(1);

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const [activity] = await db
    .insert(activitiesTable)
    .values({ leadId: params.data.id, ...body.data })
    .returning();

  res.status(201).json({
    ...activity,
    createdAt: activity.createdAt.toISOString(),
  });
});

export default router;
