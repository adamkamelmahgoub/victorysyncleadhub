import { Router } from "express";
import { db } from "@workspace/db";
import { apiKeysTable, ssoTokensTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

function hashKey(key: string) {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function generateKey() {
  const raw = `vs_live_${crypto.randomBytes(32).toString("hex")}`;
  return raw;
}

router.get("/api-keys", async (_req, res) => {
  const keys = await db.select({
    id: apiKeysTable.id,
    name: apiKeysTable.name,
    keyPrefix: apiKeysTable.keyPrefix,
    scopes: apiKeysTable.scopes,
    isActive: apiKeysTable.isActive,
    lastUsedAt: apiKeysTable.lastUsedAt,
    requestCount: apiKeysTable.requestCount,
    expiresAt: apiKeysTable.expiresAt,
    createdAt: apiKeysTable.createdAt,
  }).from(apiKeysTable).orderBy(desc(apiKeysTable.createdAt));
  res.json(keys);
});

router.post("/api-keys", async (req, res) => {
  const { name, scopes, expiresAt } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const rawKey = generateKey();
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12);
  const [key] = await db.insert(apiKeysTable).values({
    name,
    keyHash,
    keyPrefix,
    scopes: scopes || ["read"],
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    createdBy: "admin",
    isActive: true,
  }).returning();
  res.status(201).json({ ...key, rawKey });
});

router.patch("/api-keys/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [updated] = await db.update(apiKeysTable).set({ ...req.body, updatedAt: new Date() }).where(eq(apiKeysTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.delete("/api-keys/:id", async (req, res) => {
  await db.delete(apiKeysTable).where(eq(apiKeysTable.id, parseInt(req.params.id)));
  res.status(204).send();
});

router.post("/auth/sso", async (req, res) => {
  const { subAccountId, externalUserId, email, name, role } = req.body;
  if (!subAccountId || !externalUserId || !email) {
    return res.status(400).json({ error: "subAccountId, externalUserId, and email are required" });
  }
  const token = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await db.insert(ssoTokensTable).values({ token, subAccountId, externalUserId, email, name, role: role || "member", expiresAt });
  const ssoUrl = `${process.env.APP_URL || "https://app.victorysync.com"}/sso?token=${token}`;
  res.json({ token, ssoUrl, expiresAt });
});

router.get("/auth/sso/validate", async (req, res) => {
  const { token } = req.query as { token: string };
  if (!token) return res.status(400).json({ error: "token required" });
  const [record] = await db.select().from(ssoTokensTable).where(eq(ssoTokensTable.token, token));
  if (!record) return res.status(404).json({ error: "Invalid token" });
  if (record.usedAt) return res.status(410).json({ error: "Token already used" });
  if (new Date() > record.expiresAt) return res.status(410).json({ error: "Token expired" });
  await db.update(ssoTokensTable).set({ usedAt: new Date() }).where(eq(ssoTokensTable.id, record.id));
  res.json({ valid: true, subAccountId: record.subAccountId, email: record.email, name: record.name, role: record.role });
});

export default router;
