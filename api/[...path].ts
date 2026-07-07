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
  id: number | string;
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

type SequenceInput = {
  name?: string;
  status?: string;
  emailAccountId?: number | null;
};

type SequenceRow = {
  id: number | string;
  name: string;
  status?: string | null;
  email_account_id?: number | null;
  total_enrolled?: number | null;
  total_sent?: number | null;
  total_opened?: number | null;
  total_replied?: number | null;
  created_at?: string;
  updated_at?: string;
};

type SequenceStepInput = {
  stepNumber?: number;
  subject?: string;
  body?: string;
  delayDays?: number;
};

type SequenceStepRow = {
  id: number | string;
  sequence_id: number | string;
  step_number: number;
  subject: string;
  body: string;
  delay_days?: number | null;
  created_at?: string;
  updated_at?: string;
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY ??
  process.env.SUPABASE_SECRET_KEY ??
  process.env.SUPABASE_SERVICE_ROLE;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const supabaseKey = supabaseServiceRoleKey ?? supabaseAnonKey;
const hasServiceRole = Boolean(supabaseServiceRoleKey);
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
let sequenceSchemaReady = false;

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
  if (typeof req.body === "string") {
    return req.body.trim() ? JSON.parse(req.body) : {};
  }

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

function leadInsertPayload(lead: ReturnType<typeof normalizeLead>) {
  return {
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    phone: lead.phone ?? "",
  };
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

function getHeader(req: VercelRequest, name: string) {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

async function supabaseRest(path: string, init: FetchInit, req?: VercelRequest) {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase server environment is not configured");
  }

  const inboundAuth = req ? getHeader(req, "authorization") : undefined;
  const authorization = hasServiceRole
    ? `Bearer ${supabaseKey}`
    : inboundAuth;

  if (!authorization) {
    throw new Error("Missing Supabase user token");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseKey,
      authorization,
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

async function ensureSequenceTables() {
  if (sequenceSchemaReady) return;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "Production database is missing the sequence tables and DATABASE_URL is not configured, so the API cannot create them automatically.",
    );
  }

  // @ts-ignore - pg is installed in the workspace for production, but this standalone check runs without linked package types.
  const pgModule = await import("pg");
  const Pool = pgModule.default?.Pool ?? pgModule.Pool;
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });

  try {
    await pool.query(`create extension if not exists "pgcrypto"`);
    await pool.query(`
      create table if not exists public.sequences (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        status text not null default 'draft',
        email_account_id uuid null,
        total_enrolled integer not null default 0,
        total_sent integer not null default 0,
        total_opened integer not null default 0,
        total_replied integer not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
    await pool.query(`
      create table if not exists public.sequence_steps (
        id uuid primary key default gen_random_uuid(),
        sequence_id uuid not null references public.sequences(id) on delete cascade,
        step_number integer not null,
        subject text not null,
        body text not null,
        delay_days integer not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);
    await pool.query(`
      create table if not exists public.sequence_enrollments (
        id uuid primary key default gen_random_uuid(),
        sequence_id uuid not null references public.sequences(id) on delete cascade,
        lead_id uuid not null,
        current_step integer not null default 1,
        status text not null default 'active',
        next_send_at timestamptz null,
        completed_at timestamptz null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique(sequence_id, lead_id)
      )
    `);
    await pool.query(`notify pgrst, 'reload schema'`);
    sequenceSchemaReady = true;
  } finally {
    await pool.end();
  }
}

function getLeadId(path: string) {
  const match = path.match(/^\/api\/leads\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getSequenceId(path: string) {
  const match = path.match(/^\/api\/sequences\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getSequenceStepsMatch(path: string) {
  const match = path.match(/^\/api\/sequences\/([^/]+)\/steps(?:\/([^/]+))?$/);
  if (!match) return null;
  return {
    sequenceId: decodeURIComponent(match[1] ?? ""),
    stepId: match[2] ? decodeURIComponent(match[2]) : null,
  };
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
      `(first_name.ilike.*${search}*,last_name.ilike.*${search}*,email.ilike.*${search}*)`,
    );
  }

  const rows = (await supabaseRest(`leads?${query.toString()}`, {
    method: "GET",
    headers: { prefer: "count=exact" },
  }, req)) as LeadRow[];

  sendJson(res, 200, {
    leads: rows.map(leadFromRow),
    total: rows.length,
    page,
    limit,
  });
}

async function getLead(id: string, req: VercelRequest, res: VercelResponse) {
  const rows = (await supabaseRest(`leads?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, {
    method: "GET",
  }, req)) as LeadRow[];
  if (!rows[0]) {
    sendJson(res, 404, { error: "Lead not found" });
    return;
  }
  sendJson(res, 200, leadFromRow(rows[0]));
}

async function insertActivities(leads: Array<{ id?: number | string }>, req: VercelRequest) {
  const activities = leads
    .filter((lead) => typeof lead.id === "number" || typeof lead.id === "string")
    .map((lead) => ({
      lead_id: lead.id,
      type: "imported",
      description: "Lead imported via CSV",
    }));

  if (activities.length > 0) {
    try {
      await supabaseRest("activities", {
        method: "POST",
        body: JSON.stringify(activities),
      }, req);
    } catch (error) {
      console.warn("Activity logging skipped", error);
    }
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
    body: JSON.stringify(leadInsertPayload(lead)),
  }, req)) as LeadRow[];

  await insertActivities(inserted, req);
  sendJson(res, 201, inserted[0] ? leadFromRow(inserted[0]) : null);
}

async function updateLead(id: string, req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as LeadInput;
  const update = normalizeLead(body);

  for (const key of Object.keys(update) as Array<keyof typeof update>) {
    if (update[key] === null || update[key] === undefined) {
      delete update[key];
    }
  }

  const rows = (await supabaseRest(`leads?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(leadInsertPayload(update)),
  }, req)) as LeadRow[];

  if (!rows[0]) {
    sendJson(res, 404, { error: "Lead not found" });
    return;
  }

  sendJson(res, 200, leadFromRow(rows[0]));
}

async function deleteLead(id: string, req: VercelRequest, res: VercelResponse) {
  try {
    await supabaseRest(`activities?lead_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, req);
  } catch (error) {
    console.warn("Activity cleanup skipped", error);
  }
  await supabaseRest(`leads?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, req);
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
    body: JSON.stringify(valid.map(leadInsertPayload)),
  }, req)) as Array<{ id?: number }>;

  await insertActivities(inserted, req);
  sendJson(res, 200, {
    imported: inserted.length,
    failed: incoming.length - inserted.length,
    total: incoming.length,
    errors,
  });
}

function sequenceFromRow(row: SequenceRow) {
  return {
    id: row.id,
    name: row.name,
    status: row.status ?? "draft",
    emailAccountId: row.email_account_id ?? null,
    totalEnrolled: row.total_enrolled ?? 0,
    totalSent: row.total_sent ?? 0,
    totalOpened: row.total_opened ?? 0,
    totalReplied: row.total_replied ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sequencePayload(input: SequenceInput) {
  const payload: Record<string, unknown> = {};
  if (typeof input.name === "string") payload.name = input.name.trim();
  if (typeof input.status === "string") payload.status = input.status;
  if (input.emailAccountId !== undefined) payload.email_account_id = input.emailAccountId;
  return payload;
}

async function listSequences(req: VercelRequest, res: VercelResponse) {
  await ensureSequenceTables();
  const rows = (await supabaseRest("sequences?select=*&order=created_at.desc", {
    method: "GET",
  }, req)) as SequenceRow[];
  sendJson(res, 200, rows.map(sequenceFromRow));
}

async function createSequence(req: VercelRequest, res: VercelResponse) {
  await ensureSequenceTables();
  const body = (await readJson(req)) as SequenceInput;
  const payload = sequencePayload(body);
  if (!payload.name) {
    sendJson(res, 400, { error: "Sequence name is required" });
    return;
  }

  const rows = (await supabaseRest("sequences", {
    method: "POST",
    body: JSON.stringify(payload),
  }, req)) as SequenceRow[];
  sendJson(res, 201, rows[0] ? sequenceFromRow(rows[0]) : null);
}

async function getSequence(id: string, req: VercelRequest, res: VercelResponse) {
  await ensureSequenceTables();
  const [rows, stepRows] = await Promise.all([
    supabaseRest(`sequences?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, {
      method: "GET",
    }, req) as Promise<SequenceRow[]>,
    supabaseRest(`sequence_steps?sequence_id=eq.${encodeURIComponent(id)}&select=*&order=step_number.asc`, {
      method: "GET",
    }, req) as Promise<SequenceStepRow[]>,
  ]);

  if (!rows[0]) {
    sendJson(res, 404, { error: "Sequence not found" });
    return;
  }

  sendJson(res, 200, {
    ...sequenceFromRow(rows[0]),
    steps: stepRows.map(sequenceStepFromRow),
  });
}

async function updateSequence(id: string, req: VercelRequest, res: VercelResponse) {
  await ensureSequenceTables();
  const body = (await readJson(req)) as SequenceInput;
  const payload = sequencePayload(body);
  const rows = (await supabaseRest(`sequences?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, req)) as SequenceRow[];
  if (!rows[0]) {
    sendJson(res, 404, { error: "Sequence not found" });
    return;
  }
  sendJson(res, 200, sequenceFromRow(rows[0]));
}

async function deleteSequence(id: string, req: VercelRequest, res: VercelResponse) {
  await ensureSequenceTables();
  await supabaseRest(`sequence_steps?sequence_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, req);
  await supabaseRest(`sequence_enrollments?sequence_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, req);
  await supabaseRest(`sequences?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, req);
  res.statusCode = 204;
  res.end();
}

function sequenceStepFromRow(row: SequenceStepRow) {
  return {
    id: row.id,
    sequenceId: row.sequence_id,
    stepNumber: row.step_number,
    subject: row.subject,
    body: row.body,
    delayDays: row.delay_days ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sequenceStepPayload(input: SequenceStepInput, sequenceId: string) {
  return {
    sequence_id: sequenceId,
    step_number: input.stepNumber ?? 1,
    subject: input.subject?.trim() ?? "",
    body: input.body?.trim() ?? "",
    delay_days: input.delayDays ?? 0,
  };
}

async function listSequenceSteps(sequenceId: string, req: VercelRequest, res: VercelResponse) {
  await ensureSequenceTables();
  const rows = (await supabaseRest(`sequence_steps?sequence_id=eq.${encodeURIComponent(sequenceId)}&select=*&order=step_number.asc`, {
    method: "GET",
  }, req)) as SequenceStepRow[];
  sendJson(res, 200, rows.map(sequenceStepFromRow));
}

async function createSequenceStep(sequenceId: string, req: VercelRequest, res: VercelResponse) {
  await ensureSequenceTables();
  const body = (await readJson(req)) as SequenceStepInput;
  const payload = sequenceStepPayload(body, sequenceId);
  if (!payload.subject || !payload.body) {
    sendJson(res, 400, { error: "Step subject and body are required" });
    return;
  }
  const rows = (await supabaseRest("sequence_steps", {
    method: "POST",
    body: JSON.stringify(payload),
  }, req)) as SequenceStepRow[];
  sendJson(res, 201, rows[0] ? sequenceStepFromRow(rows[0]) : null);
}

async function updateSequenceStep(stepId: string, req: VercelRequest, res: VercelResponse) {
  await ensureSequenceTables();
  const body = (await readJson(req)) as SequenceStepInput;
  const payload: Record<string, unknown> = {};
  if (body.stepNumber !== undefined) payload.step_number = body.stepNumber;
  if (body.subject !== undefined) payload.subject = body.subject.trim();
  if (body.body !== undefined) payload.body = body.body.trim();
  if (body.delayDays !== undefined) payload.delay_days = body.delayDays;
  const rows = (await supabaseRest(`sequence_steps?id=eq.${encodeURIComponent(stepId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, req)) as SequenceStepRow[];
  if (!rows[0]) {
    sendJson(res, 404, { error: "Sequence step not found" });
    return;
  }
  sendJson(res, 200, sequenceStepFromRow(rows[0]));
}

async function deleteSequenceStep(stepId: string, req: VercelRequest, res: VercelResponse) {
  await ensureSequenceTables();
  await supabaseRest(`sequence_steps?id=eq.${encodeURIComponent(stepId)}`, { method: "DELETE" }, req);
  res.statusCode = 204;
  res.end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const path = pathFromUrl(req.url);
    const method = (req.method ?? "GET").toUpperCase();

    if (path === "/api/healthz") {
      sendJson(res, 200, {
        status: "ok",
        supabaseConfigured: Boolean(supabaseUrl && supabaseKey),
        supabaseServiceRoleConfigured: hasServiceRole,
        databaseUrlConfigured: hasDatabaseUrl,
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
      await getLead(leadId, req, res);
      return;
    }

    if (leadId && method === "PATCH") {
      await updateLead(leadId, req, res);
      return;
    }

    if (leadId && method === "DELETE") {
      await deleteLead(leadId, req, res);
      return;
    }

    if (method === "POST" && path === "/api/leads/import") {
      await importLeads(req, res);
      return;
    }

    if (method === "GET" && path === "/api/sequences") {
      await listSequences(req, res);
      return;
    }

    if (method === "POST" && path === "/api/sequences") {
      await createSequence(req, res);
      return;
    }

    const sequenceStepsMatch = getSequenceStepsMatch(path);
    if (sequenceStepsMatch && !sequenceStepsMatch.stepId && method === "GET") {
      await listSequenceSteps(sequenceStepsMatch.sequenceId, req, res);
      return;
    }

    if (sequenceStepsMatch && !sequenceStepsMatch.stepId && method === "POST") {
      await createSequenceStep(sequenceStepsMatch.sequenceId, req, res);
      return;
    }

    if (sequenceStepsMatch?.stepId && method === "PUT") {
      await updateSequenceStep(sequenceStepsMatch.stepId, req, res);
      return;
    }

    if (sequenceStepsMatch?.stepId && method === "DELETE") {
      await deleteSequenceStep(sequenceStepsMatch.stepId, req, res);
      return;
    }

    const sequenceId = getSequenceId(path);
    if (sequenceId && method === "GET") {
      await getSequence(sequenceId, req, res);
      return;
    }

    if (sequenceId && method === "PUT") {
      await updateSequence(sequenceId, req, res);
      return;
    }

    if (sequenceId && method === "DELETE") {
      await deleteSequence(sequenceId, req, res);
      return;
    }

    sendJson(res, 404, { error: `API route not implemented: ${method} ${path}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("row-level security policy")) {
      sendJson(res, 403, {
        error:
          "Supabase RLS blocked this write. Configure SUPABASE_SERVICE_ROLE_KEY for server writes or add an insert policy for authenticated users.",
        supabaseServiceRoleConfigured: hasServiceRole,
      });
      return;
    }
    if (
      message.includes("missing the sequence tables") ||
      message.includes("Could not find the table 'public.sequences'")
    ) {
      sendJson(res, 503, {
        error:
          "Sequence tables are missing in Supabase. Configure DATABASE_URL in production and redeploy, or run the database schema push against the Supabase Postgres URL.",
        databaseUrlConfigured: hasDatabaseUrl,
      });
      return;
    }
    sendJson(res, 500, { error: message });
  }
}
