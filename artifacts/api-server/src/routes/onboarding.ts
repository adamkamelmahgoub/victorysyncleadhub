import { Router } from "express";
import { db } from "@workspace/db";
import { onboardingProgressTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requestedClientAccountId } from "../lib/client-scope.js";

const router = Router();

const ONBOARDING_STEPS = [
  { id: "connect_integrations", title: "Connect Your Tools", description: "Link your email, CRM, and communication tools", icon: "plug", estimatedMinutes: 5 },
  { id: "import_contacts", title: "Import Contacts", description: "Bring in your existing leads and contacts", icon: "users", estimatedMinutes: 3 },
  { id: "create_campaign", title: "Create First Campaign", description: "Set up your first outreach campaign", icon: "megaphone", estimatedMinutes: 10 },
  { id: "setup_pipeline", title: "Set Up Your Pipeline", description: "Configure your sales pipeline stages", icon: "kanban", estimatedMinutes: 5 },
  { id: "invite_team", title: "Invite Your Team", description: "Add team members and set their roles", icon: "user-plus", estimatedMinutes: 2 },
  { id: "configure_automation", title: "Set Up Automations", description: "Create your first automation workflow", icon: "zap", estimatedMinutes: 10 },
  { id: "launch", title: "Go Live", description: "Review everything and launch your first sequence", icon: "rocket", estimatedMinutes: 5 },
];

function parseClientAccountId(req: Parameters<typeof requestedClientAccountId>[0], res: Parameters<typeof requestedClientAccountId>[1]) {
  const parsed = z.string().uuid().safeParse(requestedClientAccountId(req, res));
  if (parsed.success) return parsed.data;
  res.status(400).json({ error: "A valid client account id is required" });
  return null;
}

router.get("/onboarding", async (req, res) => {
  const subAccountId = parseClientAccountId(req, res);
  if (!subAccountId) return;
  let [progress] = await db.select().from(onboardingProgressTable).where(eq(onboardingProgressTable.subAccountId, subAccountId));
  if (!progress) {
    [progress] = await db.insert(onboardingProgressTable).values({ subAccountId, currentStep: "connect_integrations", completedSteps: [] }).returning();
  }
  const enriched = ONBOARDING_STEPS.map(step => ({
    ...step,
    completed: progress.completedSteps.includes(step.id),
    current: progress.currentStep === step.id,
  }));
  const completedCount = progress.completedSteps.length;
  res.json({ steps: enriched, completedCount, totalSteps: ONBOARDING_STEPS.length, percentComplete: Math.round((completedCount / ONBOARDING_STEPS.length) * 100), isCompleted: progress.isCompleted, currentStep: progress.currentStep });
});

router.post("/onboarding/complete-step", async (req, res) => {
  const { stepId } = req.body;
  const subAccountId = parseClientAccountId(req, res);
  if (!subAccountId) return;
  if (!stepId) { res.status(400).json({ error: "stepId required" }); return; }

  let [progress] = await db.select().from(onboardingProgressTable).where(eq(onboardingProgressTable.subAccountId, subAccountId));
  if (!progress) {
    [progress] = await db.insert(onboardingProgressTable).values({ subAccountId, currentStep: stepId, completedSteps: [] }).returning();
  }

  const stepIndex = ONBOARDING_STEPS.findIndex(s => s.id === stepId);
  const completedSteps = Array.from(new Set([...progress.completedSteps, stepId]));
  const nextStep = ONBOARDING_STEPS[stepIndex + 1]?.id || "launch";
  const isCompleted = completedSteps.length === ONBOARDING_STEPS.length;

  const [updated] = await db.update(onboardingProgressTable).set({
    completedSteps,
    currentStep: isCompleted ? "launch" : nextStep,
    isCompleted,
    completedAt: isCompleted ? new Date() : undefined,
    updatedAt: new Date(),
  }).where(eq(onboardingProgressTable.subAccountId, subAccountId)).returning();

  res.json(updated);
});

router.post("/onboarding/reset", async (req, res) => {
  const subAccountId = parseClientAccountId(req, res);
  if (!subAccountId) return;
  const [reset] = await db.update(onboardingProgressTable).set({ completedSteps: [], currentStep: "connect_integrations", isCompleted: false, completedAt: undefined, updatedAt: new Date() }).where(eq(onboardingProgressTable.subAccountId, subAccountId)).returning();
  res.json(reset);
});

export default router;
