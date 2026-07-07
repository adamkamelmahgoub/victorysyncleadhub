import { Router, type IRouter } from "express";
import { eq, desc, sql, gte } from "drizzle-orm";
import { db, leadsTable, campaignsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/analytics/overview", async (_req, res): Promise<void> => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totals] = await db
    .select({
      totalLeads: sql<number>`COUNT(*)::int`,
      convertedLeads: sql<number>`SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END)::int`,
      averageScore: sql<number>`COALESCE(AVG(score), 0)::float`,
      hotLeads: sql<number>`SUM(CASE WHEN score >= 70 THEN 1 ELSE 0 END)::int`,
    })
    .from(leadsTable);

  const [todayRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(leadsTable)
    .where(gte(leadsTable.createdAt, startOfDay));

  const [weekRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(leadsTable)
    .where(gte(leadsTable.createdAt, startOfWeek));

  const [monthRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(leadsTable)
    .where(gte(leadsTable.createdAt, startOfMonth));

  const total = totals?.totalLeads ?? 0;
  const converted = totals?.convertedLeads ?? 0;

  res.json({
    totalLeads: total,
    newLeadsToday: todayRow?.count ?? 0,
    newLeadsThisWeek: weekRow?.count ?? 0,
    newLeadsThisMonth: monthRow?.count ?? 0,
    convertedLeads: converted,
    conversionRate: total > 0 ? Math.round((converted / total) * 1000) / 10 : 0,
    averageScore: Math.round((totals?.averageScore ?? 0) * 10) / 10,
    hotLeads: totals?.hotLeads ?? 0,
  });
});

router.get("/analytics/by-status", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      status: leadsTable.status,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(leadsTable)
    .groupBy(leadsTable.status)
    .orderBy(desc(sql`COUNT(*)`));

  res.json(rows);
});

router.get("/analytics/by-source", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      source: sql<string>`COALESCE(source, 'Unknown')`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(leadsTable)
    .groupBy(leadsTable.source)
    .orderBy(desc(sql`COUNT(*)`));

  res.json(rows.map((r) => ({ source: r.source ?? "Unknown", count: r.count })));
});

router.get("/analytics/by-campaign", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      campaignId: campaignsTable.id,
      campaignName: campaignsTable.name,
      count: sql<number>`COUNT(leads.id)::int`,
      convertedCount: sql<number>`SUM(CASE WHEN leads.status = 'converted' THEN 1 ELSE 0 END)::int`,
    })
    .from(campaignsTable)
    .leftJoin(leadsTable, eq(leadsTable.campaignId, campaignsTable.id))
    .groupBy(campaignsTable.id, campaignsTable.name)
    .orderBy(desc(sql`COUNT(leads.id)`));

  res.json(rows);
});

router.get("/analytics/timeline", async (_req, res): Promise<void> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      date: sql<string>`DATE(created_at AT TIME ZONE 'UTC')::text`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(leadsTable)
    .where(gte(leadsTable.createdAt, thirtyDaysAgo))
    .groupBy(sql`DATE(created_at AT TIME ZONE 'UTC')`)
    .orderBy(sql`DATE(created_at AT TIME ZONE 'UTC')`);

  // Fill in missing days with zero
  const dateMap = new Map(rows.map((r) => [r.date, r.count]));
  const timeline = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    timeline.push({ date: dateStr, count: dateMap.get(dateStr) ?? 0 });
  }

  res.json(timeline);
});

router.get("/analytics/top-leads", async (_req, res): Promise<void> => {
  const leads = await db
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
    .orderBy(desc(leadsTable.score))
    .limit(10);

  res.json(
    leads.map((l) => ({
      ...l,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    }))
  );
});

export default router;
