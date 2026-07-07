import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import crypto from "crypto";
import { z } from "zod";
import { db, inviteCodesTable, teamMembersTable } from "@workspace/db";
import { isSupabaseServiceRoleConfigured, supabase } from "../lib/supabase.js";

const router: IRouter = Router();

function hashInviteCode(code: string) {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

router.post("/auth/signup-with-invite", async (req, res): Promise<void> => {
  const parsed = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
    inviteCode: z.string().min(6),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!isSupabaseServiceRoleConfigured() || !supabase) {
    res.status(503).json({ error: "Supabase service role key is not configured" });
    return;
  }

  const requestedEmail = normalizeEmail(parsed.data.email);
  const requestedName = normalizeName(parsed.data.name);
  const codeHash = hashInviteCode(parsed.data.inviteCode);

  const [invite] = await db
    .select()
    .from(inviteCodesTable)
    .where(and(eq(inviteCodesTable.codeHash, codeHash), isNull(inviteCodesTable.usedAt)))
    .limit(1);

  if (!invite) {
    res.status(403).json({ error: "Invalid or already used invite code" });
    return;
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    res.status(403).json({ error: "Invite code has expired" });
    return;
  }

  if (normalizeEmail(invite.email) !== requestedEmail) {
    res.status(403).json({ error: "Invite code is not assigned to this email" });
    return;
  }

  if (normalizeName(invite.name) !== requestedName) {
    res.status(403).json({ error: "Invite code is not assigned to this name" });
    return;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: requestedEmail,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: {
      full_name: invite.name,
      role: invite.role,
      team_member_id: invite.teamMemberId,
      invite_code_id: invite.id,
    },
  });

  if (error || !data.user) {
    res.status(400).json({ error: error?.message ?? "Could not create user" });
    return;
  }

  const now = new Date();
  await db
    .update(inviteCodesTable)
    .set({ usedAt: now, usedByUserId: data.user.id })
    .where(eq(inviteCodesTable.id, invite.id));

  if (invite.teamMemberId) {
    await db
      .update(teamMembersTable)
      .set({ status: "active", updatedAt: now })
      .where(eq(teamMembersTable.id, invite.teamMemberId));
  }

  res.status(201).json({
    email: requestedEmail,
    name: invite.name,
    message: "Account created. You can now sign in.",
  });
});

export default router;
