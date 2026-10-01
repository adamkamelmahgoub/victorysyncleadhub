import { Router, type IRouter } from "express";
import { eq, ilike, and, gte, lte, or, desc, sql, inArray } from "drizzle-orm";
import { db, leadsTable, campaignsTable, activitiesTable } from "@workspace/db";
import { z } from "zod";
import { DISPOSITIONS } from '../../../../lib/outreach.js';
import { actorLabel, currentClientAccountId, leadAccessCondition, requestedClientAccountId } from "../lib/client-scope.js";
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
const outreachLeadInput = CreateLeadBody.extend({disposition:z.enum(DISPOSITIONS).optional()});

function clientScope(req: Parameters<typeof requestedClientAccountId>[0], res: Parameters<typeof requestedClientAccountId>[1]) {
  const value = requestedClientAccountId(req, res);
  if (!value) return null;
  const parsed = z.string().uuid().safeParse(value);
  if (parsed.success) return parsed.data;
  res.status(400).json({ error: "Invalid client account id" });
  return undefined;
}

router.get("/leads", async (req, res): Promise<void> => {
  const parsed = ListLeadsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { status, campaignId, search, scoreMin, scoreMax, source, page = 1, limit = 50 } = parsed.data;
  const disposition = typeof req.query.disposition === "string" ? req.query.disposition : undefined;
  if (disposition && !DISPOSITIONS.includes(disposition as typeof DISPOSITIONS[number])) {
    res.status(400).json({ error: "Invalid disposition" });
    return;
  }
  const offset = (page - 1) * limit;

  const conditions = [];
  const scopedClientId = clientScope(req, res);
  if (scopedClientId === undefined) return;
  if (scopedClientId) conditions.push(eq(leadsTable.clientAccountId, scopedClientId));
  if (status) conditions.push(eq(leadsTable.status, status));
  if (disposition) conditions.push(eq(leadsTable.disposition, disposition as typeof DISPOSITIONS[number]));
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
        clientAccountId: leadsTable.clientAccountId,
        firstName: leadsTable.firstName,
        lastName: leadsTable.lastName,
        email: leadsTable.email,
        phone: leadsTable.phone,
        company: leadsTable.company,
        title: leadsTable.title,
        source: leadsTable.source,
        status: leadsTable.status,
        disposition: leadsTable.disposition,
        contactAttempts: leadsTable.contactAttempts,
        nextActionAt: leadsTable.nextActionAt,
        firstAttemptAt: leadsTable.firstAttemptAt,
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
      .orderBy(desc(leadsTable.createdAt),desc(leadsTable.id))
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
  const parsed = outreachLeadInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const scopedClientId = clientScope(req, res);
  if (scopedClientId === undefined) return;
  const [lead] = await db.insert(leadsTable).values({ ...parsed.data, clientAccountId: scopedClientId }).returning();

  // Log activity
  await db.insert(activitiesTable).values({
    leadId: lead.id,
    type: "created",
    description: `Lead created manually by ${actorLabel(res)}`,
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
  const parsed = ImportLeadsBody.extend({leads:z.array(outreachLeadInput)}).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { leads, campaignId } = parsed.data;
  const scopedClientId = clientScope(req, res);
  if (scopedClientId === undefined) return;
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const lead of leads) {
    try {
      const [inserted] = await db
        .insert(leadsTable)
        .values({ ...lead, firstName: lead.firstName ?? "", lastName: lead.lastName ?? "", email: lead.email ?? "", campaignId: campaignId ?? lead.campaignId, clientAccountId: scopedClientId })
        .returning();
      await db.insert(activitiesTable).values({
        leadId: inserted.id,
        type: "imported",
        description: `Lead imported via CSV by ${actorLabel(res)}`,
      });
      imported++;
    } catch (err) {
      failed++;
      errors.push(`Failed to import ${lead.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  res.json({ imported, failed, total: leads.length, errors });
});

router.delete("/leads", async (req, res): Promise<void> => {
  const parsed = z.object({ ids: z.array(z.number().int().positive()).min(1).max(5000) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const scope = currentClientAccountId(res);
  const deleted = await db.delete(leadsTable).where(and(inArray(leadsTable.id, parsed.data.ids), scope ? eq(leadsTable.clientAccountId, scope) : undefined)).returning({ id: leadsTable.id });
  res.json({ deleted: deleted.length });
});

router.get("/dispositions", async (_req, res): Promise<void> => {
  res.json(DISPOSITIONS.map((name,id)=>({id:id+1,name,color:'#f97316'})));
});

router.post("/dispositions", async (req, res): Promise<void> => {
  res.status(405).json({error:'Outreach dispositions are fixed'});
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
      clientAccountId: leadsTable.clientAccountId,
      firstName: leadsTable.firstName,
      lastName: leadsTable.lastName,
      email: leadsTable.email,
      phone: leadsTable.phone,
      company: leadsTable.company,
      title: leadsTable.title,
      source: leadsTable.source,
      status: leadsTable.status,
      disposition: leadsTable.disposition,
      contactAttempts: leadsTable.contactAttempts,
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
    .where(leadAccessCondition(params.data.id, res));

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
  if (req.body?.disposition !== undefined || req.body?.contactAttempts !== undefined) {
    res.status(409).json({error:'Use atomic call logging to change disposition or attempts.'}); return;
  }
  const params = UpdateLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateLeadBody.extend({disposition:z.enum(DISPOSITIONS).optional()}).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const prevLead = await db.select().from(leadsTable).where(leadAccessCondition(params.data.id, res)).limit(1);
  if (!prevLead[0]) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const [lead] = await db
    .update(leadsTable)
    .set(parsed.data)
    .where(leadAccessCondition(params.data.id, res))
    .returning();

  // Log status change activity
  if (parsed.data.status && parsed.data.status !== prevLead[0].status) {
    await db.insert(activitiesTable).values({
      leadId: lead.id,
      type: "status_changed",
      description: `Status changed from "${prevLead[0].status}" to "${parsed.data.status}" by ${actorLabel(res)}`,
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
    .where(leadAccessCondition(params.data.id, res))
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
    .where(leadAccessCondition(params.data.id, res))
    .returning();

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  await db.insert(activitiesTable).values({
    leadId: lead.id,
    type: "score_updated",
    description: `Lead score updated to ${body.data.score} by ${actorLabel(res)}`,
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
