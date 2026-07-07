import { Router, type IRouter } from "express";
import { eq, desc, and, avg } from "drizzle-orm";
import { db } from "@workspace/db";
import { reviewsTable, reviewSourcesTable, reviewRequestsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

// ── Review Sources ────────────────────────────────────────────────────────────
router.get("/review-sources", async (_req, res): Promise<void> => {
  const sources = await db.select().from(reviewSourcesTable).orderBy(reviewSourcesTable.createdAt);
  res.json(sources.map((s) => ({ ...s, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString() })));
});

router.post("/review-sources", async (req, res): Promise<void> => {
  const body = z.object({
    platform: z.string().min(1),
    name: z.string().min(1),
    businessId: z.string().optional(),
    reviewUrl: z.string().url().optional(),
    config: z.record(z.unknown()).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [source] = await db.insert(reviewSourcesTable).values(body.data).returning();
  res.status(201).json({ ...source!, createdAt: source!.createdAt.toISOString(), updatedAt: source!.updatedAt.toISOString() });
});

router.patch("/review-sources/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    name: z.string().optional(),
    businessId: z.string().optional(),
    reviewUrl: z.string().optional(),
    isActive: z.boolean().optional(),
    config: z.record(z.unknown()).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [source] = await db.update(reviewSourcesTable).set({ ...body.data, updatedAt: new Date() }).where(eq(reviewSourcesTable.id, id)).returning();
  if (!source) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...source, createdAt: source.createdAt.toISOString(), updatedAt: source.updatedAt.toISOString() });
});

router.delete("/review-sources/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(reviewsTable).where(eq(reviewsTable.sourceId, id));
  await db.delete(reviewSourcesTable).where(eq(reviewSourcesTable.id, id));
  res.sendStatus(204);
});

// ── Reviews CRUD ──────────────────────────────────────────────────────────────
router.get("/reviews", async (req, res): Promise<void> => {
  const { platform, rating, replied } = req.query as Record<string, string>;
  const conditions = [];
  if (platform && platform !== "all") conditions.push(eq(reviewsTable.platform, platform));
  if (rating) conditions.push(eq(reviewsTable.rating, parseInt(rating)));
  if (replied === "true") conditions.push(eq(reviewsTable.isRead, true));

  const reviews = await db.select().from(reviewsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(reviewsTable.createdAt));
  res.json(reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), repliedAt: r.repliedAt?.toISOString() ?? null })));
});

router.post("/reviews", async (req, res): Promise<void> => {
  const body = z.object({
    platform: z.string().min(1),
    reviewer: z.string().min(1),
    rating: z.number().int().min(1).max(5),
    text: z.string().optional(),
    sourceId: z.number().optional(),
    reviewUrl: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [review] = await db.insert(reviewsTable).values({ ...body.data, sentiment: body.data.rating >= 4 ? "positive" : body.data.rating === 3 ? "neutral" : "negative" }).returning();
  // Update source stats
  if (body.data.sourceId) {
    const sourceReviews = await db.select({ rating: reviewsTable.rating }).from(reviewsTable).where(eq(reviewsTable.sourceId, body.data.sourceId));
    const avg = sourceReviews.reduce((s, r) => s + r.rating, 0) / Math.max(1, sourceReviews.length);
    await db.update(reviewSourcesTable).set({ reviewCount: sourceReviews.length, avgRating: avg.toFixed(1), updatedAt: new Date() }).where(eq(reviewSourcesTable.id, body.data.sourceId));
  }
  res.status(201).json({ ...review!, createdAt: review!.createdAt.toISOString() });
});

router.patch("/reviews/:id/reply", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({ reply: z.string().min(1) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [review] = await db.update(reviewsTable).set({ reply: body.data.reply, repliedAt: new Date(), isRead: true }).where(eq(reviewsTable.id, id)).returning();
  if (!review) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...review, createdAt: review.createdAt.toISOString(), repliedAt: review.repliedAt?.toISOString() ?? null });
});

router.patch("/reviews/:id/read", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.update(reviewsTable).set({ isRead: true }).where(eq(reviewsTable.id, id));
  res.sendStatus(204);
});

router.delete("/reviews/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(reviewsTable).where(eq(reviewsTable.id, id));
  res.sendStatus(204);
});

// ── Review Requests ───────────────────────────────────────────────────────────
router.get("/review-requests", async (_req, res): Promise<void> => {
  const requests = await db.select().from(reviewRequestsTable).orderBy(desc(reviewRequestsTable.sentAt));
  res.json(requests.map((r) => ({ ...r, sentAt: r.sentAt.toISOString(), clickedAt: r.clickedAt?.toISOString() ?? null })));
});

router.post("/review-requests", async (req, res): Promise<void> => {
  const body = z.object({
    contactName: z.string().min(1),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    channel: z.enum(["email", "sms"]),
    platform: z.string().min(1),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [request] = await db.insert(reviewRequestsTable).values({ ...body.data, status: "sent" }).returning();
  res.status(201).json({ ...request!, sentAt: request!.sentAt.toISOString() });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get("/reviews/stats", async (_req, res): Promise<void> => {
  const all = await db.select().from(reviewsTable);
  const total = all.length;
  const avgRating = total ? (all.reduce((s, r) => s + r.rating, 0) / total).toFixed(1) : "0";
  const byRating = [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: all.filter((rev) => rev.rating === r).length }));
  const byPlatform = Array.from(new Set(all.map((r) => r.platform))).map((p) => ({
    platform: p,
    count: all.filter((r) => r.platform === p).length,
    avg: (all.filter((r) => r.platform === p).reduce((s, r) => s + r.rating, 0) / Math.max(1, all.filter((r) => r.platform === p).length)).toFixed(1),
  }));
  const unreplied = all.filter((r) => !r.reply).length;
  res.json({ total, avgRating, byRating, byPlatform, unreplied });
});

export default router;
