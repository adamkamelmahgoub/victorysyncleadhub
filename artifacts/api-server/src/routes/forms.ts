import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, formsTable, leadsTable, campaignsTable, activitiesTable } from "@workspace/db";
import {
  CreateFormBody,
  GetFormParams,
  UpdateFormParams,
  UpdateFormBody,
  DeleteFormParams,
  SubmitFormParams,
  SubmitFormBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

function buildEmbedCode(formId: number, baseUrl: string): string {
  return `<script src="${baseUrl}/api/forms/${formId}/embed.js"></script>\n<div id="leadgen-form-${formId}"></div>`;
}

router.get("/forms", async (req, res): Promise<void> => {
  const forms = await db
    .select({
      id: formsTable.id,
      name: formsTable.name,
      description: formsTable.description,
      status: formsTable.status,
      campaignId: formsTable.campaignId,
      fields: formsTable.fields,
      successMessage: formsTable.successMessage,
      createdAt: formsTable.createdAt,
      updatedAt: formsTable.updatedAt,
      submissionCount: sql<number>`(SELECT COUNT(*)::int FROM leads WHERE form_id = forms.id)`,
    })
    .from(formsTable)
    .orderBy(desc(formsTable.createdAt));

  const host = req.headers.host ?? "localhost";
  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  const baseUrl = `${protocol}://${host}`;

  res.json(
    forms.map((f) => ({
      ...f,
      fields: (f.fields as unknown[]) ?? [],
      embedCode: buildEmbedCode(f.id, baseUrl),
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    }))
  );
});

router.post("/forms", async (req, res): Promise<void> => {
  const parsed = CreateFormBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [form] = await db
    .insert(formsTable)
    .values({
      ...parsed.data,
      fields: (parsed.data.fields as unknown[]) ?? [],
    })
    .returning();

  const host = req.headers.host ?? "localhost";
  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  const baseUrl = `${protocol}://${host}`;

  res.status(201).json({
    ...form,
    fields: (form.fields as unknown[]) ?? [],
    submissionCount: 0,
    embedCode: buildEmbedCode(form.id, baseUrl),
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
  });
});

router.get("/forms/:id", async (req, res): Promise<void> => {
  const params = GetFormParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [form] = await db
    .select({
      id: formsTable.id,
      name: formsTable.name,
      description: formsTable.description,
      status: formsTable.status,
      campaignId: formsTable.campaignId,
      fields: formsTable.fields,
      successMessage: formsTable.successMessage,
      createdAt: formsTable.createdAt,
      updatedAt: formsTable.updatedAt,
      submissionCount: sql<number>`(SELECT COUNT(*)::int FROM leads WHERE form_id = forms.id)`,
    })
    .from(formsTable)
    .where(eq(formsTable.id, params.data.id));

  if (!form) {
    res.status(404).json({ error: "Form not found" });
    return;
  }

  const host = req.headers.host ?? "localhost";
  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  const baseUrl = `${protocol}://${host}`;

  res.json({
    ...form,
    fields: (form.fields as unknown[]) ?? [],
    embedCode: buildEmbedCode(form.id, baseUrl),
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
  });
});

router.patch("/forms/:id", async (req, res): Promise<void> => {
  const params = UpdateFormParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateFormBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [form] = await db
    .update(formsTable)
    .set({
      ...parsed.data,
      fields: parsed.data.fields ? (parsed.data.fields as unknown[]) : undefined,
    })
    .where(eq(formsTable.id, params.data.id))
    .returning();

  if (!form) {
    res.status(404).json({ error: "Form not found" });
    return;
  }

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(leadsTable)
    .where(eq(leadsTable.formId, form.id));

  const host = req.headers.host ?? "localhost";
  const protocol = req.headers["x-forwarded-proto"] ?? "https";
  const baseUrl = `${protocol}://${host}`;

  res.json({
    ...form,
    fields: (form.fields as unknown[]) ?? [],
    submissionCount: countRow?.count ?? 0,
    embedCode: buildEmbedCode(form.id, baseUrl),
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
  });
});

router.delete("/forms/:id", async (req, res): Promise<void> => {
  const params = DeleteFormParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [form] = await db
    .delete(formsTable)
    .where(eq(formsTable.id, params.data.id))
    .returning();

  if (!form) {
    res.status(404).json({ error: "Form not found" });
    return;
  }

  res.sendStatus(204);
});

// Public form submission endpoint
router.post("/forms/:id/submit", async (req, res): Promise<void> => {
  const params = SubmitFormParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = SubmitFormBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [form] = await db
    .select()
    .from(formsTable)
    .where(eq(formsTable.id, params.data.id))
    .limit(1);

  if (!form || form.status !== "active") {
    res.status(404).json({ error: "Form not found or inactive" });
    return;
  }

  const data = body.data.data;

  // Map submitted data to lead fields
  const leadData: Record<string, unknown> = {
    firstName: data.firstName ?? data.first_name ?? data["First Name"] ?? "Unknown",
    lastName: data.lastName ?? data.last_name ?? data["Last Name"] ?? "",
    email: data.email ?? data.Email ?? "",
    phone: data.phone ?? data.Phone ?? undefined,
    company: data.company ?? data.Company ?? undefined,
    title: data.title ?? data.Title ?? undefined,
    status: "new",
    source: "form",
    formId: form.id,
    campaignId: form.campaignId ?? undefined,
    customFields: data,
  };

  const [lead] = await db.insert(leadsTable).values(leadData as typeof leadsTable.$inferInsert).returning();

  await db.insert(activitiesTable).values({
    leadId: lead.id,
    type: "form_submission",
    description: `Lead submitted via form: "${form.name}"`,
  });

  const campaign = lead.campaignId
    ? await db.select().from(campaignsTable).where(eq(campaignsTable.id, lead.campaignId)).limit(1)
    : [];

  res.status(201).json({
    ...lead,
    campaignName: campaign[0]?.name ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  });
});

export default router;
