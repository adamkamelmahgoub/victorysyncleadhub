import { Router, type IRouter } from "express";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { db, campaignsTable, leadsTable } from "@workspace/db";
import {
  CreateCampaignBody,
  GetCampaignParams,
  UpdateCampaignParams,
  UpdateCampaignBody,
  DeleteCampaignParams,
  GetCampaignLeadsParams,
} from "@workspace/api-zod";
import { z } from "zod/v4";

const router: IRouter = Router();

const campaignSelect = {
  id: campaignsTable.id,
  name: campaignsTable.name,
  description: campaignsTable.description,
  status: campaignsTable.status,
  sourceType: campaignsTable.sourceType,
  subject: campaignsTable.subject,
  fromName: campaignsTable.fromName,
  fromEmail: campaignsTable.fromEmail,
  body: campaignsTable.body,
  sendRatePerHour: campaignsTable.sendRatePerHour,
  dailyLimit: campaignsTable.dailyLimit,
  sendWindowStart: campaignsTable.sendWindowStart,
  sendWindowEnd: campaignsTable.sendWindowEnd,
  scheduledAt: campaignsTable.scheduledAt,
  launchedAt: campaignsTable.launchedAt,
  createdAt: campaignsTable.createdAt,
  updatedAt: campaignsTable.updatedAt,
  leadCount: sql<number>`(SELECT COUNT(*)::int FROM leads WHERE campaign_id = campaigns.id)`,
  convertedCount: sql<number>`(SELECT COUNT(*)::int FROM leads WHERE campaign_id = campaigns.id AND status = 'converted')`,
};

function serializeCampaign(c: typeof campaignsTable.$inferSelect & { leadCount?: number; convertedCount?: number }) {
  return {
    ...c,
    scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
    launchedAt: c.launchedAt ? c.launchedAt.toISOString() : null,
    createdAt: (c.createdAt as Date).toISOString(),
    updatedAt: (c.updatedAt as Date).toISOString(),
  };
}

router.get("/campaigns", async (_req, res): Promise<void> => {
  const campaigns = await db
    .select(campaignSelect)
    .from(campaignsTable)
    .orderBy(desc(campaignsTable.createdAt));

  res.json(campaigns.map(serializeCampaign));
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [campaign] = await db.insert(campaignsTable).values(parsed.data).returning();

  res.status(201).json(serializeCampaign({ ...campaign, leadCount: 0, convertedCount: 0 }));
});

router.get("/campaigns/:id", async (req, res): Promise<void> => {
  const params = GetCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [campaign] = await db
    .select(campaignSelect)
    .from(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id));

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  res.json(serializeCampaign(campaign));
});

router.patch("/campaigns/:id", async (req, res): Promise<void> => {
  const params = UpdateCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [campaign] = await db
    .update(campaignsTable)
    .set(parsed.data)
    .where(eq(campaignsTable.id, params.data.id))
    .returning();

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const [counts] = await db
    .select({
      leadCount: sql<number>`COUNT(*)::int`,
      convertedCount: sql<number>`SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END)::int`,
    })
    .from(leadsTable)
    .where(eq(leadsTable.campaignId, campaign.id));

  res.json(serializeCampaign({ ...campaign, leadCount: counts?.leadCount ?? 0, convertedCount: counts?.convertedCount ?? 0 }));
});

router.delete("/campaigns/:id", async (req, res): Promise<void> => {
  const params = DeleteCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [campaign] = await db
    .delete(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id))
    .returning();

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/campaigns/:id/leads", async (req, res): Promise<void> => {
  const params = GetCampaignLeadsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id))
    .limit(1);

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  const leads = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.campaignId, params.data.id))
    .orderBy(desc(leadsTable.createdAt));

  res.json({
    leads: leads.map((l) => ({
      ...l,
      campaignName: campaign.name,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    })),
    total: leads.length,
    page: 1,
    limit: leads.length,
  });
});

// POST /campaigns/:id/leads — assign lead IDs to this campaign
router.post("/campaigns/:id/leads", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const body = z.object({ leadIds: z.array(z.number()) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  if (body.data.leadIds.length > 0) {
    await db
      .update(leadsTable)
      .set({ campaignId: id })
      .where(inArray(leadsTable.id, body.data.leadIds));
  }

  const count = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(leadsTable)
    .where(eq(leadsTable.campaignId, id));

  res.json({ assigned: body.data.leadIds.length, total: count[0]?.n ?? 0 });
});

// POST /campaigns/:id/launch — mark campaign as active with launchedAt timestamp
router.post("/campaigns/:id/launch", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const [campaign] = await db
    .update(campaignsTable)
    .set({ status: "active", launchedAt: new Date() })
    .where(eq(campaignsTable.id, id))
    .returning();

  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  res.json(serializeCampaign({ ...campaign, leadCount: 0, convertedCount: 0 }));
});

export default router;
