type VercelRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  on(event: "data", cb: (chunk: Buffer) => void): void;
  on(event: "end", cb: () => void): void;
  on(event: "error", cb: (error: Error) => void): void;
};

type VercelResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

type LeadInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  source?: string;
  status?: string;
  score?: number;
  campaignId?: number;
  formId?: number;
  pipelineStageId?: number;
  tags?: string[];
  customFields?: Record<string, unknown>;
};

type FetchInit = {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
};

type LeadRow = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  title: string | null;
  source: string | null;
  status: string;
  score: number;
  campaign_id: number | null;
  form_id: number | null;
  pipeline_stage_id: number | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

function sendJson(res: VercelResponse, statusCode: number, data: unknown) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function pathFromUrl(url = "/") {
  return new URL(url, "https://local.invalid").pathname;
}

async function readJson(req: VercelRequest) {
  if (req.body && typeof req.body === "object") return req.body;

  const body = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });

  if (!body.trim()) return {};
  return JSON.parse(body);
}

function normalizeLead(lead: LeadInput) {
  return {
    first_name: lead.firstName?.trim(),
    last_name: lead.lastName?.trim(),
    email: lead.email?.trim(),
    phone: lead.phone?.trim() || null,
    company: lead.company?.trim() || null,
    title: lead.title?.trim() || null,
    source: lead.source?.trim() || "import",
    status: lead.status?.trim() || "new",
    score: Number.isFinite(lead.score) ? lead.score : 0,
    campaign_id: lead.campaignId ?? null,
    form_id: lead.formId ?? null,
    pipeline_stage_id: lead.pipelineStageId ?? null,
    tags: Array.isArray(lead.tags) ? lead.tags : [],
    custom_fields: lead.customFields ?? {},
  };
}

function validateLead(lead: ReturnType<typeof normalizeLead>) {
  if (!lead.first_name) return "First name is required";
  if (!lead.last_name) return "Last name is required";
  if (!lead.email) return "Email is required";
  return null;
}

function leadFromRow(row: LeadRow) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    title: row.title,
    source: row.source,
    status: row.status,
    score: row.score,
    campaignId: row.campaign_id,
    formId: row.form_id,
    pipelineStageId: row.pipeline_stage_id,
    tags: row.tags ?? [],
    customFields: row.custom_fields ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function supabaseRest(path: string, init: FetchInit) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase server environment is not configured");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseKey,
      authorization: `Bearer ${supabaseKey}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  }) as {
    ok: boolean;
    status: number;
    text(): Promise<string>;
  };

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String(data.message)
        : `Supabase REST error ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function getLeadId(path: string) {
  const match = path.match(/^\/api\/leads\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

async function listLeads(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? "/api/leads", "https://local.invalid");
  const page = Math.max(Number(url.searchParams.get("page") ?? "1"), 1);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "50"), 1), 250);
  const offset = (page - 1) * limit;
  const search = url.searchParams.get("search")?.trim();
  const status = url.searchParams.get("status")?.trim();

  const query = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(limit),
    offset: String(offset),
  });
  if (status) query.set("status", `eq.${status}`);
  if (search) {
    query.set(
      "or",
      `(first_name.ilike.*${search}*,last_name.ilike.*${search}*,email.ilike.*${search}*,company.ilike.*${search}*)`,
    );
  }

  const rows = (await supabaseRest(`leads?${query.toString()}`, {
    method: "GET",
    headers: { prefer: "count=exact" },
  })) as LeadRow[];

  sendJson(res, 200, {
    leads: rows.map(leadFromRow),
    total: rows.length,
    page,
    limit,
  });
}

async function getLead(id: number, res: VercelResponse) {
  const rows = (await supabaseRest(`leads?id=eq.${id}&select=*&limit=1`, {
    method: "GET",
  })) as LeadRow[];
  if (!rows[0]) {
    sendJson(res, 404, { error: "Lead not found" });
    return;
  }
  sendJson(res, 200, leadFromRow(rows[0]));
}

async function insertActivities(leads: Array<{ id?: number }>) {
  const activities = leads
    .filter((lead) => typeof lead.id === "number")
    .map((lead) => ({
      lead_id: lead.id,
      type: "imported",
      description: "Lead imported via CSV",
    }));

  if (activities.length > 0) {
    await supabaseRest("activities", {
      method: "POST",
      body: JSON.stringify(activities),
    });
  }
}

async function createLead(req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as LeadInput;
  const lead = normalizeLead(body);
  const error = validateLead(lead);
  if (error) {
    sendJson(res, 400, { error });
    return;
  }

  const inserted = (await supabaseRest("leads", {
    method: "POST",
    body: JSON.stringify(lead),
  })) as LeadRow[];

  await insertActivities(inserted);
  sendJson(res, 201, inserted[0] ? leadFromRow(inserted[0]) : null);
}

async function updateLead(id: number, req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as LeadInput;
  const update = normalizeLead(body);

  for (const key of Object.keys(update) as Array<keyof typeof update>) {
    if (update[key] === null || update[key] === undefined) {
      delete update[key];
    }
  }

  const rows = (await supabaseRest(`leads?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  })) as LeadRow[];

  if (!rows[0]) {
    sendJson(res, 404, { error: "Lead not found" });
    return;
  }

  sendJson(res, 200, leadFromRow(rows[0]));
}

async function deleteLead(id: number, res: VercelResponse) {
  await supabaseRest(`activities?lead_id=eq.${id}`, { method: "DELETE" });
  await supabaseRest(`leads?id=eq.${id}`, { method: "DELETE" });
  res.statusCode = 204;
  res.end();
}

async function importLeads(req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as { leads?: LeadInput[]; campaignId?: number };
  const incoming = Array.isArray(body.leads) ? body.leads : [];
  const leads = incoming.map((lead) =>
    normalizeLead({ ...lead, campaignId: body.campaignId ?? lead.campaignId }),
  );
  const valid = leads.filter((lead) => !validateLead(lead));
  const errors = leads
    .map((lead) => validateLead(lead))
    .filter((error) => Boolean(error)) as string[];

  if (valid.length === 0) {
    sendJson(res, 400, {
      imported: 0,
      failed: incoming.length,
      total: incoming.length,
      errors: errors.length ? errors : ["No valid leads to import"],
    });
    return;
  }

  const inserted = (await supabaseRest("leads", {
    method: "POST",
    body: JSON.stringify(valid),
  })) as Array<{ id?: number }>;

  await insertActivities(inserted);
  sendJson(res, 200, {
    imported: inserted.length,
    failed: incoming.length - inserted.length,
    total: incoming.length,
    errors,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const path = pathFromUrl(req.url);
    const method = (req.method ?? "GET").toUpperCase();

    if (path === "/api/healthz") {
      sendJson(res, 200, {
        status: "ok",
        supabaseConfigured: Boolean(supabaseUrl && supabaseKey),
      });
      return;
    }

    if (method === "GET" && path === "/api/leads") {
      await listLeads(req, res);
      return;
    }

    if (method === "POST" && path === "/api/leads") {
      await createLead(req, res);
      return;
    }

    const leadId = getLeadId(path);
    if (leadId && method === "GET") {
      await getLead(leadId, res);
      return;
    }

    if (leadId && method === "PATCH") {
      await updateLead(leadId, req, res);
      return;
    }

    if (leadId && method === "DELETE") {
      await deleteLead(leadId, res);
      return;
    }

    if (method === "POST" && path === "/api/leads/import") {
      await importLeads(req, res);
      return;
    }

    sendJson(res, 404, { error: `API route not implemented: ${method} ${path}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, { error: message });
  }
}
