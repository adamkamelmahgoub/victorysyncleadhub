import { Router, type IRouter } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, inviteCodesTable, teamMembersTable } from "@workspace/db";
import { z } from "zod";
import crypto from "crypto";

const router: IRouter = Router();

function generateInviteCode() {
  return `VS-${crypto.randomBytes(3).toString("hex").toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function hashInviteCode(code: string) {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

router.get("/team", async (req, res): Promise<void> => {
  const members = await db.select().from(teamMembersTable).orderBy(desc(teamMembersTable.createdAt));
  res.json(members.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() })));
});

router.post("/team/invite", async (req, res): Promise<void> => {
  const body = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    role: z.enum(["owner", "admin", "member", "viewer"]).default("member"),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const existing = await db.select().from(teamMembersTable).where(eq(teamMembersTable.email, body.data.email)).limit(1);
  if (existing[0]) { res.status(409).json({ error: "A member with this email already exists" }); return; }

  const [member] = await db.insert(teamMembersTable).values({ ...body.data, email: body.data.email.toLowerCase(), status: "invited" }).returning();
  const inviteCode = generateInviteCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const createdBy = typeof res.locals.user?.email === "string" ? res.locals.user.email : "admin";

  await db.insert(inviteCodesTable).values({
    codeHash: hashInviteCode(inviteCode),
    email: member.email,
    name: member.name,
    role: member.role,
    teamMemberId: member.id,
    createdBy,
    expiresAt,
  });

  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  res.status(201).json({
    member: { ...member, createdAt: member.createdAt.toISOString(), updatedAt: member.updatedAt.toISOString() },
    invite: {
      code: inviteCode,
      email: member.email,
      name: member.name,
      expiresAt: expiresAt.toISOString(),
      url: appUrl ? `${appUrl}?invite=${encodeURIComponent(inviteCode)}&email=${encodeURIComponent(member.email)}&name=${encodeURIComponent(member.name)}` : undefined,
    },
  });
});

router.patch("/team/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = z.object({
    role: z.enum(["owner", "admin", "member", "viewer"]).optional(),
    status: z.enum(["active", "invited", "deactivated"]).optional(),
    name: z.string().min(1).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [member] = await db.update(teamMembersTable).set({ ...body.data, updatedAt: new Date() }).where(eq(teamMembersTable.id, id)).returning();
  if (!member) { res.status(404).json({ error: "Member not found" }); return; }
  res.json({ ...member, createdAt: member.createdAt.toISOString(), updatedAt: member.updatedAt.toISOString() });
});

router.delete("/team/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [member] = await db.delete(teamMembersTable).where(eq(teamMembersTable.id, id)).returning();
  if (!member) { res.status(404).json({ error: "Member not found" }); return; }
  await db
    .update(inviteCodesTable)
    .set({ usedAt: new Date() })
    .where(and(eq(inviteCodesTable.teamMemberId, id), isNull(inviteCodesTable.usedAt)));
  res.sendStatus(204);
});

export default router;
