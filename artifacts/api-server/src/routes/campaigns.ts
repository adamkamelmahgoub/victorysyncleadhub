import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, campaignsTable, leadsTable } from "@workspace/db";
import {
  CreateCampaignBody,
  GetCampaignParams,
  UpdateCampaignParams,
  UpdateCampaignBody,
  DeleteCampaignParams,
  GetCampaignLeadsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/campaigns", async (_req, res): Promise<void> => {
  const campaigns = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      description: campaignsTable.description,
      status: campaignsTable.status,
      sourceType: campaignsTable.sourceType,
      createdAt: campaignsTable.createdAt,
      updatedAt: campaignsTable.updatedAt,
      leadCount: sql<number>`(SELECT COUNT(*)::int FROM leads WHERE campaign_id = campaigns.id)`,
      convertedCount: sql<number>`(SELECT COUNT(*)::int FROM leads WHERE campaign_id = campaigns.id AND status = 'converted')`,
    })
    .from(campaignsTable)
    .orderBy(desc(campaignsTable.createdAt));

  res.json(
    campaigns.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }))
  );
});

router.post("/campaigns", async (req, res): Promise<void> => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [campaign] = await db.insert(campaignsTable).values(parsed.data).returning();

  res.status(201).json({
    ...campaign,
    leadCount: 0,
    convertedCount: 0,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  });
});

router.get("/campaigns/:id", async (req, res): Promise<void> => {
  const params = GetCampaignParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [campaign] = await db
    .select({
      id: campaignsTable.id,
      name: campaignsTable.name,
      description: campaignsTable.description,
      status: campaignsTable.status,
      sourceType: campaignsTable.sourceType,
      createdAt: campaignsTable.createdAt,
      updatedAt: campaignsTable.updatedAt,
      leadCount: sql<number>`(SELECT COUNT(*)::int FROM leads WHERE campaign_id = campaigns.id)`,
      convertedCount: sql<number>`(SELECT COUNT(*)::int FROM leads WHERE campaign_id = campaigns.id AND status = 'converted')`,
    })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, params.data.id));

  if (!campaign) {
    res.status(404).json({ error: "Campaign not found" });
    return;
  }

  res.json({
    ...campaign,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  });
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

  res.json({
    ...campaign,
    leadCount: counts?.leadCount ?? 0,
    convertedCount: counts?.convertedCount ?? 0,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  });
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

export default router;
