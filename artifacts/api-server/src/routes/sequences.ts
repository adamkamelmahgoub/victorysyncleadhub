import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  sequencesTable,
  sequenceStepsTable,
  sequenceEnrollmentsTable,
  leadsTable,
  emailAccountsTable,
  emailLogsTable,
  insertSequenceSchema,
  insertSequenceStepSchema,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import nodemailer from "nodemailer";

const router: IRouter = Router();

function interpolate(template: string, lead: Record<string, unknown>): string {
  return template
    .replace(/\{\{firstName\}\}/g, String(lead.firstName ?? ""))
    .replace(/\{\{lastName\}\}/g, String(lead.lastName ?? ""))
    .replace(/\{\{email\}\}/g, String(lead.email ?? ""))
    .replace(/\{\{company\}\}/g, String(lead.company ?? "your company"))
    .replace(/\{\{title\}\}/g, String(lead.title ?? ""));
}

// ─── Sequences CRUD ──────────────────────────────────────────────────────────

router.get("/sequences", async (_req, res) => {
  const seqs = await db.select().from(sequencesTable).orderBy(sequencesTable.createdAt);
  res.json(seqs);
});

router.post("/sequences", async (req, res) => {
  const parsed = insertSequenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [seq] = await db.insert(sequencesTable).values(parsed.data).returning();
  res.status(201).json(seq);
});

router.get("/sequences/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [seq] = await db.select().from(sequencesTable).where(eq(sequencesTable.id, id));
  if (!seq) return res.status(404).json({ error: "Not found" });
  const steps = await db
    .select()
    .from(sequenceStepsTable)
    .where(eq(sequenceStepsTable.sequenceId, id))
    .orderBy(asc(sequenceStepsTable.stepNumber));
  res.json({ ...seq, steps });
});

router.put("/sequences/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = insertSequenceSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [seq] = await db
    .update(sequencesTable)
    .set(parsed.data)
    .where(eq(sequencesTable.id, id))
    .returning();
  if (!seq) return res.status(404).json({ error: "Not found" });
  res.json(seq);
});

router.delete("/sequences/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(sequenceEnrollmentsTable).where(eq(sequenceEnrollmentsTable.sequenceId, id));
  await db.delete(sequenceStepsTable).where(eq(sequenceStepsTable.sequenceId, id));
  await db.delete(sequencesTable).where(eq(sequencesTable.id, id));
  res.status(204).end();
});

// ─── Steps ───────────────────────────────────────────────────────────────────

router.get("/sequences/:id/steps", async (req, res) => {
  const id = Number(req.params.id);
  const steps = await db
    .select()
    .from(sequenceStepsTable)
    .where(eq(sequenceStepsTable.sequenceId, id))
    .orderBy(asc(sequenceStepsTable.stepNumber));
  res.json(steps);
});

router.post("/sequences/:id/steps", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = insertSequenceStepSchema.safeParse({ ...req.body, sequenceId: id });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [step] = await db.insert(sequenceStepsTable).values(parsed.data).returning();
  res.status(201).json(step);
});

router.put("/sequences/:id/steps/:stepId", async (req, res) => {
  const stepId = Number(req.params.stepId);
  const parsed = insertSequenceStepSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const [step] = await db
    .update(sequenceStepsTable)
    .set(parsed.data)
    .where(eq(sequenceStepsTable.id, stepId))
    .returning();
  if (!step) return res.status(404).json({ error: "Not found" });
  res.json(step);
});

router.delete("/sequences/:id/steps/:stepId", async (req, res) => {
  const stepId = Number(req.params.stepId);
  await db.delete(sequenceStepsTable).where(eq(sequenceStepsTable.id, stepId));
  res.status(204).end();
});

// ─── Enrollments ─────────────────────────────────────────────────────────────

router.get("/sequences/:id/enrollments", async (req, res) => {
  const id = Number(req.params.id);
  const enrollments = await db
    .select()
    .from(sequenceEnrollmentsTable)
    .where(eq(sequenceEnrollmentsTable.sequenceId, id))
    .orderBy(sequenceEnrollmentsTable.createdAt);
  const leadIds = enrollments.map((e) => e.leadId);
  const leads = leadIds.length
    ? await db.select().from(leadsTable).where(
        eq(leadsTable.id, leadIds[0])
      )
    : [];
  const leadsMap = Object.fromEntries(leads.map((l) => [l.id, l]));
  res.json(enrollments.map((e) => ({ ...e, lead: leadsMap[e.leadId] ?? null })));
});

router.post("/sequences/:id/enroll", async (req, res) => {
  const seqId = Number(req.params.id);
  const { leadIds } = req.body as { leadIds: number[] };
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: "leadIds must be a non-empty array" });
  }

  const [firstStep] = await db
    .select()
    .from(sequenceStepsTable)
    .where(eq(sequenceStepsTable.sequenceId, seqId))
    .orderBy(asc(sequenceStepsTable.stepNumber))
    .limit(1);

  const nextSendAt = firstStep
    ? new Date(Date.now() + firstStep.delayDays * 86400000)
    : null;

  const rows = leadIds.map((leadId) => ({
    sequenceId: seqId,
    leadId,
    currentStep: 1,
    status: "active",
    nextSendAt,
  }));

  await db.insert(sequenceEnrollmentsTable).values(rows).onConflictDoNothing();
  await db
    .update(sequencesTable)
    .set({ totalEnrolled: (await db.select().from(sequenceEnrollmentsTable).where(eq(sequenceEnrollmentsTable.sequenceId, seqId))).length })
    .where(eq(sequencesTable.id, seqId));

  res.json({ enrolled: leadIds.length });
});

// ─── Send a one-off email ─────────────────────────────────────────────────────

router.post("/email/send", async (req, res) => {
  const { leadId, emailAccountId, subject, body } = req.body as {
    leadId: number;
    emailAccountId: number;
    subject: string;
    body: string;
  };

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId));
  if (!lead) return res.status(404).json({ error: "Lead not found" });

  const [account] = await db
    .select()
    .from(emailAccountsTable)
    .where(eq(emailAccountsTable.id, emailAccountId));
  if (!account) return res.status(404).json({ error: "Email account not found" });

  const renderedSubject = interpolate(subject, lead as unknown as Record<string, unknown>);
  const renderedBody = interpolate(body, lead as unknown as Record<string, unknown>);

  try {
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpPort === 465,
      auth: { user: account.smtpUser, pass: account.smtpPassword },
    });

    await transporter.sendMail({
      from: `"${account.fromName}" <${account.fromEmail}>`,
      to: lead.email,
      subject: renderedSubject,
      html: renderedBody.replace(/\n/g, "<br>"),
    });

    await db.insert(emailLogsTable).values({
      leadId,
      emailAccountId,
      toEmail: lead.email,
      fromEmail: account.fromEmail,
      subject: renderedSubject,
      body: renderedBody,
      status: "sent",
    });

    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Send failed";
    await db.insert(emailLogsTable).values({
      leadId,
      emailAccountId,
      toEmail: lead.email,
      fromEmail: account.fromEmail,
      subject: renderedSubject,
      body: renderedBody,
      status: "failed",
    });
    res.status(500).json({ success: false, error: msg });
  }
});

router.get("/email/logs", async (req, res) => {
  const leadId = req.query.leadId ? Number(req.query.leadId) : undefined;
  const query = db.select().from(emailLogsTable);
  const logs = leadId
    ? await query.where(eq(emailLogsTable.leadId, leadId)).orderBy(emailLogsTable.sentAt)
    : await query.orderBy(emailLogsTable.sentAt);
  res.json(logs);
});

export default router;
