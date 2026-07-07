import { Router, type IRouter } from "express";
import { eq, ilike, and, gte, lte, or, desc, sql } from "drizzle-orm";
import { db, leadsTable, campaignsTable, activitiesTable } from "@workspace/db";
import {
  ListLeadsQueryParams,
  CreateLeadBody,
  GetLeadParams,
  UpdateLeadParams,
  UpdateLeadBody,
  DeleteLeadParams,
  UpdateLeadScoreParams,
  UpdateLeadScoreBody,
  ImportLeadsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/leads", async (req, res): Promise<void> => {
  const parsed = ListLeadsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, campaignId, search, scoreMin, scoreMax, source, page = 1, limit = 50 } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(leadsTable.status, status));
  if (campaignId) conditions.push(eq(leadsTable.campaignId, campaignId));
  if (source) conditions.push(eq(leadsTable.source, source));
  if (scoreMin !== undefined) conditions.push(gte(leadsTable.score, scoreMin));
  if (scoreMax !== undefined) conditions.push(lte(leadsTable.score, scoreMax));
  if (search) {
    conditions.push(
      or(
        ilike(leadsTable.firstName, `%${search}%`),
        ilike(leadsTable.lastName, `%${search}%`),
        ilike(leadsTable.email, `%${search}%`),
        ilike(leadsTable.company, `%${search}%`)
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [leads, countResult] = await Promise.all([
    db
      .select({
        id: leadsTable.id,
        firstName: leadsTable.firstName,
        lastName: leadsTable.lastName,
        email: leadsTable.email,
        phone: leadsTable.phone,
        company: leadsTable.company,
        title: leadsTable.title,
        source: leadsTable.source,
        status: leadsTable.status,
        score: leadsTable.score,
        campaignId: leadsTable.campaignId,
        formId: leadsTable.formId,
        tags: leadsTable.tags,
        customFields: leadsTable.customFields,
        createdAt: leadsTable.createdAt,
        updatedAt: leadsTable.updatedAt,
        campaignName: campaignsTable.name,
      })
      .from(leadsTable)
      .leftJoin(campaignsTable, eq(leadsTable.campaignId, campaignsTable.id))
      .where(where)
      .orderBy(desc(leadsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leadsTable)
      .where(where),
  ]);

  res.json({
    leads: leads.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    })),
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  });
});

router.post("/leads", async (req, res): Promise<void> => {
  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [lead] = await db.insert(leadsTable).values(parsed.data).returning();

  // Log activity
  await db.insert(activitiesTable).values({
    leadId: lead.id,
    type: "created",
    description: "Lead created manually",
  });

  const campaign = lead.campaignId
    ? await db.select().from(campaignsTable).where(eq(campaignsTable.id, lead.campaignId)).limit(1)
    : [];

  res.status(201).json({
    ...lead,
    campaignName: campaign[0]?.name ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  });
});

router.post("/leads/import", async (req, res): Promise<void> => {
  const parsed = ImportLeadsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { leads, campaignId } = parsed.data;
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const lead of leads) {
    try {
      const [inserted] = await db
        .insert(leadsTable)
        .values({ ...lead, campaignId: campaignId ?? lead.campaignId })
        .returning();
      await db.insert(activitiesTable).values({
        leadId: inserted.id,
        type: "imported",
        description: "Lead imported via CSV",
      });
      imported++;
    } catch (err) {
      failed++;
      errors.push(`Failed to import ${lead.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  res.json({ imported, failed, total: leads.length, errors });
});

router.get("/leads/:id", async (req, res): Promise<void> => {
  const params = GetLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [lead] = await db
    .select({
      id: leadsTable.id,
      firstName: leadsTable.firstName,
      lastName: leadsTable.lastName,
      email: leadsTable.email,
      phone: leadsTable.phone,
      company: leadsTable.company,
      title: leadsTable.title,
      source: leadsTable.source,
      status: leadsTable.status,
      score: leadsTable.score,
      campaignId: leadsTable.campaignId,
      formId: leadsTable.formId,
      tags: leadsTable.tags,
      customFields: leadsTable.customFields,
      createdAt: leadsTable.createdAt,
      updatedAt: leadsTable.updatedAt,
      campaignName: campaignsTable.name,
    })
    .from(leadsTable)
    .leftJoin(campaignsTable, eq(leadsTable.campaignId, campaignsTable.id))
    .where(eq(leadsTable.id, params.data.id));

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  res.json({
    ...lead,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  });
});

router.patch("/leads/:id", async (req, res): Promise<void> => {
  const params = UpdateLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const prevLead = await db.select().from(leadsTable).where(eq(leadsTable.id, params.data.id)).limit(1);
  if (!prevLead[0]) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const [lead] = await db
    .update(leadsTable)
    .set(parsed.data)
    .where(eq(leadsTable.id, params.data.id))
    .returning();

  // Log status change activity
  if (parsed.data.status && parsed.data.status !== prevLead[0].status) {
    await db.insert(activitiesTable).values({
      leadId: lead.id,
      type: "status_changed",
      description: `Status changed from "${prevLead[0].status}" to "${parsed.data.status}"`,
    });
  }

  const campaign = lead.campaignId
    ? await db.select().from(campaignsTable).where(eq(campaignsTable.id, lead.campaignId)).limit(1)
    : [];

  res.json({
    ...lead,
    campaignName: campaign[0]?.name ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  });
});

router.delete("/leads/:id", async (req, res): Promise<void> => {
  const params = DeleteLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [lead] = await db
    .delete(leadsTable)
    .where(eq(leadsTable.id, params.data.id))
    .returning();

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  res.sendStatus(204);
});

router.patch("/leads/:id/score", async (req, res): Promise<void> => {
  const params = UpdateLeadScoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateLeadScoreBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [lead] = await db
    .update(leadsTable)
    .set({ score: body.data.score })
    .where(eq(leadsTable.id, params.data.id))
    .returning();

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  await db.insert(activitiesTable).values({
    leadId: lead.id,
    type: "score_updated",
    description: `Lead score updated to ${body.data.score}`,
  });

  const campaign = lead.campaignId
    ? await db.select().from(campaignsTable).where(eq(campaignsTable.id, lead.campaignId)).limit(1)
    : [];

  res.json({
    ...lead,
    campaignName: campaign[0]?.name ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  });
});

export default router;
