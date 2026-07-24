import crypto from "node:crypto";

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
  disposition?: string;
  contactAttempts?: number;
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
  disposition: string | null;
  contact_attempts: number;
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

type ResourceConfig = {
  table: string;
  defaultOrder?: string;
  defaults?: Record<string, unknown>;
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
let legacyDemoDataChecked = false;

const badLeadSources = new Set(["mcgrawno", "mcgraw no", "mcgraw", "unknown", "n/a", "na", "-"]);

function sendJson(res: VercelResponse, statusCode: number, data: unknown) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function pathFromUrl(url = "/") {
  return new URL(url, "https://local.invalid").pathname.replace(/^\/leadgen(?=\/api\/)/, "");
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
  const source = lead.source?.trim();
  return {
    first_name: lead.firstName?.trim(),
    last_name: lead.lastName?.trim(),
    email: lead.email?.trim(),
    phone: lead.phone?.trim() || "",
    company: lead.company?.trim() || null,
    title: lead.title?.trim() || null,
    source: source && !badLeadSources.has(source.toLowerCase()) ? source : null,
    status: lead.status?.trim() || "new",
    disposition: lead.disposition?.trim() || null,
    contact_attempts: Number.isFinite(lead.contactAttempts) ? Math.max(0, Number(lead.contactAttempts)) : 0,
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
    phone: lead.phone,
    company: lead.company,
    title: lead.title,
    source: lead.source,
    status: lead.status,
    disposition: lead.disposition,
    contact_attempts: lead.contact_attempts,
    score: lead.score,
    campaign_id: lead.campaign_id,
    form_id: lead.form_id,
    pipeline_stage_id: lead.pipeline_stage_id,
    tags: lead.tags,
    custom_fields: lead.custom_fields,
  };
}

function leadUpdatePayload(lead: LeadInput) {
  const payload: Record<string, unknown> = {};
  if (lead.firstName !== undefined) payload.first_name = lead.firstName.trim();
  if (lead.lastName !== undefined) payload.last_name = lead.lastName.trim();
  if (lead.email !== undefined) payload.email = lead.email.trim();
  if (lead.phone !== undefined) payload.phone = lead.phone?.trim() || null;
  if (lead.company !== undefined) payload.company = lead.company?.trim() || null;
  if (lead.title !== undefined) payload.title = lead.title?.trim() || null;
  if (lead.source !== undefined) {
    const source = lead.source?.trim();
    payload.source = source && !badLeadSources.has(source.toLowerCase()) ? source : null;
  }
  if (lead.status !== undefined) payload.status = lead.status.trim();
  if (lead.disposition !== undefined) payload.disposition = lead.disposition.trim() || null;
  if (lead.contactAttempts !== undefined) payload.contact_attempts = Math.max(0, Number(lead.contactAttempts));
  if (lead.score !== undefined) payload.score = lead.score;
  if (lead.campaignId !== undefined) payload.campaign_id = lead.campaignId;
  if (lead.formId !== undefined) payload.form_id = lead.formId;
  if (lead.pipelineStageId !== undefined) payload.pipeline_stage_id = lead.pipelineStageId;
  if (lead.tags !== undefined) payload.tags = Array.isArray(lead.tags) ? lead.tags : [];
  if (lead.customFields !== undefined) payload.custom_fields = lead.customFields ?? {};
  return payload;
}

function leadFromRow(row: LeadRow) {
  const source = row.source?.trim();
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    title: row.title,
    source: source && !badLeadSources.has(source.toLowerCase()) ? source : null,
    status: row.status,
    disposition: row.disposition,
    contactAttempts: row.contact_attempts ?? 0,
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

type AuthenticatedUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

function orgIdFromUser(user: AuthenticatedUser) {
  const sources = [user.user_metadata ?? {}, user.app_metadata ?? {}];
  for (const source of sources) {
    const value = source.org_id ?? source.organization_id ?? source.orgId ?? source.organizationId;
    if (typeof value === "string" && value.trim()) return value.trim();
    const organization = source.organization;
    if (organization && typeof organization === "object" && "id" in organization) {
      const nestedId = (organization as { id?: unknown }).id;
      if (typeof nestedId === "string" && nestedId.trim()) return nestedId.trim();
    }
  }
  return null;
}

type DashboardMembership = {
  org_id?: string | null;
  role?: string | null;
};

function normalizeDashboardRole(role: unknown) {
  const value = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (value === "org_owner" || value === "owner") return "owner";
  if (value === "org_admin" || value === "admin") return "admin";
  if (value === "agent") return "agent";
  if (value === "viewer") return "viewer";
  return "member";
}

function legacyCompatibleTeamRole(role: unknown) {
  const normalized = normalizeDashboardRole(role);
  if (normalized === "owner" || normalized === "admin") return "admin";
  if (normalized === "agent") return "agent";
  return "manager";
}

async function insertTeamMember(payload: Record<string, unknown>, req: VercelRequest) {
  const attempts: Array<Record<string, unknown>> = [payload];
  const attempted = new Set<string>();
  let lastError: unknown;
  while (attempts.length) {
    const candidate = attempts.shift()!;
    const signature = JSON.stringify(candidate);
    if (attempted.has(signature)) continue;
    attempted.add(signature);
    try {
      return await supabaseRest("team_members", {
        method: "POST",
        body: signature,
      }, req) as Array<Record<string, unknown>>;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("'user_id' column") || message.includes("column team_members.user_id does not exist")) {
        const withoutLegacyUserId = { ...candidate };
        delete withoutLegacyUserId.user_id;
        attempts.push(withoutLegacyUserId);
      }
      if (message.includes("team_members_role_check") || message.includes("violates check constraint")) {
        attempts.push({ ...candidate, role: legacyCompatibleTeamRole(candidate.role) });
      }
    }
  }
  throw lastError;
}

async function resolveDashboardMembership(user: AuthenticatedUser, req: VercelRequest, requestedOrgId?: string | null): Promise<DashboardMembership> {
  if (requestedOrgId) {
    for (const table of ["org_users", "org_members"]) {
      try {
        const memberships = await supabaseRest(
          `${table}?user_id=eq.${encodeURIComponent(user.id)}&org_id=eq.${encodeURIComponent(requestedOrgId)}&select=org_id,role&limit=1`,
          { method: "GET" },
          req,
        ) as DashboardMembership[];
        if (memberships[0]?.org_id) return memberships[0];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("Could not find the table") && !message.includes("schema cache")) throw error;
      }
    }
    throw new Error("Your VictorySync account is not a member of the selected organization");
  }
  const metadataOrgId = orgIdFromUser(user);
  const metadataRole = user.user_metadata?.role ?? user.app_metadata?.role;
  if (metadataOrgId) return { org_id: metadataOrgId, role: normalizeDashboardRole(metadataRole) };
  const rows = await supabaseRest(
    `team_members?or=(auth_user_id.eq.${encodeURIComponent(user.id)},user_id.eq.${encodeURIComponent(user.id)})&select=org_id,role&limit=1`,
    { method: "GET" },
    req,
  ) as DashboardMembership[];
  if (rows[0]?.org_id) return rows[0];

  for (const table of ["org_users", "org_members"]) {
    try {
      const memberships = await supabaseRest(
        `${table}?user_id=eq.${encodeURIComponent(user.id)}&select=org_id,role&limit=1`,
        { method: "GET" },
        req,
      ) as DashboardMembership[];
      if (memberships[0]?.org_id) return memberships[0];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Could not find the table") && !message.includes("schema cache")) throw error;
    }
  }
  return {};
}

async function resolveUserOrgId(user: AuthenticatedUser, req: VercelRequest) {
  return (await resolveDashboardMembership(user, req)).org_id ?? null;
}

async function ensureOrganization(orgId: string, user: AuthenticatedUser | null, req: VercelRequest) {
  const rows = await supabaseRest(
    `organizations?id=eq.${encodeURIComponent(orgId)}&select=id&limit=1`,
    { method: "GET" },
    req,
  ) as Array<{ id?: string }>;
  if (rows.length) return;

  const metadata = user?.user_metadata ?? {};
  const organization = metadata.organization;
  const nestedName = organization && typeof organization === "object" && "name" in organization
    ? (organization as { name?: unknown }).name
    : null;
  const requestedName = metadata.organization_name ?? metadata.org_name ?? metadata.company_name ?? nestedName;
  const name = typeof requestedName === "string" && requestedName.trim()
    ? requestedName.trim()
    : `VictorySync Organization ${orgId.slice(0, 8)}`;
  await supabaseRest("organizations", {
    method: "POST",
    body: JSON.stringify({ id: orgId, name }),
    headers: { prefer: "resolution=ignore-duplicates,return=representation" },
  }, req);
}

function apiPermissionForPath(path: string) {
  const routes: Array<[RegExp, string]> = [
    [/^\/api\/(?:sub-accounts|white-label)/, "client-accounts"],
    [/^\/api\/team/, "team"],
    [/^\/api\/leads\/import/, "imports"],
    [/^\/api\/(?:leads|activities|notes|tasks)/, "contacts"],
    [/^\/api\/segments/, "segments"],
    [/^\/api\/email\/(?:send|logs)/, "conversations"],
    [/^\/api\/(?:pipelines|pipeline)/, "pipeline"],
    [/^\/api\/(?:prospects|scraper)/, "prospecting"],
    [/^\/api\/meeting/, "calendar"],
    [/^\/api\/sequences/, "sequences"],
    [/^\/api\/campaigns/, "campaigns"],
    [/^\/api\/(?:email-templates|email-accounts)/, "email"],
    [/^\/api\/social/, "social"],
    [/^\/api\/automation/, "automation"],
    [/^\/api\/forms/, "forms"],
    [/^\/api\/(?:integrations|webhooks|oauth)/, "integrations"],
    [/^\/api\/reviews/, "reputation"],
    [/^\/api\/(?:analytics|revenue)/, "reporting"],
    [/^\/api\/(?:affiliates|referrals)/, "affiliates"],
    [/^\/api\/(?:api-keys|onboarding)/, "settings"],
  ];
  return routes.find(([pattern]) => pattern.test(path))?.[1];
}

async function authenticateRequest(req: VercelRequest): Promise<AuthenticatedUser> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase authentication environment is not configured");
  }
  const authorization = getHeader(req, "authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    throw new Error("Authentication required");
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, authorization },
  });
  if (!response.ok) throw new Error("Your session is invalid or has expired");
  return await response.json() as AuthenticatedUser;
}

async function syncDashboardTeamMember(user: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const body = await readJson(req) as { orgId?: unknown };
  const requestedOrgId = typeof body.orgId === "string" && body.orgId.trim() ? body.orgId.trim() : null;
  const email = String(user.email ?? "").trim().toLowerCase();
  if (!email) {
    sendJson(res, 400, { message: "The dashboard session does not include an email address" });
    return;
  }
  const metadata = user.user_metadata ?? {};
  const dashboardMembership = await resolveDashboardMembership(user, req, requestedOrgId);
  const orgId = dashboardMembership.org_id ?? null;
  const byAuthId = await supabaseRest(
    `team_members?or=(auth_user_id.eq.${encodeURIComponent(user.id)},user_id.eq.${encodeURIComponent(user.id)})&select=*&limit=1`,
    { method: "GET" },
    req,
  ) as Array<Record<string, unknown>>;
  const byEmail = byAuthId.length ? [] : await supabaseRest(
    `team_members?${orgId ? `org_id=eq.${encodeURIComponent(orgId)}&` : ""}email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
    { method: "GET" },
    req,
  ) as Array<Record<string, unknown>>;
  const existing = byAuthId[0] ?? byEmail[0];
  const dashboardName = String(metadata.full_name ?? metadata.name ?? email.split("@")[0] ?? "Team member").trim();
  if (existing?.org_id && orgId && String(existing.org_id) !== orgId) {
    sendJson(res, 403, { message: "This VictorySync user belongs to a different organization" });
    return;
  }

  let member: Record<string, unknown>;
  if (existing?.id) {
    const identityUpdate: Record<string, unknown> = { auth_user_id: user.id };
    if ("user_id" in existing) identityUpdate.user_id = user.id;
    const rows = await supabaseRest(`team_members?id=eq.${encodeURIComponent(String(existing.id))}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...identityUpdate,
        name: existing.name || dashboardName,
        status: "active",
        updated_at: new Date().toISOString(),
      }),
    }, req) as Array<Record<string, unknown>>;
    member = rows[0] ?? existing;
  } else {
    if (!orgId) {
      sendJson(res, 400, { message: "The VictorySync dashboard session is missing an organization ID" });
      return;
    }
    await ensureOrganization(orgId, user, req);
    const anyMembers = await supabaseRest(
      `team_members?org_id=eq.${encodeURIComponent(orgId)}&select=id&limit=1`,
      { method: "GET" },
      req,
    ) as Array<{ id: string | number }>;
    const dashboardRole = dashboardMembership.role
      ? normalizeDashboardRole(dashboardMembership.role)
      : typeof metadata.role === "string" && metadata.role
      ? normalizeDashboardRole(metadata.role)
      : anyMembers.length === 0 ? "owner" : "member";
    const rows = await insertTeamMember({
        auth_user_id: user.id,
        user_id: user.id,
        name: dashboardName,
        email,
        org_id: orgId,
        role: dashboardRole,
        status: "active",
        client_account_id: typeof metadata.client_account_id === "string" ? metadata.client_account_id : null,
        page_permissions: Array.isArray(metadata.page_permissions) ? metadata.page_permissions : null,
      }, req);
    member = rows[0] ?? {};
  }

  if (supabaseUrl && supabaseServiceRoleKey && member.id) {
    const mergedMetadata = {
      ...metadata,
      role: member.role ?? metadata.role ?? "member",
      client_account_id: member.client_account_id ?? metadata.client_account_id ?? null,
      page_permissions: Array.isArray(member.page_permissions) ? member.page_permissions : metadata.page_permissions ?? null,
      team_member_id: member.id,
      org_id: member.org_id ?? orgId,
      status: "active",
    };
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: "PUT",
      headers: {
        apikey: supabaseServiceRoleKey,
        authorization: `Bearer ${supabaseServiceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ user_metadata: mergedMetadata }),
    });
    if (!response.ok) throw new Error("Unable to synchronize dashboard access metadata");
  }
  sendJson(res, 200, { member: toCamelValue(member) });
}

async function syncOrganizationDashboardMembers(orgId: string, req: VercelRequest) {
  if (!supabaseUrl || !supabaseServiceRoleKey) return;
  await ensureOrganization(orgId, null, req);
  let memberships: Array<Record<string, unknown>> = [];
  for (const table of ["org_users", "org_members"]) {
    try {
      const rows = await supabaseRest(
        `${table}?org_id=eq.${encodeURIComponent(orgId)}&select=*&limit=500`,
        { method: "GET" },
        req,
      ) as Array<Record<string, unknown>>;
      memberships = [...memberships, ...rows];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Could not find the table") && !message.includes("schema cache")) throw error;
    }
  }

  const uniqueMemberships = Array.from(new Map(
    memberships
      .filter((membership) => typeof membership.user_id === "string" && membership.user_id)
      .map((membership) => [String(membership.user_id), membership]),
  ).values());
  if (!uniqueMemberships.length) return;

  const authIds = uniqueMemberships.map((membership) => String(membership.user_id));
  const existing = await supabaseRest(
    `team_members?org_id=eq.${encodeURIComponent(orgId)}&or=(auth_user_id.in.(${authIds.map(encodeURIComponent).join(",")}),user_id.in.(${authIds.map(encodeURIComponent).join(",")}))&select=auth_user_id,user_id`,
    { method: "GET" },
    req,
  ) as Array<{ auth_user_id?: string | null; user_id?: string | null }>;
  const existingIds = new Set(existing.flatMap((member) => [member.auth_user_id, member.user_id]).filter(Boolean));

  for (const membership of uniqueMemberships) {
    const authUserId = String(membership.user_id);
    if (existingIds.has(authUserId)) continue;
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
      headers: {
        apikey: supabaseServiceRoleKey,
        authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    });
    if (!response.ok) continue;
    const dashboardUser = await response.json() as AuthenticatedUser;
    const email = String(dashboardUser.email ?? membership.email ?? "").trim().toLowerCase();
    if (!email) continue;
    const metadata = dashboardUser.user_metadata ?? {};
    const name = String(metadata.full_name ?? metadata.name ?? membership.name ?? email.split("@")[0]).trim();
    const duplicateEmail = await supabaseRest(
      `team_members?org_id=eq.${encodeURIComponent(orgId)}&email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
      { method: "GET" },
      req,
    ) as Array<{ id?: string }>;
    if (duplicateEmail.length) continue;
    await insertTeamMember({
        auth_user_id: authUserId,
        user_id: authUserId,
        org_id: orgId,
        name,
        email,
        role: normalizeDashboardRole(membership.role ?? metadata.role),
        status: "active",
        client_account_id: typeof metadata.client_account_id === "string" ? metadata.client_account_id : null,
        page_permissions: Array.isArray(metadata.page_permissions) ? metadata.page_permissions : null,
      }, req);
  }
}

async function listTeamMembers(currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const orgId = await resolveUserOrgId(currentUser, req);
  if (!orgId) {
    sendJson(res, 400, { message: "Your dashboard session is missing an organization ID" });
    return;
  }
  await syncOrganizationDashboardMembers(orgId, req);
  const rows = await supabaseRest(
    `team_members?org_id=eq.${encodeURIComponent(orgId)}&select=*&order=created_at.desc`,
    { method: "GET" },
    req,
  ) as Array<Record<string, unknown>>;
  sendJson(res, 200, rows.map(toCamelValue));
}

async function signupWithInvite(req: VercelRequest, res: VercelResponse) {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    sendJson(res, 503, { message: "Invited-user signup requires the Supabase service role key" });
    return;
  }
  const body = await readJson(req) as Record<string, unknown>;
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const inviteCode = String(body.inviteCode ?? "").trim();
  if (!name || !email || password.length < 8 || !inviteCode) {
    sendJson(res, 400, { message: "Name, email, an 8-character password, and invite code are required" });
    return;
  }

  const codeHash = crypto.createHash("sha256").update(inviteCode).digest("hex");
  const invites = await supabaseRest(
    `invite_codes?code_hash=eq.${codeHash}&used_at=is.null&select=*&limit=1`,
    { method: "GET" },
  ) as Array<Record<string, unknown>>;
  const invite = invites[0];
  if (!invite || String(invite.email ?? "").toLowerCase() !== email) {
    sendJson(res, 400, { message: "This invite code is invalid or belongs to another email address" });
    return;
  }
  if (invite.expires_at && new Date(String(invite.expires_at)).getTime() <= Date.now()) {
    sendJson(res, 400, { message: "This invite has expired. Ask an administrator to resend it." });
    return;
  }

  const teamId = String(invite.team_member_id ?? "");
  const members = await supabaseRest(
    `team_members?id=eq.${encodeURIComponent(teamId)}&select=*&limit=1`,
    { method: "GET" },
  ) as Array<Record<string, unknown>>;
  const member = members[0];
  if (!member) {
    sendJson(res, 409, { message: "The team member linked to this invite is missing" });
    return;
  }

  const metadata = {
    name,
    role: member.role ?? invite.role ?? "viewer",
    client_account_id: member.client_account_id ?? invite.client_account_id ?? null,
    team_member_id: teamId,
    org_id: member.org_id ?? invite.org_id ?? null,
    page_permissions: Array.isArray(member.page_permissions) ? member.page_permissions : null,
  };
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: supabaseServiceRoleKey,
      authorization: `Bearer ${supabaseServiceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: metadata }),
  });
  const authData = await authResponse.json() as Record<string, unknown>;
  if (!authResponse.ok) {
    sendJson(res, authResponse.status, { message: String(authData.msg ?? authData.message ?? "Unable to create user") });
    return;
  }
  const userId = String(authData.id ?? "");
  await supabaseRest(`invite_codes?id=eq.${encodeURIComponent(String(invite.id))}`, {
    method: "PATCH",
    body: JSON.stringify({ used_at: new Date().toISOString(), used_by_user_id: userId }),
  });
  await supabaseRest(`team_members?id=eq.${encodeURIComponent(teamId)}`, {
    method: "PATCH",
    body: JSON.stringify({ name, auth_user_id: userId, status: "active", updated_at: new Date().toISOString() }),
  });
  sendJson(res, 201, { success: true, userId });
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

async function removeLegacyDemoTemplates(req: VercelRequest) {
  if (legacyDemoDataChecked) return;
  const names = [
    "Welcome Email", "Follow-up After Demo", "Cold Outreach", "Review Request",
    "Appointment Reminder", "Deal Won Confirmation", "Re-engagement",
  ];
  const rows = await supabaseRest(
    `email_templates?is_default=eq.true&select=id,name`,
    { method: "GET" },
    req,
  ) as Array<{ id: string | number; name: string }>;
  const ids = rows.filter((row) => names.includes(row.name)).map((row) => row.id);
  if (ids.length) {
    await supabaseRest(
      `email_templates?id=in.(${ids.map((id) => encodeURIComponent(String(id))).join(",")})`,
      { method: "DELETE" },
      req,
    );
  }
  legacyDemoDataChecked = true;
}

async function ensureSequenceTables() {
  if (sequenceSchemaReady) return;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    sequenceSchemaReady = true;
    return;
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

function getSequenceEnrollMatch(path: string) {
  const match = path.match(/^\/api\/sequences\/([^/]+)\/enroll$/);
  return match ? decodeURIComponent(match[1] ?? "") : null;
}

const resourceConfigs: Record<string, ResourceConfig> = {
  campaigns: { table: "campaigns", defaultOrder: "created_at.desc" },
  "email-accounts": { table: "email_accounts", defaultOrder: "created_at.desc" },
  "email-templates": { table: "email_templates", defaultOrder: "created_at.desc" },
  forms: { table: "forms", defaultOrder: "created_at.desc" },
  integrations: { table: "integrations", defaultOrder: "created_at.desc" },
  webhooks: { table: "webhooks", defaultOrder: "created_at.desc" },
  segments: { table: "segments", defaultOrder: "created_at.desc" },
  automations: { table: "automation_workflows", defaultOrder: "created_at.desc" },
  "review-sources": { table: "review_sources", defaultOrder: "created_at.desc" },
  reviews: { table: "reviews", defaultOrder: "created_at.desc" },
  "review-requests": { table: "review_requests", defaultOrder: "sent_at.desc" },
  prospects: { table: "prospects", defaultOrder: "created_at.desc" },
  dispositions: { table: "dispositions", defaultOrder: "name.asc" },
  affiliates: { table: "affiliates", defaultOrder: "created_at.desc" },
  referrals: { table: "referrals", defaultOrder: "created_at.desc" },
  "api-keys": { table: "api_keys", defaultOrder: "created_at.desc" },
  "sub-accounts": { table: "sub_accounts", defaultOrder: "created_at.desc" },
  team: { table: "team_members", defaultOrder: "created_at.desc" },
  "meeting/event-types": { table: "meeting_event_types", defaultOrder: "created_at.desc" },
  "meeting/appointments": { table: "meeting_appointments", defaultOrder: "start_at.asc" },
  pipelines: { table: "pipelines", defaultOrder: "is_default.desc,created_at.asc" },
  "pipeline/stages": { table: "pipeline_stages", defaultOrder: "position.asc" },
};

function toSnakeKey(key: string) {
  return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function toCamelKey(key: string) {
  return key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function toSnakeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toSnakeValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      toSnakeKey(key),
      toSnakeValue(entry),
    ]),
  );
}

function toCamelValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toCamelValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      toCamelKey(key),
      toCamelValue(entry),
    ]),
  );
}

function stripUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

function genericResourcePath(path: string) {
  const clean = path.replace(/^\/api\//, "");
  const parts = clean.split("/");
  if (parts.length === 1 && resourceConfigs[parts[0]]) {
    return { key: parts[0], id: null, action: null };
  }
  if (parts.length === 2 && resourceConfigs[parts[0]]) {
    return { key: parts[0], id: decodeURIComponent(parts[1]), action: null };
  }
  if (parts.length === 3 && resourceConfigs[parts[0]]) {
    return { key: parts[0], id: decodeURIComponent(parts[1]), action: parts[2] };
  }
  if (parts.length === 2 && resourceConfigs[`${parts[0]}/${parts[1]}`]) {
    return { key: `${parts[0]}/${parts[1]}`, id: null, action: null };
  }
  if (parts.length === 3 && resourceConfigs[`${parts[0]}/${parts[1]}`]) {
    return { key: `${parts[0]}/${parts[1]}`, id: decodeURIComponent(parts[2]), action: null };
  }
  return null;
}

async function listResource(config: ResourceConfig, req: VercelRequest, res: VercelResponse) {
  const query = new URLSearchParams({ select: "*" });
  if (config.defaultOrder) query.set("order", config.defaultOrder);

  const rows = await supabaseRest(`${config.table}?${query.toString()}`, {
    method: "GET",
  }, req);
  sendJson(res, 200, toCamelValue(rows));
}

async function createResource(config: ResourceConfig, req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as Record<string, unknown>;
  const payload = stripUndefined({
    ...(config.defaults ?? {}),
    ...(toSnakeValue(body) as Record<string, unknown>),
  });
  const rows = await supabaseRest(config.table, {
    method: "POST",
    body: JSON.stringify(payload),
  }, req);
  sendJson(res, 201, Array.isArray(rows) ? toCamelValue(rows[0] ?? null) : toCamelValue(rows));
}

async function getResource(config: ResourceConfig, id: string, req: VercelRequest, res: VercelResponse) {
  const rows = await supabaseRest(`${config.table}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, {
    method: "GET",
  }, req);
  const record = Array.isArray(rows) ? rows[0] : null;
  if (!record) {
    sendJson(res, 404, { error: "Record not found" });
    return;
  }
  sendJson(res, 200, toCamelValue(record));
}

async function updateResource(config: ResourceConfig, id: string, req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as Record<string, unknown>;
  const payload = stripUndefined(toSnakeValue(body) as Record<string, unknown>);
  const rows = await supabaseRest(`${config.table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, req);
  sendJson(res, 200, Array.isArray(rows) ? toCamelValue(rows[0] ?? null) : toCamelValue(rows));
}

async function deleteResource(config: ResourceConfig, id: string, req: VercelRequest, res: VercelResponse) {
  await supabaseRest(`${config.table}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
  }, req);
  res.statusCode = 204;
  res.end();
}

async function launchCampaign(id: string, req: VercelRequest, res: VercelResponse) {
  const rows = await supabaseRest(`campaigns?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "active",
      launched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  }, req);
  sendJson(res, 200, Array.isArray(rows) ? toCamelValue(rows[0] ?? null) : toCamelValue(rows));
}

async function getCampaignLeads(id: string, req: VercelRequest, res: VercelResponse) {
  const rows = await supabaseRest(
    `campaign_leads?campaign_id=eq.${encodeURIComponent(id)}&select=*,leads(*)&order=created_at.desc`,
    { method: "GET" },
    req,
  );
  sendJson(res, 200, toCamelValue(rows));
}

async function addCampaignLeads(id: string, req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as { leadIds?: Array<string | number>; leads?: Array<string | number> };
  const leadIds = body.leadIds ?? body.leads ?? [];
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    sendJson(res, 400, { error: "leadIds are required" });
    return;
  }

  const payload = leadIds.map((leadId) => ({
    campaign_id: id,
    lead_id: leadId,
    status: "queued",
  }));
  const rows = await supabaseRest("campaign_leads?on_conflict=campaign_id,lead_id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  }, req);
  sendJson(res, 201, toCamelValue(rows));
}

async function syncIntegration(id: string, req: VercelRequest, res: VercelResponse) {
  const rows = await supabaseRest(`integrations?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      last_synced_at: new Date().toISOString(),
      status: "connected",
      updated_at: new Date().toISOString(),
    }),
  }, req);
  sendJson(res, 200, {
    success: true,
    integration: Array.isArray(rows) ? toCamelValue(rows[0] ?? null) : toCamelValue(rows),
  });
}

async function createApiKey(req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as { name?: string; scopes?: string[] };
  if (!body.name?.trim()) {
    sendJson(res, 400, { error: "API key name is required" });
    return;
  }
  const rawKey = `vsy_${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`;
  const keyPrefix = rawKey.slice(0, 12);
  const rows = await supabaseRest("api_keys", {
    method: "POST",
    body: JSON.stringify({
      name: body.name.trim(),
      key_hash: rawKey,
      key_prefix: keyPrefix,
      scopes: Array.isArray(body.scopes) ? body.scopes : ["read"],
    }),
  }, req);
  const record = Array.isArray(rows) ? toCamelValue(rows[0] ?? null) : toCamelValue(rows);
  sendJson(res, 201, { ...(record as Record<string, unknown>), rawKey });
}

async function getAffiliateStats(req: VercelRequest, res: VercelResponse) {
  const affiliates = (await supabaseRest("affiliates?select=total_referrals,total_converted,total_earned,total_paid", {
    method: "GET",
  }, req)) as Array<Record<string, number | string | null>>;
  const referrals = (await supabaseRest("referrals?select=status,commission,commission_paid", {
    method: "GET",
  }, req)) as Array<Record<string, number | string | boolean | null>>;
  sendJson(res, 200, {
    affiliates: affiliates.length,
    referrals: referrals.length,
    converted: referrals.filter((r) => r.status === "converted").length,
    earned: affiliates.reduce((sum, a) => sum + Number(a.total_earned ?? 0), 0),
    paid: affiliates.reduce((sum, a) => sum + Number(a.total_paid ?? 0), 0),
  });
}

async function handleAffiliateReferrals(affiliateId: string, method: string, req: VercelRequest, res: VercelResponse) {
  if (method === "GET") {
    const rows = await supabaseRest(`referrals?affiliate_id=eq.${encodeURIComponent(affiliateId)}&select=*&order=created_at.desc`, {
      method: "GET",
    }, req);
    sendJson(res, 200, toCamelValue(rows));
    return true;
  }
  if (method === "POST") {
    const body = (await readJson(req)) as Record<string, unknown>;
    const rows = await supabaseRest("referrals", {
      method: "POST",
      body: JSON.stringify({
        ...(toSnakeValue(body) as Record<string, unknown>),
        affiliate_id: affiliateId,
      }),
    }, req);
    sendJson(res, 201, Array.isArray(rows) ? toCamelValue(rows[0] ?? null) : toCamelValue(rows));
    return true;
  }
  return false;
}

async function handleGenericResource(path: string, method: string, req: VercelRequest, res: VercelResponse) {
  const match = genericResourcePath(path);
  if (!match) return false;

  const config = resourceConfigs[match.key];
  if (!config) return false;

  if (match.key === "api-keys" && !match.id && method === "POST") {
    await createApiKey(req, res);
    return true;
  }

  if (match.key === "affiliates" && match.id && match.action === "referrals") {
    return handleAffiliateReferrals(match.id, method, req, res);
  }

  if (match.key === "email-accounts" && match.id && match.action === "set-default" && method === "POST") {
    await supabaseRest("email_accounts", {
      method: "PATCH",
      body: JSON.stringify({ is_default: false }),
    }, req);
    await updateResource(config, match.id, { ...req, body: { isDefault: true } }, res);
    return true;
  }

  if (match.key === "email-accounts" && match.id && match.action === "test" && method === "POST") {
    sendJson(res, 200, { success: true, message: "Mailbox settings saved. SMTP test sending requires provider credentials." });
    return true;
  }

  if (match.key === "webhooks" && match.id && match.action === "test" && method === "POST") {
    sendJson(res, 200, { success: true, ms: 0, status: 200 });
    return true;
  }

  if (match.key === "campaigns" && match.id && match.action === "launch" && method === "POST") {
    await launchCampaign(match.id, req, res);
    return true;
  }

  if (match.key === "campaigns" && match.id && match.action === "leads" && method === "GET") {
    await getCampaignLeads(match.id, req, res);
    return true;
  }

  if (match.key === "campaigns" && match.id && match.action === "leads" && method === "POST") {
    await addCampaignLeads(match.id, req, res);
    return true;
  }

  if (match.key === "integrations" && match.id && match.action === "sync" && method === "POST") {
    await syncIntegration(match.id, req, res);
    return true;
  }

  if (match.key === "reviews" && match.id && match.action === "reply" && method === "PATCH") {
    const body = (await readJson(req)) as { reply?: string };
    await updateResource(config, match.id, {
      ...req,
      body: { reply: body.reply ?? "", repliedAt: new Date().toISOString() },
    }, res);
    return true;
  }

  if (!match.id && method === "GET") {
    await listResource(config, req, res);
    return true;
  }
  if (!match.id && method === "POST") {
    await createResource(config, req, res);
    return true;
  }
  if (match.id && !match.action && method === "GET") {
    await getResource(config, match.id, req, res);
    return true;
  }
  if (match.id && (method === "PATCH" || method === "PUT")) {
    await updateResource(config, match.id, req, res);
    return true;
  }
  if (match.id && method === "DELETE") {
    await deleteResource(config, match.id, req, res);
    return true;
  }

  return false;
}

async function listLeads(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? "/api/leads", "https://local.invalid");
  const page = Math.max(Number(url.searchParams.get("page") ?? "1"), 1);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "50"), 1), 1000);
  const offset = (page - 1) * limit;
  const search = url.searchParams.get("search")?.trim();
  const status = url.searchParams.get("status")?.trim();

  const query = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(limit),
    offset: String(offset),
  });
  const countQuery = new URLSearchParams({ select: "id" });
  if (status) query.set("status", `eq.${status}`);
  if (status) countQuery.set("status", `eq.${status}`);
  if (search) {
    const searchFilter = `(first_name.ilike.*${search}*,last_name.ilike.*${search}*,email.ilike.*${search}*,company.ilike.*${search}*)`;
    query.set("or", searchFilter);
    countQuery.set("or", searchFilter);
  }

  const [rows, countRows] = await Promise.all([
    supabaseRest(`leads?${query.toString()}`, { method: "GET" }, req) as Promise<LeadRow[]>,
    supabaseRest(`leads?${countQuery.toString()}`, { method: "GET" }, req) as Promise<Array<{ id: string | number }>>,
  ]);

  sendJson(res, 200, {
    leads: rows.map(leadFromRow),
    total: countRows.length,
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
  const update = leadUpdatePayload(body);

  const rows = (await supabaseRest(`leads?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(update),
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

async function createSubAccount(req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const ownerName = typeof body.ownerName === "string" ? body.ownerName.trim() : "";
  const ownerEmail = typeof body.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";
  if (!name || !ownerName || !ownerEmail.includes("@")) {
    sendJson(res, 400, { error: "Business name, owner name, and a valid owner email are required" });
    return;
  }
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
  const payload = {
    ...(toSnakeValue(body) as Record<string, unknown>),
    name,
    slug: `${baseSlug}-${crypto.randomBytes(2).toString("hex")}`,
    owner_name: ownerName,
    owner_email: ownerEmail,
    status: body.status ?? "active",
    plan: body.plan ?? "starter",
  };
  const rows = await supabaseRest("sub_accounts", { method: "POST", body: JSON.stringify(payload) }, req) as Array<Record<string, unknown>>;
  const account = rows[0];
  if (account?.id) {
    await supabaseRest("white_label_settings", {
      method: "POST",
      body: JSON.stringify({ sub_account_id: account.id, brand_name: "VictorySync" }),
      headers: { prefer: "resolution=ignore-duplicates,return=representation" },
    }, req);
  }
  sendJson(res, 201, toCamelValue(account));
}

async function createTeamInvite(currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as { name?: string; email?: string; role?: string; clientAccountId?: string | null; pagePermissions?: string[] };
  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const role = body.role ?? "member";
  if (!name || !email.includes("@")) { sendJson(res, 400, { error: "Name and a valid email are required" }); return; }
  if (role === "agent" && !body.clientAccountId) { sendJson(res, 400, { error: "Select a client account for this agent" }); return; }
  const orgId = await resolveUserOrgId(currentUser, req);
  if (!orgId) { sendJson(res, 400, { error: "Your dashboard session is missing an organization ID. Sign out through VictorySync and open the CRM again." }); return; }
  const existing = await supabaseRest(`team_members?org_id=eq.${encodeURIComponent(orgId)}&email=eq.${encodeURIComponent(email)}&select=id&limit=1`, { method: "GET" }, req) as Array<{ id?: string }>;
  if (existing.length) { sendJson(res, 409, { error: "A team member with this email already exists" }); return; }

  const rows = await supabaseRest("team_members", {
    method: "POST",
    body: JSON.stringify({ name, email, org_id: orgId, role, client_account_id: body.clientAccountId ?? null, page_permissions: Array.isArray(body.pagePermissions) ? body.pagePermissions : null, status: "invited" }),
  }, req) as Array<Record<string, unknown>>;
  const member = rows[0];
  if (!member?.id) { sendJson(res, 500, { error: "Supabase did not return the created team member" }); return; }

  const code = `VS-${crypto.randomBytes(3).toString("hex").toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    await supabaseRest("invite_codes", {
      method: "POST",
      body: JSON.stringify({
        code_hash: crypto.createHash("sha256").update(code).digest("hex"),
        email,
        name,
        role,
        client_account_id: body.clientAccountId ?? null,
        team_member_id: member.id,
        org_id: orgId,
        created_by: "dashboard",
        expires_at: expiresAt,
      }),
    }, req);
  } catch (error) {
    await supabaseRest(`team_members?id=eq.${encodeURIComponent(String(member.id))}`, { method: "DELETE" }, req).catch(() => undefined);
    throw error;
  }
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  sendJson(res, 201, {
    member: toCamelValue(member),
    invite: {
      code,
      email,
      name,
      expiresAt,
      url: appUrl ? `${appUrl}?invite=${encodeURIComponent(code)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}` : undefined,
    },
  });
}

async function resendTeamInvite(memberId: string, req: VercelRequest, res: VercelResponse) {
  const rows = await supabaseRest(`team_members?id=eq.${encodeURIComponent(memberId)}&select=*&limit=1`, { method: "GET" }, req) as Array<Record<string, unknown>>;
  const member = rows[0];
  if (!member) { sendJson(res, 404, { error: "Team member not found" }); return; }
  const code = `VS-${crypto.randomBytes(3).toString("hex").toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await supabaseRest("invite_codes", {
    method: "POST",
    body: JSON.stringify({
      code_hash: crypto.createHash("sha256").update(code).digest("hex"),
      email: member.email,
      name: member.name,
      role: member.role ?? "member",
      client_account_id: member.client_account_id ?? null,
      team_member_id: member.id,
      org_id: member.org_id ?? null,
      created_by: "dashboard",
      expires_at: expiresAt,
    }),
  }, req);
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  sendJson(res, 201, {
    code,
    email: member.email,
    name: member.name,
    expiresAt,
    url: appUrl ? `${appUrl}?invite=${encodeURIComponent(code)}&email=${encodeURIComponent(String(member.email))}&name=${encodeURIComponent(String(member.name))}` : undefined,
  });
}

async function updateTeamMember(memberId: string, req: VercelRequest, res: VercelResponse) {
  const body = await readJson(req) as Record<string, unknown>;
  const update = toSnakeValue(body) as Record<string, unknown>;
  delete update.id;
  delete update.auth_user_id;
  update.updated_at = new Date().toISOString();
  const rows = await supabaseRest(`team_members?id=eq.${encodeURIComponent(memberId)}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  }, req) as Array<Record<string, unknown>>;
  const member = rows[0];
  if (!member) {
    sendJson(res, 404, { message: "Team member not found" });
    return;
  }

  const authUserId = String(member.auth_user_id ?? "");
  if (authUserId && supabaseUrl && supabaseServiceRoleKey) {
    const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
      method: "PUT",
      headers: {
        apikey: supabaseServiceRoleKey,
        authorization: `Bearer ${supabaseServiceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        user_metadata: {
          role: member.role ?? "viewer",
          client_account_id: member.client_account_id ?? null,
          team_member_id: member.id,
          org_id: member.org_id ?? null,
          status: member.status ?? "active",
          page_permissions: Array.isArray(member.page_permissions) ? member.page_permissions : null,
        },
        ban_duration: member.status === "active" ? "none" : "876000h",
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      throw new Error(String(data.msg ?? data.message ?? "Unable to update the member's login access"));
    }
  }
  sendJson(res, 200, toCamelValue(member));
}

async function deleteLeads(req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (!ids.length) { sendJson(res, 400, { error: "At least one contact is required" }); return; }
  await supabaseRest(`leads?id=in.(${ids.map(encodeURIComponent).join(",")})`, { method: "DELETE" }, req);
  sendJson(res, 200, { deleted: ids.length });
}

async function importLeads(req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as { leads?: LeadInput[]; campaignId?: number };
  const incoming = Array.isArray(body.leads) ? body.leads : [];
  const leads = incoming.map((lead) => {
    const email = lead.email?.trim() ?? "";
    const nameParts = email.split("@")[0]?.split(/[._+-]+/).filter(Boolean) ?? [];
    return normalizeLead({
      ...lead,
      firstName: lead.firstName?.trim() || nameParts[0] || "Unknown",
      lastName: lead.lastName?.trim() || nameParts.slice(1).join(" ") || "Unknown",
      campaignId: body.campaignId ?? lead.campaignId,
    });
  });
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

async function enrollSequence(sequenceId: string, req: VercelRequest, res: VercelResponse) {
  await ensureSequenceTables();
  const body = (await readJson(req)) as {
    leadId?: string | number;
    leadIds?: Array<string | number>;
    leads?: Array<string | number>;
  };
  const leadIds = body.leadIds ?? body.leads ?? (body.leadId ? [body.leadId] : []);
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    sendJson(res, 400, { error: "leadId or leadIds are required" });
    return;
  }

  const payload = leadIds.map((leadId) => ({
    sequence_id: sequenceId,
    lead_id: leadId,
    current_step: 1,
    status: "active",
    next_send_at: new Date().toISOString(),
  }));
  const rows = await supabaseRest("sequence_enrollments?on_conflict=sequence_id,lead_id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  }, req);

  const enrollments = await supabaseRest(
    `sequence_enrollments?sequence_id=eq.${encodeURIComponent(sequenceId)}&select=id`,
    { method: "GET" },
    req,
  ) as unknown[];

  await supabaseRest(`sequences?id=eq.${encodeURIComponent(sequenceId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      total_enrolled: enrollments.length,
      updated_at: new Date().toISOString(),
    }),
  }, req);

  sendJson(res, 201, toCamelValue(rows));
}

function getLeadChildMatch(path: string) {
  const match = path.match(/^\/api\/leads\/([^/]+)\/(activities|notes|tasks)(?:\/([^/]+))?$/);
  if (!match) return null;
  return {
    leadId: decodeURIComponent(match[1] ?? ""),
    kind: match[2] as "activities" | "notes" | "tasks",
    childId: match[3] ? decodeURIComponent(match[3]) : null,
  };
}

const leadChildTables = {
  activities: "activities",
  notes: "notes",
  tasks: "contact_tasks",
} as const;

async function listLeadChildren(leadId: string, kind: keyof typeof leadChildTables, req: VercelRequest, res: VercelResponse) {
  const table = leadChildTables[kind];
  const rows = await supabaseRest(`${table}?lead_id=eq.${encodeURIComponent(leadId)}&select=*&order=created_at.desc`, {
    method: "GET",
  }, req);
  sendJson(res, 200, toCamelValue(rows));
}

async function createLeadChild(leadId: string, kind: keyof typeof leadChildTables, req: VercelRequest, res: VercelResponse) {
  const table = leadChildTables[kind];
  const body = (await readJson(req)) as Record<string, unknown>;
  const payload = stripUndefined({
    ...(toSnakeValue(body) as Record<string, unknown>),
    lead_id: leadId,
  });
  if (kind === "activities" && !payload.type) payload.type = "other";
  if (kind === "tasks" && !payload.priority) payload.priority = "medium";
  const rows = await supabaseRest(table, {
    method: "POST",
    body: JSON.stringify(payload),
  }, req);
  sendJson(res, 201, Array.isArray(rows) ? toCamelValue(rows[0] ?? null) : toCamelValue(rows));
}

async function updateLeadChild(kind: keyof typeof leadChildTables, childId: string, req: VercelRequest, res: VercelResponse) {
  const table = leadChildTables[kind];
  const body = (await readJson(req)) as Record<string, unknown>;
  const payload = stripUndefined(toSnakeValue(body) as Record<string, unknown>);
  if (kind === "tasks" && payload.is_completed === true && !payload.completed_at) {
    payload.completed_at = new Date().toISOString();
  }
  if (kind === "tasks" && payload.is_completed === false) {
    payload.completed_at = null;
  }
  const rows = await supabaseRest(`${table}?id=eq.${encodeURIComponent(childId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, req);
  sendJson(res, 200, Array.isArray(rows) ? toCamelValue(rows[0] ?? null) : toCamelValue(rows));
}

async function deleteLeadChild(kind: keyof typeof leadChildTables, childId: string, req: VercelRequest, res: VercelResponse) {
  const table = leadChildTables[kind];
  await supabaseRest(`${table}?id=eq.${encodeURIComponent(childId)}`, {
    method: "DELETE",
  }, req);
  res.statusCode = 204;
  res.end();
}

async function handleLeadChildren(path: string, method: string, req: VercelRequest, res: VercelResponse) {
  const match = getLeadChildMatch(path);
  if (!match) return false;

  if (!match.childId && method === "GET") {
    await listLeadChildren(match.leadId, match.kind, req, res);
    return true;
  }
  if (!match.childId && method === "POST") {
    await createLeadChild(match.leadId, match.kind, req, res);
    return true;
  }
  if (match.childId && (method === "PATCH" || method === "PUT")) {
    await updateLeadChild(match.kind, match.childId, req, res);
    return true;
  }
  if (match.childId && method === "DELETE") {
    await deleteLeadChild(match.kind, match.childId, req, res);
    return true;
  }
  return false;
}

async function getReviewStats(req: VercelRequest, res: VercelResponse) {
  const reviews = (await supabaseRest("reviews?select=rating,is_read,reply", {
    method: "GET",
  }, req)) as Array<{ rating?: number; is_read?: boolean; reply?: string | null }>;
  const total = reviews.length;
  const average = total
    ? reviews.reduce((sum, review) => sum + Number(review.rating ?? 0), 0) / total
    : 0;
  sendJson(res, 200, {
    total,
    averageRating: Number(average.toFixed(1)),
    unread: reviews.filter((review) => !review.is_read).length,
    unanswered: reviews.filter((review) => !review.reply).length,
  });
}

async function getPipelineLeads(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? "/api/pipeline/leads", "https://local.invalid");
  const pipelineId = url.searchParams.get("pipelineId");
  const stagePath = pipelineId
    ? `pipeline_stages?pipeline_id=eq.${encodeURIComponent(pipelineId)}&select=*&order=position.asc`
    : "pipeline_stages?select=*&order=position.asc";
  const [stages, leads] = await Promise.all([
    supabaseRest(stagePath, { method: "GET" }, req) as Promise<Array<Record<string, unknown>>>,
    supabaseRest("leads?select=*&order=created_at.desc&limit=1000", { method: "GET" }, req) as Promise<LeadRow[]>,
  ]);
  const stageRows = stages.map((stage) => ({
    ...(toCamelValue(stage) as Record<string, unknown>),
    leads: leads.filter((lead) => String(lead.pipeline_stage_id ?? "") === String(stage.id)).map(leadFromRow),
  }));
  sendJson(res, 200, {
    stages: stageRows,
    unassigned: leads.filter((lead) => !lead.pipeline_stage_id).map(leadFromRow),
  });
}

async function updateLeadStage(path: string, method: string, req: VercelRequest, res: VercelResponse) {
  const match = path.match(/^\/api\/pipeline\/leads\/([^/]+)\/stage$/);
  if (!match || (method !== "PATCH" && method !== "PUT")) return false;
  const leadId = decodeURIComponent(match[1] ?? "");
  const body = (await readJson(req)) as { stageId?: string | number | null; pipelineStageId?: string | number | null };
  const rows = await supabaseRest(`leads?id=eq.${encodeURIComponent(leadId)}`, {
    method: "PATCH",
    body: JSON.stringify({ pipeline_stage_id: body.stageId ?? body.pipelineStageId ?? null }),
  }, req) as LeadRow[];
  sendJson(res, 200, rows[0] ? leadFromRow(rows[0]) : null);
  return true;
}

async function getProspectFilters(res: VercelResponse) {
  sendJson(res, 200, {
    industries: ["Legal Services", "Healthcare", "Real Estate", "Home Services", "Professional Services"],
    companySizes: ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000"],
    seniorities: ["owner", "founder", "partner", "executive", "director", "manager"],
  });
}

async function listProspects(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? "/api/prospects", "https://local.invalid");
  const search = url.searchParams.get("search")?.trim().toLowerCase();
  const title = url.searchParams.get("title")?.trim().toLowerCase();
  const industry = url.searchParams.get("industry")?.trim();
  const companySize = url.searchParams.get("companySize")?.trim();
  const seniority = url.searchParams.get("seniority")?.trim();
  const minIntent = Number(url.searchParams.get("minIntent") ?? 0);

  const rows = await supabaseRest("prospects?select=*&order=intent_score.desc&limit=500", {
    method: "GET",
  }, req) as Array<Record<string, unknown>>;
  const prospects = rows.map((row) => toCamelValue(row) as Record<string, unknown>).filter((prospect) => {
    const haystack = [
      prospect.firstName,
      prospect.lastName,
      prospect.email,
      prospect.company,
      prospect.title,
    ].join(" ").toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (title && !String(prospect.title ?? "").toLowerCase().includes(title)) return false;
    if (industry && prospect.industry !== industry) return false;
    if (companySize && prospect.companySize !== companySize) return false;
    if (seniority && prospect.seniority !== seniority) return false;
    if (Number(prospect.intentScore ?? 0) < minIntent) return false;
    return true;
  });
  sendJson(res, 200, { prospects, total: prospects.length });
}

async function saveProspectsToLeads(req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as { prospects?: Array<Record<string, unknown>> };
  const prospects = Array.isArray(body.prospects) ? body.prospects : [];
  if (prospects.length === 0) {
    sendJson(res, 400, { error: "prospects are required" });
    return;
  }
  const payload = prospects.map((prospect) => ({
    first_name: String(prospect.firstName ?? prospect.first_name ?? ""),
    last_name: String(prospect.lastName ?? prospect.last_name ?? ""),
    email: prospect.email ?? null,
    phone: String(prospect.phone ?? "").trim(),
    company: prospect.company ?? null,
    title: prospect.title ?? null,
    source: "prospect_search",
    status: "new",
    score: Number(prospect.score ?? 0),
    custom_fields: prospect,
  }));
  const rows = await supabaseRest("leads", {
    method: "POST",
    body: JSON.stringify(payload),
  }, req) as LeadRow[];
  sendJson(res, 201, { saved: rows.length, imported: rows.length, leads: rows.map(leadFromRow) });
}

async function getOnboarding(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? "/api/onboarding", "https://local.invalid");
  const subAccountId = url.searchParams.get("subAccountId");
  const defaultProgress = {
    completedSteps: [],
    currentStep: "connect_integrations",
    isCompleted: false,
  };
  if (subAccountId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subAccountId)) {
    sendJson(res, 200, defaultProgress);
    return;
  }
  const query = subAccountId
    ? `onboarding_progress?sub_account_id=eq.${encodeURIComponent(subAccountId)}&select=*&limit=1`
    : "onboarding_progress?select=*&limit=1";
  const rows = await supabaseRest(query, { method: "GET" }, req) as Array<Record<string, unknown>>;
  sendJson(res, 200, rows[0] ? toCamelValue(rows[0]) : defaultProgress);
}

async function updateOnboarding(path: string, req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as { stepId?: string; subAccountId?: string | number };
  if (path.endsWith("/reset")) {
    sendJson(res, 200, { completedSteps: [], currentStep: "connect_integrations", isCompleted: false });
    return;
  }
  sendJson(res, 200, {
    completedSteps: body.stepId ? [body.stepId] : [],
    currentStep: body.stepId ?? "connect_integrations",
    isCompleted: false,
  });
}

async function listEmailLogs(req: VercelRequest, res: VercelResponse) {
  const rows = await supabaseRest("email_logs?select=*&order=sent_at.desc", {
    method: "GET",
  }, req);
  sendJson(res, 200, toCamelValue(rows));
}

async function sendEmail(req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as {
    leadId?: string;
    emailAccountId?: string;
    subject?: string;
    body?: string;
  };
  if (!body.leadId || !body.subject || !body.body) {
    sendJson(res, 400, { success: false, error: "leadId, subject, and body are required" });
    return;
  }

  const leads = (await supabaseRest(`leads?id=eq.${encodeURIComponent(String(body.leadId))}&select=*&limit=1`, {
    method: "GET",
  }, req)) as LeadRow[];
  const lead = leads[0];
  if (!lead) {
    sendJson(res, 404, { success: false, error: "Lead not found" });
    return;
  }

  await supabaseRest("email_logs", {
    method: "POST",
    body: JSON.stringify({
      lead_id: body.leadId,
      email_account_id: body.emailAccountId ?? null,
      to_email: lead.email,
      from_email: "configured-mailbox",
      subject: body.subject,
      body: body.body,
      status: "queued",
    }),
  }, req);

  sendJson(res, 200, {
    success: true,
    message: "Email queued. Configure SMTP credentials on a mailbox to enable live sending.",
  });
}

async function handleScraper(path: string, method: string, req: VercelRequest, res: VercelResponse) {
  if (method !== "POST") return false;
  if (!["/api/scraper/url", "/api/scraper/domain", "/api/scraper/search"].includes(path)) {
    return false;
  }

  const body = (await readJson(req)) as Record<string, unknown>;
  const query = String(body.url ?? body.domain ?? body.query ?? "").trim();
  if (!query) {
    sendJson(res, 400, { error: "url, domain, or query is required" });
    return true;
  }

  sendJson(res, 200, {
    success: true,
    results: [],
    message: "Scraper request accepted. Configure a scraping provider key to pull live external results.",
  });
  return true;
}

async function handleOAuth(path: string, method: string, req: VercelRequest, res: VercelResponse) {
  const providers = {
    google: { configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) },
    microsoft: { configured: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) },
    hubspot: { configured: Boolean(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET) },
    twilio: { configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) },
    zapier: { configured: Boolean(process.env.ZAPIER_WEBHOOK_URL) },
    stripe: { configured: Boolean(process.env.STRIPE_SECRET_KEY) },
  };

  if (path === "/api/oauth/status" && method === "GET") {
    sendJson(res, 200, providers);
    return true;
  }

  if (path === "/api/oauth/providers" && method === "GET") {
    sendJson(res, 200, providers);
    return true;
  }

  if (path === "/api/oauth/callback-url" && method === "GET") {
    const host = getHeader(req, "host") ?? "victorysyncplatform.vercel.app";
    const baseUrl = `https://${host}`;
    sendJson(res, 200, Object.fromEntries(
      Object.keys(providers).map((provider) => [provider, `${baseUrl}/api/oauth/${provider}/callback`]),
    ));
    return true;
  }

  if (path === "/api/oauth/validate" && (method === "GET" || method === "POST")) {
    sendJson(res, 200, {
      success: true,
      configured: {
        google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        microsoft: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
        hubspot: Boolean(process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET),
      },
    });
    return true;
  }

  const validateMatch = path.match(/^\/api\/(?:oauth|integrations)\/([^/]+)\/validate$/);
  if (validateMatch && (method === "GET" || method === "POST")) {
    const provider = validateMatch[1] ?? "";
    const configured = providers[provider as keyof typeof providers]?.configured ?? false;
    sendJson(res, 200, {
      success: configured,
      configured,
      provider,
      message: configured ? "Provider credentials are configured." : "Provider credentials are not configured yet.",
    });
    return true;
  }

  const startMatch = path.match(/^\/api\/oauth\/([^/]+)\/start$/);
  if (startMatch && method === "GET") {
    sendJson(res, 400, {
      success: false,
      provider: startMatch[1],
      error: "OAuth provider credentials are not configured for this deployment.",
    });
    return true;
  }

  return false;
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

    if (method === "POST" && path === "/api/auth/signup-with-invite") {
      await signupWithInvite(req, res);
      return;
    }

    const currentUser = await authenticateRequest(req);
    if (method === "POST" && path === "/api/auth/sync-session") {
      await syncDashboardTeamMember(currentUser, req, res);
      return;
    }
    const role = String(currentUser.user_metadata?.role ?? "member");
    const status = String(currentUser.user_metadata?.status ?? "active");
    if (status === "inactive" || status === "deactivated") {
      sendJson(res, 403, { message: "This CRM account has been deactivated" });
      return;
    }
    if (role === "viewer" && method !== "GET") {
      sendJson(res, 403, { message: "Viewer accounts have read-only access" });
      return;
    }
    if (role === "agent" && /^\/api\/(?:team|sub-accounts|api-keys)/.test(path)) {
      sendJson(res, 403, { message: "Agent accounts cannot manage workspace access" });
      return;
    }
    const pagePermissions = currentUser.user_metadata?.page_permissions;
    const requiredPermission = apiPermissionForPath(path);
    if (role !== "owner" && Array.isArray(pagePermissions) && requiredPermission && !pagePermissions.includes(requiredPermission)) {
      sendJson(res, 403, { message: `Access to ${requiredPermission} is disabled for this account` });
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

    if (method === "DELETE" && path === "/api/leads") {
      await deleteLeads(req, res);
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

    if (await handleLeadChildren(path, method, req, res)) {
      return;
    }

    if (method === "GET" && path === "/api/email/logs") {
      await listEmailLogs(req, res);
      return;
    }

    if (method === "GET" && path === "/api/email-templates") {
      await removeLegacyDemoTemplates(req);
    }

    if (method === "POST" && path === "/api/email/send") {
      await sendEmail(req, res);
      return;
    }

    if (await handleScraper(path, method, req, res)) {
      return;
    }

    if (await handleOAuth(path, method, req, res)) {
      return;
    }

    if (method === "GET" && path === "/api/reviews/stats") {
      await getReviewStats(req, res);
      return;
    }

    if (method === "GET" && path === "/api/affiliates-stats") {
      await getAffiliateStats(req, res);
      return;
    }

    if (method === "GET" && path === "/api/pipeline/leads") {
      await getPipelineLeads(req, res);
      return;
    }

    if (await updateLeadStage(path, method, req, res)) {
      return;
    }

    if (method === "GET" && path === "/api/prospects/filters") {
      await getProspectFilters(res);
      return;
    }

    if (method === "GET" && path === "/api/prospects") {
      await listProspects(req, res);
      return;
    }

    if (method === "POST" && path === "/api/prospects/save-to-leads") {
      await saveProspectsToLeads(req, res);
      return;
    }

    if (method === "GET" && path === "/api/onboarding") {
      await getOnboarding(req, res);
      return;
    }

    if (method === "POST" && (path === "/api/onboarding/complete-step" || path === "/api/onboarding/reset")) {
      await updateOnboarding(path, req, res);
      return;
    }

    if (method === "POST" && path === "/api/team/invite") {
      await createTeamInvite(currentUser, req, res);
      return;
    }

    if (method === "GET" && path === "/api/team") {
      await listTeamMembers(currentUser, req, res);
      return;
    }

    const resendInviteMatch = path.match(/^\/api\/team\/([^/]+)\/resend$/);
    if (method === "POST" && resendInviteMatch?.[1]) {
      await resendTeamInvite(decodeURIComponent(resendInviteMatch[1]), req, res);
      return;
    }

    const teamMemberMatch = path.match(/^\/api\/team\/([^/]+)$/);
    if (method === "PATCH" && teamMemberMatch?.[1]) {
      await updateTeamMember(decodeURIComponent(teamMemberMatch[1]), req, res);
      return;
    }

    if (method === "POST" && path === "/api/sub-accounts") {
      await createSubAccount(req, res);
      return;
    }

    if (method === "GET" && path === "/api/sub-accounts-stats") {
      const rows = await supabaseRest("sub_accounts?select=status,plan,leads_count,campaigns_count", { method: "GET" }, req) as Array<Record<string, unknown>>;
      sendJson(res, 200, {
        total: rows.length,
        active: rows.filter((row) => row.status === "active").length,
        leads: rows.reduce((sum, row) => sum + Number(row.leads_count ?? 0), 0),
        campaigns: rows.reduce((sum, row) => sum + Number(row.campaigns_count ?? 0), 0),
      });
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

    const sequenceEnrollId = getSequenceEnrollMatch(path);
    if (sequenceEnrollId && method === "POST") {
      await enrollSequence(sequenceEnrollId, req, res);
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

    if (await handleGenericResource(path, method, req, res)) {
      return;
    }

    sendJson(res, 404, { error: `API route not implemented: ${method} ${path}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Authentication required" || message.includes("session is invalid")) {
      sendJson(res, 401, { error: message });
      return;
    }
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
      message.includes("Could not find the table") ||
      message.includes("schema cache")
    ) {
      const portalSchema = message.includes("team_members") || message.includes("invite_codes");
      sendJson(res, 503, {
        error: portalSchema
          ? "The portal database schema is incomplete. Run supabase/migrations/20260723_team_portal_schema_hotfix.sql in the Supabase SQL Editor, then retry."
          : "The CRM database schema is incomplete. Run supabase/migrations/20260723_crm_launch_features.sql in the Supabase SQL Editor, then retry.",
        supabaseError: message,
        databaseUrlConfigured: hasDatabaseUrl,
      });
      return;
    }
    sendJson(res, 500, { error: message });
  }
}
