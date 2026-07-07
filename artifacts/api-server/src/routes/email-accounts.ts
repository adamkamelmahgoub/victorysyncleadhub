import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { emailAccountsTable, insertEmailAccountSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";

const router: IRouter = Router();

router.get("/email-accounts", async (req, res) => {
  const accounts = await db
    .select()
    .from(emailAccountsTable)
    .orderBy(emailAccountsTable.createdAt);
  const safe = accounts.map(({ smtpPassword: _, ...rest }) => rest);
  res.json(safe);
});

router.post("/email-accounts", async (req, res) => {
  const parsed = insertEmailAccountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (parsed.data.isDefault) {
    await db.update(emailAccountsTable).set({ isDefault: false });
  }

  const [account] = await db.insert(emailAccountsTable).values(parsed.data).returning();
  const { smtpPassword: _, ...safe } = account;
  res.status(201).json(safe);
});

router.put("/email-accounts/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = insertEmailAccountSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (parsed.data.isDefault) {
    await db.update(emailAccountsTable).set({ isDefault: false });
  }

  const [account] = await db
    .update(emailAccountsTable)
    .set(parsed.data)
    .where(eq(emailAccountsTable.id, id))
    .returning();
  if (!account) return res.status(404).json({ error: "Not found" });
  const { smtpPassword: _, ...safe } = account;
  res.json(safe);
});

router.delete("/email-accounts/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(emailAccountsTable).where(eq(emailAccountsTable.id, id));
  res.status(204).end();
});

router.post("/email-accounts/:id/set-default", async (req, res) => {
  const id = Number(req.params.id);
  await db.update(emailAccountsTable).set({ isDefault: false });
  const [account] = await db
    .update(emailAccountsTable)
    .set({ isDefault: true })
    .where(eq(emailAccountsTable.id, id))
    .returning();
  if (!account) return res.status(404).json({ error: "Not found" });
  const { smtpPassword: _, ...safe } = account;
  res.json(safe);
});

router.post("/email-accounts/:id/test", async (req, res) => {
  const id = Number(req.params.id);
  const [account] = await db
    .select()
    .from(emailAccountsTable)
    .where(eq(emailAccountsTable.id, id));
  if (!account) return res.status(404).json({ error: "Not found" });

  try {
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpPort === 465,
      auth: { user: account.smtpUser, pass: account.smtpPassword },
    });
    await transporter.verify();
    res.json({ success: true, message: "Connection successful" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ success: false, message: msg });
  }
});

export default router;
