import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, emailTemplatesTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const DEFAULT_TEMPLATES = [
  { name: "Welcome Email", subject: "Welcome to {{company}}! 🎉", category: "onboarding", body: `Hi {{firstName}},\n\nWe're thrilled to have you on board! Here's a quick overview of how to get started:\n\n1. Set up your profile\n2. Connect your integrations\n3. Create your first workflow\n\nIf you have any questions, just reply to this email.\n\nBest,\nThe VictorySync Team`, previewText: "Welcome aboard! Here's everything you need to get started.", isDefault: true },
  { name: "Follow-up After Demo", subject: "Great speaking with you, {{firstName}}!", category: "sales", body: `Hi {{firstName}},\n\nThank you for taking the time to see our demo today. I hope it gave you a clear picture of how VictorySync can help {{company}}.\n\nAs we discussed, the key benefits for your team are:\n• [Benefit 1]\n• [Benefit 2]\n• [Benefit 3]\n\nI'd love to answer any questions and discuss next steps. Are you free for a quick call this week?\n\nBest,\n{{senderName}}`, previewText: "Following up on our recent conversation.", isDefault: true },
  { name: "Cold Outreach", subject: "Quick question about {{company}}'s growth", category: "outreach", body: `Hi {{firstName}},\n\nI came across {{company}} and was impressed by [specific detail]. I work with companies like yours to [key value prop].\n\nI'd love to show you how we helped [similar company] achieve [specific result].\n\nWould you be open to a 15-minute call this week?\n\nBest,\n{{senderName}}`, previewText: "I have a quick question about your growth.", isDefault: true },
  { name: "Review Request", subject: "How was your experience with us, {{firstName}}?", category: "reviews", body: `Hi {{firstName}},\n\nWe hope you've been enjoying our services! We'd love to hear about your experience.\n\nWould you mind leaving us a quick review? It only takes 2 minutes and helps us improve:\n\n→ [Leave a Google Review]\n\nThank you so much!\n\nBest,\nThe Team`, previewText: "Share your experience with a quick review.", isDefault: true },
  { name: "Appointment Reminder", subject: "Reminder: Your appointment is tomorrow", category: "reminders", body: `Hi {{firstName}},\n\nThis is a friendly reminder that you have an appointment scheduled for:\n\n📅 Date: {{appointmentDate}}\n⏰ Time: {{appointmentTime}}\n📍 Location: {{appointmentLocation}}\n\nNeed to reschedule? Click here: [Reschedule Link]\n\nSee you soon!\nThe Team`, previewText: "Don't forget your upcoming appointment.", isDefault: true },
  { name: "Deal Won Confirmation", subject: "Welcome aboard, {{firstName}}! You're now a customer 🎉", category: "onboarding", body: `Hi {{firstName}},\n\nFantastic news — you're officially part of the family!\n\nYour account is now active and ready to go. Here's what happens next:\n\n1. You'll receive your login credentials within the next 30 minutes\n2. Our onboarding team will reach out to schedule your setup call\n3. Check out our help docs to get a head start\n\nWe're excited to work with you and {{company}}!\n\nBest,\nThe VictorySync Team`, previewText: "Your account is now active. Here's what happens next.", isDefault: true },
  { name: "Re-engagement", subject: "We miss you, {{firstName}}!", category: "retention", body: `Hi {{firstName}},\n\nWe noticed you haven't logged in for a while, and we wanted to check in.\n\nWe've been busy adding new features since you last visited:\n• [New Feature 1]\n• [New Feature 2]\n\nLog in today and see what's new →\n\nIf you have any questions or feedback, just reply to this email.\n\nBest,\nThe Team`, previewText: "We've added some great new features since your last visit.", isDefault: true },
];

// Seed defaults on first request
let seeded = false;
async function seedDefaults() {
  if (seeded) return;
  seeded = true;
  const existing = await db.select({ id: emailTemplatesTable.id }).from(emailTemplatesTable).limit(1);
  if (!existing.length) {
    await db.insert(emailTemplatesTable).values(DEFAULT_TEMPLATES);
  }
}

router.get("/email-templates", async (_req, res): Promise<void> => {
  await seedDefaults();
  const templates = await db.select().from(emailTemplatesTable).orderBy(desc(emailTemplatesTable.createdAt));
  res.json(templates.map((t) => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() })));
});

router.post("/email-templates", async (req, res): Promise<void> => {
  const body = z.object({
    name: z.string().min(1),
    subject: z.string().min(1),
    body: z.string().min(1),
    previewText: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [template] = await db.insert(emailTemplatesTable).values(body.data).returning();
  res.status(201).json({ ...template!, createdAt: template!.createdAt.toISOString(), updatedAt: template!.updatedAt.toISOString() });
});

router.patch("/email-templates/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const body = z.object({
    name: z.string().optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    previewText: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const [template] = await db.update(emailTemplatesTable).set({ ...body.data, updatedAt: new Date() }).where(eq(emailTemplatesTable.id, id)).returning();
  if (!template) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...template, createdAt: template.createdAt.toISOString(), updatedAt: template.updatedAt.toISOString() });
});

router.delete("/email-templates/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "");
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(emailTemplatesTable).where(eq(emailTemplatesTable.id, id));
  res.sendStatus(204);
});

export default router;
