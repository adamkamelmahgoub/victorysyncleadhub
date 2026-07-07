import { Router } from "express";
import { db } from "@workspace/db";
import { affiliatesTable, referralsTable, insertAffiliateSchema, insertReferralSchema } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

router.get("/affiliates", async (_req, res) => {
  const affiliates = await db.select().from(affiliatesTable).orderBy(desc(affiliatesTable.createdAt));
  res.json(affiliates);
});

router.post("/affiliates", async (req, res) => {
  const parsed = insertAffiliateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const referralCode = parsed.data.referralCode || `VS-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const [affiliate] = await db.insert(affiliatesTable).values({ ...parsed.data, referralCode }).returning();
  res.status(201).json(affiliate);
});

router.get("/affiliates/:id", async (req, res) => {
  const [affiliate] = await db.select().from(affiliatesTable).where(eq(affiliatesTable.id, parseInt(req.params.id)));
  if (!affiliate) { res.status(404).json({ error: "Not found" }); return; }
  const referrals = await db.select().from(referralsTable).where(eq(referralsTable.affiliateId, affiliate.id)).orderBy(desc(referralsTable.createdAt));
  res.json({ ...affiliate, referrals });
});

router.patch("/affiliates/:id", async (req, res) => {
  const [updated] = await db.update(affiliatesTable).set({ ...req.body, updatedAt: new Date() }).where(eq(affiliatesTable.id, parseInt(req.params.id))).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

router.delete("/affiliates/:id", async (req, res) => {
  await db.delete(affiliatesTable).where(eq(affiliatesTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

router.get("/affiliates/:id/referrals", async (req, res) => {
  const referrals = await db.select().from(referralsTable).where(eq(referralsTable.affiliateId, parseInt(req.params.id))).orderBy(desc(referralsTable.createdAt));
  res.json(referrals);
});

router.post("/affiliates/:id/referrals", async (req, res) => {
  const parsed = insertReferralSchema.safeParse({ ...req.body, affiliateId: parseInt(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [referral] = await db.insert(referralsTable).values({ ...parsed.data }).returning();
  await db.update(affiliatesTable).set({ totalReferrals: sql`total_referrals + 1`, updatedAt: new Date() }).where(eq(affiliatesTable.id, parseInt(req.params.id)));
  res.status(201).json(referral);
});

router.patch("/referrals/:id", async (req, res) => {
  const [referral] = await db.select().from(referralsTable).where(eq(referralsTable.id, parseInt(req.params.id)));
  if (!referral) { res.status(404).json({ error: "Not found" }); return; }
  const [updated] = await db.update(referralsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(referralsTable.id, referral.id)).returning();
  if (req.body.status === "converted" && referral.status !== "converted") {
    await db.update(affiliatesTable).set({ totalConverted: sql`total_converted + 1`, updatedAt: new Date() }).where(eq(affiliatesTable.id, referral.affiliateId));
  }
  res.json(updated);
});

router.get("/affiliates-stats", async (_req, res) => {
  const affiliates = await db.select().from(affiliatesTable);
  const referrals = await db.select().from(referralsTable);
  const totalEarned = affiliates.reduce((s, a) => s + parseFloat(String(a.totalEarned)), 0);
  const totalPaid = affiliates.reduce((s, a) => s + parseFloat(String(a.totalPaid)), 0);
  res.json({
    totalAffiliates: affiliates.length,
    activeAffiliates: affiliates.filter(a => a.status === "active").length,
    totalReferrals: referrals.length,
    converted: referrals.filter(r => r.status === "converted").length,
    pending: referrals.filter(r => r.status === "pending").length,
    totalEarned: totalEarned.toFixed(2),
    totalPaid: totalPaid.toFixed(2),
    outstanding: (totalEarned - totalPaid).toFixed(2),
  });
});

export default router;
