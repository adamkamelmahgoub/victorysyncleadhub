import crypto from "node:crypto";
import { mcpPool } from "../lib/mcp-auth.js";
import { fetchWebsiteContacts, scanDomain } from "../lib/web-lead-finder.js";
import { leadReports } from "../artifacts/api-server/src/lib/lead-reports.js";
import { companyCrmRequest } from "../artifacts/api-server/src/lib/company-crm.js";
import { DISPOSITIONS, parseCall, parseOutreachUpdate } from '../lib/outreach.js';
import { EmailService,isEmailEndpoint,isPublicEmailEndpoint } from '../lib/email-service.js';
import { EmailInputError, emailOperationError } from '../lib/email-security.js';
import { importedSocials } from '../lib/social-import.js';
import { socialRest } from '../lib/social-service.js';
import { mailboxTransport } from '../artifacts/api-server/src/lib/email-transports.js';
import { inboxAdapter } from '../artifacts/api-server/src/lib/inbox-adapters.js';
import { WorkflowService,isWorkflowEndpoint,isPublicWorkflowEndpoint } from '../lib/workflow-service.js';
import { normalizeSegmentFilters, segmentFilterSummary, validateSegmentFilters } from '../lib/segment-filters.js';
export const config = { api: { bodyParser: false }, maxDuration: 60 };

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
  clientAccountId?: string | null;
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
  pipelineStageId?: number | string | null;
  meetingAt?: string | null;
  meetingTimezone?: string | null;
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
  client_account_id?: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  source: string | null;
  state?: string | null;
  status: string;
  disposition: string | null;
  contact_attempts: number;
  next_action_at?: string | null;
  first_attempt_at?: string | null;
  score: number;
  campaign_id: number | null;
  form_id: number | null;
  pipeline_stage_id: number | string | null;
  meeting_at?: string | null;
  meeting_timezone?: string | null;
  meeting_booked_at?: string | null;
  meeting_booked_by?: string | null;
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
    meeting_at: lead.meetingAt ?? null,
    meeting_timezone: lead.meetingTimezone ?? null,
    tags: Array.isArray(lead.tags) ? lead.tags : [],
    custom_fields: lead.customFields ?? {},
  };
}

function validateLead(lead: ReturnType<typeof normalizeLead>) {
  if (lead.status === "meeting_booked" && !validMeetingAt(lead.meeting_at)) return "Meeting date and time are required";
  return null;
}

function validMeetingAt(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

async function isMeetingStage(stageId: unknown, req: VercelRequest) {
  if (stageId == null || stageId === "") return false;
  const stages = await supabaseRest(`pipeline_stages?id=eq.${encodeURIComponent(String(stageId))}&select=key&limit=1`, { method: "GET" }, req) as Array<{ key: string | null }>;
  return stages[0]?.key === "meeting_booked";
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
    meeting_at: lead.meeting_at,
    meeting_timezone: lead.meeting_timezone,
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
  if (lead.meetingAt !== undefined) payload.meeting_at = lead.meetingAt;
  if (lead.meetingTimezone !== undefined) payload.meeting_timezone = lead.meetingTimezone;
  if (lead.tags !== undefined) payload.tags = Array.isArray(lead.tags) ? lead.tags : [];
  if (lead.customFields !== undefined) payload.custom_fields = lead.customFields ?? {};
  return payload;
}

function leadFromRow(row: LeadRow) {
  const source = row.source?.trim();
  return {
    id: row.id,
    clientAccountId: row.client_account_id ?? null,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    title: row.title,
    source: source && !badLeadSources.has(source.toLowerCase()) ? source : null,
    state: row.state ?? null,
    status: row.status,
    disposition: row.disposition,
    contactAttempts: row.contact_attempts ?? 0,
    nextActionAt: row.next_action_at ?? null,
    firstAttemptAt: row.first_attempt_at ?? null,
    score: row.score,
    campaignId: row.campaign_id,
    formId: row.form_id,
    pipelineStageId: row.pipeline_stage_id,
    meetingAt: row.meeting_at ?? null,
    meetingTimezone: row.meeting_timezone ?? null,
    meetingBookedAt: row.meeting_booked_at ?? null,
    meetingBookedBy: row.meeting_booked_by ?? null,
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
  crmRoleVerified?: boolean;
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
  if (value === "client") return "client";
  if (value === "viewer") return "viewer";
  return "member";
}

function clientLeadScope(user: AuthenticatedUser): string | null {
  const role = normalizeDashboardRole(user.user_metadata?.role ?? user.app_metadata?.role);
  if (role !== "client") return null;
  const account = user.user_metadata?.client_account_id ?? user.app_metadata?.client_account_id;
  return typeof account === "string" && /^[a-f0-9-]{36}$/i.test(account) ? account : "00000000-0000-0000-0000-000000000000";
}

function clientAccountIdForUser(user: AuthenticatedUser) {
  const value = user.user_metadata?.client_account_id ?? user.app_metadata?.client_account_id;
  return typeof value === "string" && value ? value : null;
}

function canManageClientAccounts(user: AuthenticatedUser) {
  if (clientAccountIdForUser(user)) return false;
  const role = normalizeDashboardRole(user.user_metadata?.role ?? user.app_metadata?.role);
  const globalRole = user.user_metadata?.global_role ?? user.app_metadata?.global_role;
  return role === "owner" || role === "admin" || globalRole === "platform_admin";
}

function actorLabelForUser(user: AuthenticatedUser) {
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  return typeof user.email === "string" && user.email
    ? user.email
    : typeof name === "string" && name
      ? name
      : user.id;
}

function leadScopeSuffix(user: AuthenticatedUser) {
  const clientAccountId = clientLeadScope(user) ?? clientAccountIdForUser(user);
  return clientAccountId ? `&client_account_id=eq.${encodeURIComponent(clientAccountId)}` : "";
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

async function isPlatformAdmin(user: AuthenticatedUser, req: VercelRequest) {
  const metadataRole = user.app_metadata?.global_role;
  if (metadataRole === "platform_admin") return true;
  try {
    const rows = await supabaseRest(
      `profiles?id=eq.${encodeURIComponent(user.id)}&select=global_role&limit=1`,
      { method: "GET" },
      req,
    ) as Array<{ global_role?: string | null }>;
    return rows[0]?.global_role === "platform_admin";
  } catch {
    return false;
  }
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
    [/^\/api\/(?:leads|activities|notes|tasks|outreach)/, "contacts"],
    [/^\/api\/(?:segments|contact-groups)/, "segments"],
    [/^\/api\/email\/(?:send|logs)/, "conversations"],
    [/^\/api\/(?:pipelines|pipeline)/, "pipeline"],
    [/^\/api\/(?:prospects|scraper)/, "prospecting"],
    [/^\/api\/meeting/, "calendar"],
    [/^\/api\/sequences/, "sequences"],
    [/^\/api\/campaigns/, "campaigns"],
    [/^\/api\/email\/metrics(?:\/|$)/, "reporting"],
    [/^\/api\/(?:email-templates|email-accounts|email(?:\/|$))/, "email"],
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
  const user = await response.json() as AuthenticatedUser;
  try {
    const claims = JSON.parse(Buffer.from(authorization.slice(7).split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
    if (claims.sub !== user.id) throw new Error("Session identity mismatch");
    user.crmRoleVerified = typeof claims.crm_role === "string" &&
      ["owner", "admin", "agent", "member", "viewer", "client", "agency_admin", "agency_staff", "client_owner", "client_staff"].includes(claims.crm_role);
    user.user_metadata = { ...user.user_metadata,
      ...(typeof claims.crm_role === "string" ? { role: claims.crm_role } : {}),
      ...(typeof claims.crm_client_account_id === "string" ? { client_account_id: claims.crm_client_account_id } : {}),
      ...(typeof claims.crm_team_member_id === "string" ? { team_member_id: claims.crm_team_member_id } : {}),
      ...(Array.isArray(claims.crm_page_permissions) ? { page_permissions: claims.crm_page_permissions } : {}),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Session identity mismatch") throw error;
  }
  return user;
}

async function portalEnabledForUser(req: VercelRequest) {
  if (!supabaseUrl || !supabaseAnonKey) return false;
  const authorization = getHeader(req, "authorization");
  if (!authorization) return false;
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/client_feature_enabled`, {
    method: "POST",
    headers: { apikey: supabaseAnonKey, authorization, "content-type": "application/json" },
    body: JSON.stringify({ p_feature: "client_portal" }),
    signal: AbortSignal.timeout(5000),
  });
  return response.ok && await response.json() === true;
}

type PortalActivityEvent = {eventType:string;action:string;pagePath?:string|null;target?:string|null;requestMethod?:string|null;requestStatus?:number|null;sessionId?:string|null;metadata?:Record<string,unknown>};
async function recordPortalActivities(req:VercelRequest,user:AuthenticatedUser,events:PortalActivityEvent[]) {
  const clean=(value:unknown,max=500)=>typeof value==='string'?value.replace(/[\r\n\t]+/g,' ').trim().slice(0,max):null;
  const forwarded=String(getHeader(req,'x-forwarded-for')??'').split(',')[0].trim();
  const rows=events.map((event)=>{
    const metadata=event.metadata&&typeof event.metadata==='object'?Object.fromEntries(Object.entries(event.metadata).slice(0,20).map(([k,v])=>[k.slice(0,80),typeof v==='string'?v.slice(0,500):v])):{};
    return {actor_id:user.id,actor_email:clean(user.email,320),actor_name:clean(user.user_metadata?.full_name??user.user_metadata?.name,200),organization_id:clean(user.user_metadata?.org_id,200),client_account_id:clean(user.user_metadata?.client_account_id,200),session_id:clean(event.sessionId,200),event_type:clean(event.eventType,80)??'activity',action:clean(event.action,200)??'unknown',page_path:clean(event.pagePath,1000),target:clean(event.target,500),request_method:clean(event.requestMethod,20),request_status:event.requestStatus??null,ip_address:clean(forwarded||getHeader(req,'x-real-ip'),100),user_agent:clean(getHeader(req,'user-agent'),1000),metadata};
  });
  try{await supabaseRest('portal_activity_log',{method:'POST',body:JSON.stringify(rows),headers:{prefer:'return=minimal'}},req);}catch(error){console.warn('Portal activity logging failed',error instanceof Error?error.message:'unknown');}
}
async function recordPortalActivity(req:VercelRequest,user:AuthenticatedUser,event:PortalActivityEvent) {
  await recordPortalActivities(req,user,[event]);
}

async function syncDashboardTeamMember(user: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const body = await readJson(req) as { orgId?: unknown };
  const requestedOrgId = typeof body.orgId === "string" && body.orgId.trim() ? body.orgId.trim() : null;
  const email = String(user.email ?? "").trim().toLowerCase();
  if (!email) {
    sendJson(res, 400, { message: "The dashboard session does not include an email address" });
    return;
  }
  if (!requestedOrgId && await isPlatformAdmin(user, req)) {
    sendJson(res, 200, { member: null, platformAdmin: true });
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
  if (existing?.status === "inactive" || existing?.status === "deactivated") {
    sendJson(res, 403, { message: "This CRM account has been deactivated" });
    return;
  }
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
    if (!dashboardMembership.role) {
      sendJson(res, 403, { message: "No verified VictorySync role is assigned to this account" });
      return;
    }
    const dashboardRole = normalizeDashboardRole(dashboardMembership.role);
    const rows = await insertTeamMember({
        auth_user_id: user.id,
        user_id: user.id,
        name: dashboardName,
        email,
        org_id: orgId,
        role: dashboardRole,
        status: "active",
        client_account_id: null,
        page_permissions: null,
      }, req);
    member = rows[0] ?? {};
  }

  if (supabaseUrl && supabaseServiceRoleKey && member.id) {
    const mergedMetadata = {
      ...metadata,
      role: member.role ?? metadata.role ?? "member",
      client_account_id: member.client_account_id ?? null,
      page_permissions: Array.isArray(member.page_permissions) ? member.page_permissions : null,
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
  await recordPortalActivity(req,user,{eventType:'authentication',action:'signed_in',pagePath:'/login',metadata:{role:member.role??metadata.role??'member'}});
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
        role: normalizeDashboardRole(membership.role),
        status: "active",
        client_account_id: null,
        page_permissions: null,
      }, req);
  }
}

async function listTeamMembers(currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  if (await isPlatformAdmin(currentUser, req)) {
    const rows = await supabaseRest(
      "team_members?select=*&order=created_at.desc",
      { method: "GET" },
      req,
    ) as Array<Record<string, unknown>>;
    sendJson(res, 200, rows.map(toCamelValue));
    return;
  }
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
  const authorization = /^leads(?:\?|$)/.test(path) && inboundAuth
    ? inboundAuth
    : hasServiceRole ? `Bearer ${supabaseKey}` : inboundAuth;

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

async function supabaseRestCount(path: string, req: VercelRequest): Promise<number> {
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase server environment is not configured");
  const inboundAuth = getHeader(req, "authorization");
  const authorization = /^leads(?:\?|$)/.test(path) && inboundAuth
    ? inboundAuth
    : hasServiceRole ? `Bearer ${supabaseKey}` : inboundAuth;
  if (!authorization) throw new Error("Missing Supabase user token");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: "HEAD",
    headers: { apikey: supabaseKey, authorization, prefer: "count=exact" },
  });
  if (!response.ok) throw new Error(`Supabase count error ${response.status}`);
  const total = Number(response.headers.get("content-range")?.split("/")[1]);
  if (!Number.isSafeInteger(total)) throw new Error("Supabase did not return an exact lead count");
  return total;
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

const nativeWorkflowTriggers = new Set(['contact_created','tag_added','status_changed','opportunity_stage_changed','email_replied','call_logged','disposition_changed','manual','social_reply_received','social_dm_sent','social_intent_changed']);
const nativeWorkflowNodes = new Set(['send_email','wait','condition','add_tag','remove_tag','update_status','move_pipeline_stage','enroll_sequence','create_call_task','add_note','webhook','stop_workflow']);
function validateNativeWorkflow(payload:Record<string,any>) {
  if(!payload.is_active)return;
  if(!nativeWorkflowTriggers.has(String(payload.trigger_type??'')))throw new Error('Choose a trigger supported by the native workflow engine');
  if(!Array.isArray(payload.actions)||!payload.actions.length)throw new Error('Add at least one workflow node before activating');
  for(const [index,node] of payload.actions.entries()){
    if(!node||!nativeWorkflowNodes.has(String(node.type??'')))throw new Error(`Workflow node ${index+1} is not supported by the native engine`);
    const config=node.config??{};
    if(node.type==='send_email'&&(!config.mailboxId||!String(config.subject??'').trim()||!String(config.body??'').trim()))throw new Error(`Email node ${index+1} requires a mailbox, subject, and body`);
    if(node.type==='wait'&&(!Number.isFinite(Number(config.duration))||Number(config.duration)<0))throw new Error(`Wait node ${index+1} requires a valid duration`);
    if(node.type==='condition'&&(!config.field||!config.operator))throw new Error(`Condition node ${index+1} requires a field and operator`);
    if(node.type==='webhook'&&!/^https:\/\//i.test(String(config.url??'')))throw new Error(`Webhook node ${index+1} requires a public HTTPS URL`);
  }
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
  if (config.table === "pipeline_stages" && String(body.name ?? "").trim().toLowerCase() === "meeting booked") {
    sendJson(res, 409, { error: "Meeting Booked already exists in every pipeline" }); return;
  }
  const payload = stripUndefined({
    ...(config.defaults ?? {}),
    ...(toSnakeValue(body) as Record<string, unknown>),
  });
  if(config.table==='automation_workflows')validateNativeWorkflow(payload);
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
  if (config.table === "pipeline_stages") {
    const existing = await supabaseRest(`pipeline_stages?id=eq.${encodeURIComponent(id)}&select=key&limit=1`, { method: "GET" }, req) as Array<{ key: string | null }>;
    if (existing[0]?.key === "meeting_booked" && body.name !== undefined && body.name !== "Meeting Booked") {
      sendJson(res, 409, { error: "The Meeting Booked stage name is fixed" }); return;
    }
    if (String(body.name ?? "").trim().toLowerCase() === "meeting booked" && existing[0]?.key !== "meeting_booked") {
      sendJson(res, 409, { error: "Meeting Booked already exists in every pipeline" }); return;
    }
  }
  const payload = stripUndefined(toSnakeValue(body) as Record<string, unknown>);
  if(config.table==='automation_workflows'){
    const rows=await supabaseRest(`${config.table}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,{method:'GET'},req) as Array<Record<string,unknown>>;
    validateNativeWorkflow({...rows[0],...payload});
  }
  const rows = await supabaseRest(`${config.table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, req);
  sendJson(res, 200, Array.isArray(rows) ? toCamelValue(rows[0] ?? null) : toCamelValue(rows));
}

async function deleteResource(config: ResourceConfig, id: string, req: VercelRequest, res: VercelResponse) {
  if (config.table === "pipeline_stages" && await isMeetingStage(id, req)) {
    sendJson(res, 409, { error: "The Meeting Booked stage is required" }); return;
  }
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
  const leads: LeadRow[]=[];
  for(let offset=0;;offset+=500) {
    const rows=await supabaseRest(`campaign_leads?campaign_id=eq.${encodeURIComponent(id)}&select=lead_id,leads(*)&order=lead_id.asc&limit=500&offset=${offset}`,{method:'GET'},req) as Array<{leads:LeadRow|null}>;
    for(const row of rows)if(row.leads)leads.push(row.leads);
    if(rows.length<500)break;
  }
  sendJson(res, 200, {leads:leads.map(leadFromRow),total:leads.length,page:1,limit:leads.length});
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
    headers: { prefer: "resolution=ignore-duplicates,return=representation" },
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

const contactOrganization = 'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function resolveContactOrganization(user: AuthenticatedUser, req: VercelRequest) {
  const preferred = await supabaseRest(`team_members?org_id=eq.${contactOrganization}&or=(auth_user_id.eq.${user.id},user_id.eq.${user.id})&select=org_id&limit=1`, { method: 'GET' }, req) as Array<{org_id?:string}>;
  if (preferred[0]?.org_id) return contactOrganization;
  if (await isPlatformAdmin(user, req)) return contactOrganization;
  return resolveUserOrgId(user, req);
}
type SegmentRow = { id: string; organization_id: string; name: string; description: string | null; filters: unknown; segment_type: 'smart' | 'static'; contact_count: number; created_at: string; updated_at: string };
function segmentSummary(row: SegmentRow) { return row.segment_type === 'static' ? 'Fixed list' : segmentFilterSummary(normalizeSegmentFilters(row.filters)); }

async function segmentPage(segment: SegmentRow, req: VercelRequest, options: { page?: number; limit?: number; search?: string; sort?: string; desc?: boolean } = {}) {
  const result = await supabaseRest('rpc/crm_segment_contacts_page', {
    method: 'POST', body: JSON.stringify({
      p_organization_id: segment.organization_id,
      p_filters: normalizeSegmentFilters(segment.filters),
      p_segment_id: segment.id,
      p_segment_type: segment.segment_type,
      p_page: options.page ?? 1,
      p_limit: options.limit ?? 50,
      p_search: options.search ?? null,
      p_sort: options.sort ?? 'created_at',
      p_desc: options.desc ?? true,
    }),
  }, req) as { total: number; page: number; limit: number; leads: LeadRow[] };
  return { ...result, leads: await contactsWithActivity(result.leads ?? [], req) };
}

async function contactsWithActivity(rows: LeadRow[], req: VercelRequest) {
  if (!rows.length) return [];
  const events = await supabaseRest('rpc/crm_contacts_last_activity', { method: 'POST', body: JSON.stringify({ p_ids: rows.map((row) => row.id) }) }, req) as Array<{ lead_id: string; last_activity_at: string }>;
  const byId = new Map(events.map((event) => [event.lead_id, event.last_activity_at]));
  return rows.map((row) => ({ ...leadFromRow(row), lastActivityAt: byId.get(String(row.id)) ?? null }));
}

async function handleContactActivity(path: string, method: string, req: VercelRequest, res: VercelResponse): Promise<boolean> {
  if (path !== '/api/contacts/last-activity' || method !== 'POST') return false;
  const body = await readJson(req) as { ids?: unknown } | null;
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => typeof id !== 'string' || !uuidPattern.test(id))) {
    sendJson(res, 400, { error: 'Provide up to 100 contact ids' }); return true;
  }
  if (!ids.length) { sendJson(res, 200, []); return true; }
  const visible = await supabaseRest(`leads?select=id&id=in.(${ids.join(',')})`, { method: 'GET' }, req) as Array<{ id: string }>;
  if (!visible.length) { sendJson(res, 200, []); return true; }
  const events = await supabaseRest('rpc/crm_contacts_last_activity', { method: 'POST', body: JSON.stringify({ p_ids: visible.map((row) => row.id) }) }, req) as Array<{ lead_id: string; last_activity_at: string }>;
  sendJson(res, 200, events.map((event) => ({ leadId: event.lead_id, lastActivityAt: event.last_activity_at })));
  return true;
}

async function handleContactSegments(path: string, method: string, user: AuthenticatedUser, req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const match = path.match(/^\/api\/segments(?:\/([^/]+))?(?:\/(contacts|members))?$/);
  if (!match) return false;
  const role = normalizeDashboardRole(user.user_metadata?.role ?? user.app_metadata?.role);
  if (role === 'client' || role === 'agent') { sendJson(res, 403, { error: 'Segments are not available for this role' }); return true; }
  const organizationId = await resolveContactOrganization(user, req);
  if (!organizationId || !uuidPattern.test(organizationId)) { sendJson(res, 403, { error: 'No organization is assigned to this session' }); return true; }
  const id = match[1];
  if (id && !uuidPattern.test(id)) { sendJson(res, 400, { error: 'Invalid segment id' }); return true; }
  const write = method !== 'GET';
  if (write && role === 'viewer') { sendJson(res, 403, { error: 'Read-only role' }); return true; }
  const segmentPath = `segments?organization_id=eq.${encodeURIComponent(organizationId)}${id ? `&id=eq.${encodeURIComponent(id)}` : ''}&select=*&order=created_at.desc`;
  const rows = await supabaseRest(segmentPath, { method: 'GET' }, req) as SegmentRow[];
  const segment = id ? rows[0] : null;
  if (id && !segment) { sendJson(res, 404, { error: 'Segment not found' }); return true; }
  if (method === 'GET' && !id) {
    const liveCounts = new URL(req.url ?? '', 'https://local.invalid').searchParams.get('liveCounts') === '1';
    const results = await Promise.all(rows.map(async (row) => {
      const count = liveCounts ? (await segmentPage(row, req, { limit: 1 })).total : row.contact_count;
      return { ...toCamelValue(row) as Record<string, unknown>, filters: normalizeSegmentFilters(row.filters), filterSummary: segmentSummary(row), contactCount: count };
    }));
    sendJson(res, 200, results);
    return true;
  }
  if (method === 'GET' && id && match[2] === 'contacts' && segment) {
    const url = new URL(req.url ?? '', 'https://local.invalid');
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50));
    const data = await segmentPage(segment, req, { page, limit, search: url.searchParams.get('search') ?? '', sort: url.searchParams.get('sort') ?? 'created_at', desc: url.searchParams.get('desc') !== 'false' });
    if (data.total !== segment.contact_count) await supabaseRest(`segments?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}`, { method: 'PATCH', body: JSON.stringify({ contact_count: data.total }) }, req);
    sendJson(res, 200, { ...data, segment: { ...toCamelValue(segment) as Record<string, unknown>, filters: normalizeSegmentFilters(segment.filters), filterSummary: segmentSummary(segment), contactCount: data.total } });
    return true;
  }
  if (method === 'GET' && id && segment) {
    const count = (await segmentPage(segment, req, { limit: 1 })).total;
    sendJson(res, 200, { ...toCamelValue(segment) as Record<string, unknown>, filters: normalizeSegmentFilters(segment.filters), filterSummary: segmentSummary(segment), contactCount: count });
    return true;
  }
  if (method === 'POST' && !id) {
    const body = await readJson(req) as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    if (!name || name.length > 120) { sendJson(res, 400, { error: 'Enter a segment name under 120 characters' }); return true; }
    if (!validateSegmentFilters(body.filters)) { sendJson(res, 400, { error: 'Invalid segment conditions' }); return true; }
    const segmentType = body.segmentType === 'static' ? 'static' : 'smart';
    const created = await supabaseRest('segments', { method: 'POST', body: JSON.stringify({ organization_id: organizationId, name, description: String(body.description ?? ''), filters: normalizeSegmentFilters(body.filters), segment_type: segmentType, contact_count: 0 }) }, req) as SegmentRow[];
    const row = created[0];
    if (!row) throw new Error('Segment creation returned no row');
    const count = (await segmentPage(row, req, { limit: 1 })).total;
    await supabaseRest(`segments?id=eq.${encodeURIComponent(row.id)}`, { method: 'PATCH', body: JSON.stringify({ contact_count: count }) }, req);
    sendJson(res, 201, { ...toCamelValue(row) as Record<string, unknown>, filters: normalizeSegmentFilters(row.filters), contactCount: count });
    return true;
  }
  if (method === 'PATCH' && id && segment && !match[2]) {
    const body = await readJson(req) as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) { const name = String(body.name).trim(); if (!name || name.length > 120) { sendJson(res, 400, { error: 'Invalid name' }); return true; } update.name = name; }
    if (body.description !== undefined) update.description = String(body.description);
    if (body.filters !== undefined) { if (!validateSegmentFilters(body.filters)) { sendJson(res, 400, { error: 'Invalid segment conditions' }); return true; } update.filters = normalizeSegmentFilters(body.filters); }
    if (body.segmentType !== undefined) update.segment_type = body.segmentType === 'static' ? 'static' : 'smart';
    const changed = await supabaseRest(`segments?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}`, { method: 'PATCH', body: JSON.stringify(update) }, req) as SegmentRow[];
    const row = changed[0];
    if (!row) { sendJson(res, 404, { error: 'Segment not found' }); return true; }
    const count = (await segmentPage(row, req, { limit: 1 })).total;
    await supabaseRest(`segments?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ contact_count: count }) }, req);
    sendJson(res, 200, { ...toCamelValue(row) as Record<string, unknown>, filters: normalizeSegmentFilters(row.filters), contactCount: count });
    return true;
  }
  if (method === 'DELETE' && id && !match[2]) {
    await supabaseRest(`segments?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(organizationId)}`, { method: 'DELETE' }, req);
    res.statusCode = 204; res.end(); return true;
  }
  if (id && match[2] === 'members' && segment?.segment_type === 'static' && (method === 'POST' || method === 'DELETE')) {
    const body = await readJson(req) as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.filter((value): value is string => typeof value === 'string' && uuidPattern.test(value)).slice(0, 500) : [];
    if (!ids.length) { sendJson(res, 400, { error: 'Contact ids are required' }); return true; }
    if (!ids.length) { sendJson(res, 400, { error: 'No contacts selected' }); return true; }
    const allowed: Array<{ id: string; organization_id: string | null }> = [];
    for (let start = 0; start < ids.length; start += 500) {
      const page = await supabaseRest(`leads?id=in.(${ids.slice(start,start+500).join(',')})&select=id,organization_id`, { method: 'GET' }, req) as Array<{ id: string; organization_id: string | null }>;
      allowed.push(...page);
    }
    const valid = allowed.filter((lead) => lead.organization_id === organizationId || (organizationId === contactOrganization && !lead.organization_id)).map((lead) => lead.id);
    if (valid.length !== ids.length) { sendJson(res, 403, { error: 'One or more contacts are outside this organization' }); return true; }
    if (method === 'POST') await supabaseRest('segment_contacts?on_conflict=segment_id,lead_id', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(valid.map((leadId) => ({ segment_id: id, lead_id: leadId }))) }, req);
    else await supabaseRest(`segment_contacts?segment_id=eq.${encodeURIComponent(id)}&lead_id=in.(${valid.join(',')})`, { method: 'DELETE' }, req);
    const count = (await segmentPage(segment, req, { limit: 1 })).total;
    await supabaseRest(`segments?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ contact_count: count }) }, req);
    sendJson(res, 200, { contactCount: count }); return true;
  }
  sendJson(res, 405, { error: 'Unsupported segment operation' });
  return true;
}

async function handleContactBulk(path: string, method: string, user: AuthenticatedUser, req: VercelRequest, res: VercelResponse): Promise<boolean> {
  if (path !== '/api/contacts/bulk' || method !== 'POST') return false;
  const role = normalizeDashboardRole(user.user_metadata?.role ?? user.app_metadata?.role);
  if (role === 'viewer' || role === 'client' || role === 'agent') { sendJson(res, 403, { error: 'Bulk contact actions are not available for this role' }); return true; }
  const organizationId = await resolveContactOrganization(user, req);
  if (!organizationId || !uuidPattern.test(organizationId)) { sendJson(res, 403, { error: 'No organization is assigned to this session' }); return true; }
  const body = await readJson(req) as { action?: string; ids?: unknown; segmentId?: string; value?: string; sequenceId?: string; targetSegmentId?: string; confirm?: boolean };
  const action = body.action ?? '';
  const validActions = ['add_tag','remove_tag','change_status','enroll_sequence','add_to_segment','export_csv','delete'];
  if (!validActions.includes(action)) { sendJson(res, 400, { error: 'Invalid bulk action' }); return true; }
  if (action === 'delete' && body.confirm !== true) { sendJson(res, 400, { error: 'Confirm deletion first' }); return true; }
  let ids: string[] = [];
  if (body.segmentId) {
    if (!uuidPattern.test(body.segmentId)) { sendJson(res, 400, { error: 'Invalid segment id' }); return true; }
    const rows = await supabaseRest(`segments?id=eq.${body.segmentId}&organization_id=eq.${organizationId}&select=*&limit=1`, { method: 'GET' }, req) as SegmentRow[];
    const segment = rows[0];
    if (!segment) { sendJson(res, 404, { error: 'Segment not found' }); return true; }
    const result = await supabaseRest('rpc/crm_segment_lead_ids', { method: 'POST', body: JSON.stringify({ p_organization_id: organizationId, p_filters: normalizeSegmentFilters(segment.filters), p_segment_id: segment.id, p_segment_type: segment.segment_type }) }, req) as string[];
    ids = Array.isArray(result) ? result : [];
  } else if (Array.isArray(body.ids)) {
    ids = [...new Set(body.ids.filter((value): value is string => typeof value === 'string' && uuidPattern.test(value)))].slice(0, 10000);
    if (ids.length !== body.ids.length) { sendJson(res, 400, { error: 'Invalid contact selection' }); return true; }
    if (!ids.length) { sendJson(res, 400, { error: 'No contacts selected' }); return true; }
    const allowed: Array<{ id: string; organization_id: string | null }> = [];
    for (let start = 0; start < ids.length; start += 500) {
      const page = await supabaseRest(`leads?id=in.(${ids.slice(start,start+500).join(',')})&select=id,organization_id`, { method: 'GET' }, req) as Array<{ id: string; organization_id: string | null }>;
      allowed.push(...page);
    }
    if (allowed.length !== ids.length || allowed.some((lead) => lead.organization_id !== organizationId && !(organizationId === contactOrganization && !lead.organization_id))) {
      sendJson(res, 403, { error: 'One or more contacts are outside this organization' }); return true;
    }
  }
  if (!ids.length) { sendJson(res, 400, { error: 'No matching contacts' }); return true; }
  if (action === 'enroll_sequence') {
    if (!body.sequenceId || !uuidPattern.test(body.sequenceId)) { sendJson(res, 400, { error: 'Choose a sequence' }); return true; }
    let enrolled = 0;
    for (let start = 0; start < ids.length; start += 500) {
      const result = await supabaseRest('rpc/outreach_sequence_bulk_enroll', { method: 'POST', body: JSON.stringify({ p_sequence: body.sequenceId, p_leads: ids.slice(start,start+500), p_actor: user.id, p_scope: null }) }, req) as { enrolled?: number };
      enrolled += Number(result.enrolled ?? 0);
    }
    sendJson(res, 200, { processed: ids.length, enrolled }); return true;
  }
  if (action === 'add_to_segment') {
    if (!body.targetSegmentId || !uuidPattern.test(body.targetSegmentId)) { sendJson(res, 400, { error: 'Choose a static segment' }); return true; }
    const rows = await supabaseRest(`segments?id=eq.${body.targetSegmentId}&organization_id=eq.${organizationId}&segment_type=eq.static&select=id&limit=1`, { method: 'GET' }, req) as Array<{ id: string }>;
    if (!rows.length) { sendJson(res, 400, { error: 'Choose a static segment' }); return true; }
    for (let start = 0; start < ids.length; start += 500) await supabaseRest('segment_contacts?on_conflict=segment_id,lead_id', { method: 'POST', headers: { prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(ids.slice(start,start+500).map((leadId) => ({ segment_id: body.targetSegmentId, lead_id: leadId }))) }, req);
    const target = { id: body.targetSegmentId, organization_id: organizationId, filters: {}, segment_type: 'static' } as SegmentRow;
    const count = (await segmentPage(target, req, { limit: 1 })).total;
    await supabaseRest(`segments?id=eq.${body.targetSegmentId}`, { method: 'PATCH', body: JSON.stringify({ contact_count: count }) }, req);
    sendJson(res, 200, { processed: ids.length }); return true;
  }
  if (action === 'export_csv') {
    const socialColumns = ['instagram','facebook','linkedin','x','tiktok','youtube','threads'] as const;
    const lines = [`Name,Company,Phone,Email,Tags,Status,Source,State,Created Date,${socialColumns.join(',')}`];
    const csvCell = (value: unknown) => { const raw = String(value ?? ''); const safe = /^[=+@-]/.test(raw) ? `\t${raw}` : raw; return `"${safe.replace(/"/g,'""')}"`; };
    for (let start = 0; start < ids.length; start += 500) {
      const pageIds = ids.slice(start,start+500);
      const [rows,handles] = await Promise.all([
        supabaseRest(`leads?id=in.(${pageIds.join(',')})&select=id,first_name,last_name,company,phone,email,tags,status,source,state,created_at`, { method: 'GET' }, req) as Promise<LeadRow[]>,
        supabaseRest(`social_primary_handles?organization_id=eq.${organizationId}&entity_type=eq.lead&entity_id=in.(${pageIds.join(',')})&select=entity_id,${socialColumns.join(',')}`, { method: 'GET' }, req) as Promise<Array<Record<string,string|null>>>,
      ]);
      const byId = new Map(handles.map((item) => [item.entity_id,item]));
      for (const row of rows) lines.push([`${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || row.company || 'Unnamed contact', row.company, row.phone, row.email, (row.tags ?? []).join('; '), row.status, row.source, row.state, row.created_at,...socialColumns.map((platform) => byId.get(String(row.id))?.[platform] ?? '')].map(csvCell).join(','));
    }
    res.setHeader('content-type','text/csv; charset=utf-8');
    res.setHeader('content-disposition','attachment; filename="contacts.csv"');
    res.statusCode = 200; res.end('\uFEFF'+lines.join('\r\n')); return true;
  }
  const value = String(body.value ?? '');
  const changed = await supabaseRest('rpc/crm_contact_bulk_action', { method: 'POST', body: JSON.stringify({ p_organization_id: organizationId, p_ids: ids, p_action: action, p_value: value }) }, req) as number;
  sendJson(res, 200, { processed: ids.length, changed });
  return true;
}

async function handleContactViews(path: string, method: string, user: AuthenticatedUser, req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const match = path.match(/^\/api\/contact-views(?:\/([^/]+))?$/);
  if (!match) return false;
  const organizationId = await resolveContactOrganization(user, req);
  if (!organizationId || !uuidPattern.test(organizationId)) { sendJson(res, 403, { error: 'No organization is assigned to this session' }); return true; }
  const id = match[1];
  if (id && !uuidPattern.test(id)) { sendJson(res, 400, { error: 'Invalid view id' }); return true; }
  const pathQuery = `crm_saved_views?organization_id=eq.${organizationId}&user_id=eq.${user.id}&object_type=eq.contacts${id ? `&id=eq.${id}` : ''}&select=*&order=created_at.desc`;
  if (method === 'GET') { sendJson(res, 200, toCamelValue(await supabaseRest(pathQuery, { method: 'GET' }, req))); return true; }
  if (method === 'POST' && !id) {
    const body = await readJson(req) as { name?: string; filters?: unknown; isDefault?: boolean };
    const name = String(body.name ?? '').trim();
    if (!name || name.length > 120 || !body.filters || typeof body.filters !== 'object') { sendJson(res, 400, { error: 'Name and filters are required' }); return true; }
    const result = await supabaseRest('crm_saved_views', { method: 'POST', body: JSON.stringify({ organization_id: organizationId, user_id: user.id, object_type: 'contacts', name, filters: body.filters, is_default: body.isDefault === true }) }, req);
    sendJson(res, 201, toCamelValue(Array.isArray(result) ? result[0] : result)); return true;
  }
  if (id && (method === 'PATCH' || method === 'DELETE')) {
    const existing = await supabaseRest(pathQuery, { method: 'GET' }, req) as unknown[];
    if (!existing.length) { sendJson(res, 404, { error: 'View not found' }); return true; }
    if (method === 'DELETE') { await supabaseRest(pathQuery.replace('&select=*&order=created_at.desc',''), { method: 'DELETE' }, req); res.statusCode = 204; res.end(); return true; }
    const body = await readJson(req) as { name?: string; filters?: unknown; isDefault?: boolean };
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) { const name = String(body.name).trim(); if (!name || name.length > 120) { sendJson(res, 400, { error: 'Invalid name' }); return true; } update.name = name; }
    if (body.filters !== undefined) update.filters = body.filters;
    if (body.isDefault !== undefined) update.is_default = body.isDefault === true;
    const result = await supabaseRest(pathQuery.replace('&select=*&order=created_at.desc',''), { method: 'PATCH', body: JSON.stringify(update) }, req);
    sendJson(res, 200, toCamelValue(Array.isArray(result) ? result[0] : result)); return true;
  }
  sendJson(res, 405, { error: 'Unsupported view operation' }); return true;
}

async function handleContactContext(path: string, method: string, user: AuthenticatedUser, req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const match = path.match(/^\/api\/contacts\/([^/]+)\/context$/);
  if (!match) return false;
  if (method !== 'GET') { sendJson(res, 405, { error: 'Unsupported contact operation' }); return true; }
  const id = match[1];
  if (!uuidPattern.test(id)) { sendJson(res, 400, { error: 'Invalid contact id' }); return true; }
  const organizationId = await resolveContactOrganization(user, req);
  if (!organizationId || !uuidPattern.test(organizationId)) { sendJson(res, 403, { error: 'No organization is assigned to this session' }); return true; }
  const leads = await supabaseRest(`leads?id=eq.${id}&select=id,organization_id,phone&limit=1`, { method: 'GET' }, req) as Array<{ id: string; organization_id: string | null; phone: string | null }>;
  const lead = leads[0];
  if (!lead || (lead.organization_id !== organizationId && !(organizationId === contactOrganization && !lead.organization_id))) { sendJson(res, 404, { error: 'Contact not found' }); return true; }
  const [contactTasks, jobs, enrollments, deals, crmContacts, calls] = await Promise.all([
    supabaseRest(`contact_tasks?lead_id=eq.${id}&select=id,title,is_completed,created_at,due_date&order=created_at.desc&limit=200`, { method: 'GET' }, req) as Promise<Array<{id:string;title:string;is_completed:boolean;created_at:string;due_date:string|null}>>,
    supabaseRest(`outreach_email_jobs?lead_id=eq.${id}&sent_at=not.is.null&select=id,subject,state,sent_at&order=sent_at.desc&limit=200`, { method: 'GET' }, req) as Promise<Array<{id:string;subject:string|null;state:string;sent_at:string}>>,
    supabaseRest(`sequence_enrollments?lead_id=eq.${id}&select=id,sequence_id,current_step,status,created_at,updated_at&order=created_at.desc&limit=200`, { method: 'GET' }, req) as Promise<Array<{id:string;sequence_id:string;current_step:number;status:string;created_at:string;updated_at:string}>>,
    supabaseRest(`crm_deals?organization_id=eq.${organizationId}&source_lead_id=eq.${id}&select=id,title,stage_id,next_action,stage_changed_at&order=created_at.desc&limit=100`, { method: 'GET' }, req) as Promise<Array<{id:string;title:string;stage_id:string|null;next_action:string|null;stage_changed_at:string|null}>>,
    supabaseRest(`crm_contacts?organization_id=eq.${organizationId}&source_lead_id=eq.${id}&select=id&limit=100`, { method: 'GET' }, req) as Promise<Array<{id:string}>>,
    supabaseRest('rpc/crm_contact_call_history', { method: 'POST', body: JSON.stringify({ p_organization_id: organizationId, p_phone: lead.phone ?? '' }) }, req) as Promise<Array<{id:string;call_date:string;direction:string|null;status:string|null;duration_seconds:number|null}>>,
  ]);
  const dealIds = deals.map((deal) => deal.id);
  const contactIds = crmContacts.map((contact) => contact.id);
  const linkFilter = [...(dealIds.length ? [`deal_id.in.(${dealIds.join(',')})`] : []), ...(contactIds.length ? [`contact_id.in.(${contactIds.join(',')})`] : [])].join(',');
  const [crmTasks, crmActivities, stages] = await Promise.all([
    linkFilter ? supabaseRest(`crm_tasks?organization_id=eq.${organizationId}&or=(${linkFilter})&select=id,title,completed,due_date,created_at&order=created_at.desc&limit=200`, { method: 'GET' }, req) as Promise<Array<{id:string;title:string;completed:boolean;due_date:string|null;created_at:string}>> : Promise.resolve([]),
    linkFilter ? supabaseRest(`crm_activities?organization_id=eq.${organizationId}&or=(${linkFilter})&select=id,type,body,occurred_at&order=occurred_at.desc&limit=200`, { method: 'GET' }, req) as Promise<Array<{id:string;type:string;body:string;occurred_at:string}>> : Promise.resolve([]),
    supabaseRest(`crm_pipeline_stages?organization_id=eq.${organizationId}&select=id,name`, { method: 'GET' }, req) as Promise<Array<{id:string;name:string}>>,
  ]);
  const stageNames = new Map(stages.map((stage) => [stage.id,stage.name]));
  const timeline = [
    ...contactTasks.map((task) => ({ id: task.id, type: 'task', description: task.title, createdAt: task.created_at, _type: 'contact_task' })),
    ...crmTasks.map((task) => ({ id: task.id, type: 'task', description: task.title, createdAt: task.created_at, _type: 'crm_task' })),
    ...jobs.map((job) => ({ id: job.id, type: 'email', description: `Sent: ${job.subject || '(no subject)'}`, createdAt: job.sent_at, _type: 'outreach_email' })),
    ...enrollments.flatMap((enrollment) => [{ id: enrollment.id, type: 'sequence', description: `Enrolled in sequence ${enrollment.sequence_id}`, createdAt: enrollment.created_at, _type: 'sequence_enrollment' },
      ...(enrollment.updated_at !== enrollment.created_at ? [{ id: `${enrollment.id}-step`, type: 'sequence', description: `Sequence step ${enrollment.current_step} · ${enrollment.status}`, createdAt: enrollment.updated_at, _type: 'sequence_step' }] : [])]),
    ...crmActivities.map((activity) => ({ id: activity.id, type: activity.type, description: activity.body, createdAt: activity.occurred_at, _type: 'crm_activity' })),
    ...calls.map((call) => ({ id: call.id, type: 'call', description: `${call.direction || 'Call'} · ${call.status || 'completed'}${call.duration_seconds ? ` · ${call.duration_seconds}s` : ''}`, createdAt: call.call_date, _type: 'call_history' })),
  ].filter((event) => event.createdAt).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,300);
  sendJson(res, 200, { timeline, opportunities: deals.map((deal) => ({ ...toCamelValue(deal) as Record<string, unknown>, stageName: deal.stage_id ? stageNames.get(deal.stage_id) ?? 'Unknown stage' : 'No stage' })),
    openTasks: [...contactTasks.filter((task) => !task.is_completed).map((task) => ({ id: task.id, title: task.title, dueDate: task.due_date })), ...crmTasks.filter((task) => !task.completed).map((task) => ({ id: task.id, title: task.title, dueDate: task.due_date }))] });
  return true;
}

async function handleContactOpportunity(path: string, method: string, user: AuthenticatedUser, req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const match = path.match(/^\/api\/contacts\/([^/]+)\/opportunities$/);
  if (!match) return false;
  if (method !== 'POST') { sendJson(res, 405, { error: 'Unsupported opportunity operation' }); return true; }
  const role = normalizeDashboardRole(user.user_metadata?.role ?? user.app_metadata?.role);
  if (role === 'viewer' || role === 'client' || role === 'agent') { sendJson(res, 403, { error: 'Opportunity creation is not available for this role' }); return true; }
  const id = match[1];
  const org = await resolveContactOrganization(user, req);
  if (!uuidPattern.test(id) || !org || !uuidPattern.test(org)) { sendJson(res, 400, { error: 'Invalid contact or organization' }); return true; }
  const leads = await supabaseRest(`leads?id=eq.${id}&select=id,first_name,last_name,company,phone,state,organization_id&limit=1`, { method: 'GET' }, req) as Array<{id:string;first_name:string|null;last_name:string|null;company:string|null;phone:string|null;state:string|null;organization_id:string|null}>;
  const lead = leads[0];
  if (!lead || (lead.organization_id !== org && !(org === contactOrganization && !lead.organization_id))) { sendJson(res, 404, { error: 'Contact not found' }); return true; }
  const body = await readJson(req) as { title?: string; stageId?: string };
  const title = String(body.title ?? '').trim();
  if (!title || title.length > 200) { sendJson(res, 400, { error: 'Enter an opportunity title' }); return true; }
  const stages = await supabaseRest(`crm_pipeline_stages?organization_id=eq.${org}&select=id,name&order=position.asc&limit=100`, { method: 'GET' }, req) as Array<{id:string;name:string}>;
  const stage = body.stageId ? stages.find((item) => item.id === body.stageId) : stages[0];
  if (!stage) { sendJson(res, 400, { error: 'Create a pipeline stage first' }); return true; }
  const companyName = lead.company?.trim() || `${lead.first_name ?? ''} ${lead.last_name ?? ''}`.trim() || 'Unnamed company';
  const existing = await supabaseRest(`crm_companies?organization_id=eq.${org}&name=ilike.${encodeURIComponent(companyName)}&select=id&limit=1`, { method: 'GET' }, req) as Array<{id:string}>;
  let companyId = existing[0]?.id;
  if (!companyId) {
    const created = await supabaseRest('crm_companies', { method: 'POST', body: JSON.stringify({ organization_id: org, name: companyName, phone: lead.phone, state: lead.state, created_by: user.id }) }, req) as Array<{id:string}>;
    companyId = created[0]?.id;
  }
  if (!companyId) throw new Error('Could not create company for opportunity');
  const deals = await supabaseRest('crm_deals', { method: 'POST', body: JSON.stringify({ organization_id: org, company_id: companyId, stage_id: stage.id, title, source_lead_id: id, created_by: user.id }) }, req);
  sendJson(res, 201, toCamelValue(Array.isArray(deals) ? deals[0] : deals)); return true;
}

async function listLeads(currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? "/api/leads", "https://local.invalid");
  const compactList = url.searchParams.get("includeActivity") === "false";
  const page = Math.max(Number(url.searchParams.get("page") ?? "1"), 1);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "50"), 1), 1000);
  const offset = (page - 1) * limit;
  const search = url.searchParams.get("search")?.trim();
  const status = url.searchParams.get("status")?.trim();
  const tag = url.searchParams.get("tag")?.trim();
  const source = url.searchParams.get("source")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const sort = url.searchParams.get("sort")?.trim() ?? "created_at";
  const direction = url.searchParams.get("direction") === "asc" ? "asc" : "desc";
  const orders: Record<string, string> = {
    created_at: `created_at.${direction},id.desc`,
    name: `first_name.${direction},last_name.${direction},id.desc`,
    company: `company.${direction},id.desc`,
    status: `status.${direction},id.desc`,
    source: `source.${direction},id.desc`,
  };
  if (!Object.hasOwn(orders, sort)) { sendJson(res, 400, { error: "Invalid sort field" }); return; }
  const disposition = url.searchParams.get("disposition")?.trim();
  const sequenceEligible = url.searchParams.get("sequenceEligible") === "true";
  const socialFilter = url.searchParams.get('socialFilter') || '';
  const socialFlags:Record<string,[string,string]> = {
    has_instagram:['has_instagram','true'],no_socials:['has_socials','false'],
    dmed_recently:['dmed_recently','true'],replied:['replied','true'],
  };
  if(socialFilter && (!socialFlags[socialFilter] || sequenceEligible)) {sendJson(res,400,{error:'Invalid social filter'});return;}
  const leadTable=socialFilter?'crm_social_leads':sequenceEligible?'outreach_eligible_leads':'leads';

  const query = new URLSearchParams({
    select: compactList
      ? "id,client_account_id,first_name,last_name,email,phone,company,title,source,state,status,disposition,contact_attempts,score,tags,custom_fields,created_at,updated_at,meeting_at"
      : "*",
    order: orders[sort],
    limit: String(limit),
    offset: String(offset),
  });
  const countQuery = new URLSearchParams({ select: "id" });
  if(socialFilter){
    const [column,value]=socialFlags[socialFilter];
    query.set(column,`eq.${value}`);countQuery.set(column,`eq.${value}`);
  }
  const currentRole = normalizeDashboardRole(currentUser.user_metadata?.role ?? currentUser.app_metadata?.role);
  const assignedClientId = clientAccountIdForUser(currentUser);
  const requestedClientId = url.searchParams.get("clientAccountId")?.trim() ?? "";
  const clientAccountId = clientLeadScope(currentUser) || assignedClientId || (canManageClientAccounts(currentUser) ? requestedClientId : "");
  if (requestedClientId && !/^[0-9a-f-]{36}$/i.test(requestedClientId)) {
    sendJson(res, 400, { error: "Invalid client account id" });
    return;
  }
  if (clientAccountId) {
    query.set("client_account_id", `eq.${clientAccountId}`);
    countQuery.set("client_account_id", `eq.${clientAccountId}`);
  }
  if (currentRole === "agent" && !assignedClientId) {
    const teamMemberId = currentUser.user_metadata?.team_member_id ?? currentUser.app_metadata?.team_member_id;
    if (typeof teamMemberId === "string" && teamMemberId) {
      query.set("custom_fields->>assigned_agent_id", `eq.${teamMemberId}`);
      countQuery.set("custom_fields->>assigned_agent_id", `eq.${teamMemberId}`);
    }
  }
  if (status) query.set("status", `eq.${status}`);
  if (status) countQuery.set("status", `eq.${status}`);
  if (source) { query.set("source", `eq.${source}`); countQuery.set("source", `eq.${source}`); }
  if (state) { query.set("state", `eq.${state}`); countQuery.set("state", `eq.${state}`); }
  if (tag) {
    if (!/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(tag)) { sendJson(res, 400, { error: "Invalid tag" }); return; }
    query.set("tags", `cs.{${tag}}`);
    countQuery.set("tags", `cs.{${tag}}`);
  }
  if (disposition) query.set("disposition", `eq.${disposition}`);
  if (disposition) countQuery.set("disposition", `eq.${disposition}`);
  if (search) {
    const safeSearch = search.replace(/[^\p{L}\p{N}@._+ -]/gu, ' ').trim().slice(0, 100);
    if (safeSearch) {
    const words = safeSearch.split(/\s+/).filter(Boolean);
    const fullName = words.length > 1 ? `,and(first_name.ilike.*${words[0]}*,last_name.ilike.*${words.slice(1).join(' ')}*)` : '';
    const searchFilter = `(first_name.ilike.*${safeSearch}*,last_name.ilike.*${safeSearch}*,email.ilike.*${safeSearch}*,company.ilike.*${safeSearch}*,phone.ilike.*${safeSearch}*${fullName})`;
    query.set("or", searchFilter);
    countQuery.set("or", searchFilter);
    }
  }

  const [rows, count] = await Promise.all([
    supabaseRest(`${leadTable}?${query.toString()}`, { method: "GET" }, req) as Promise<LeadRow[]>,
    sequenceEligible ? Promise.resolve(0) : supabaseRestCount(`${leadTable}?${countQuery.toString()}`, req),
  ]);

  const socialById = new Map<string,Record<string,unknown>>();
  if (url.searchParams.get('includeSocials') === 'true') {
    for (let start=0; start<rows.length; start+=100) {
      const ids=rows.slice(start,start+100).map((row)=>String(row.id));
      if (!ids.length) continue;
      const handles=await supabaseRest(`social_primary_handles?entity_type=eq.lead&entity_id=in.(${ids.join(',')})&select=entity_id,instagram,facebook,linkedin,x,tiktok,youtube,threads`,{method:'GET'},req) as Array<Record<string,unknown>>;
      for (const item of handles) socialById.set(String(item.entity_id),item);
    }
  }
  const mappedLeads = url.searchParams.get('includeActivity') === 'false' ? rows.map(leadFromRow) : await contactsWithActivity(rows, req);
  sendJson(res, 200, {
    leads: mappedLeads.map((lead)=>({...lead,socials:socialById.get(String(lead.id))||{}})),
    total: sequenceEligible
      ? (rows.length === limit ? offset + rows.length + 1 : offset + rows.length)
      : count,
    page,
    limit,
  });
}

type SequenceCompanyRow = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  contact_name?: string | null;
  contacts?: Array<{ name?: string; email?: string; phone?: string }> | null;
};

async function enrollSequenceCompanies(sequenceId: string, currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const body = await readJson(req) as { companyIds?: unknown };
  const companyIds = Array.isArray(body.companyIds)
    ? Array.from(new Set(body.companyIds.map(String))).filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100)
    : [];
  if (!companyIds.length) {
    sendJson(res, 400, { error: "Choose at least one company" });
    return;
  }

  const filter = encodeURIComponent(`in.(${companyIds.join(",")})`);
  const companies = await supabaseRest(
    `companies?id=${filter}&select=id,name,email,phone,contact_name,contacts`,
    { method: "GET" },
    req,
  ) as SequenceCompanyRow[];
  const recipients = new Map<string, { email: string; name: string; phone: string; company: string }>();
  const addRecipient = (email: unknown, name: unknown, phone: unknown, company: string) => {
    const normalized = String(email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || recipients.has(normalized)) return;
    recipients.set(normalized, {
      email: normalized,
      name: String(name ?? "").trim() || company,
      phone: String(phone ?? "").trim(),
      company,
    });
  };
  for (const company of companies) {
    addRecipient(company.email, company.contact_name, company.phone, company.name);
    for (const contact of company.contacts ?? []) addRecipient(contact.email, contact.name, contact.phone || company.phone, company.name);
  }
  if (!recipients.size) {
    sendJson(res, 400, { error: "The selected companies do not have email recipients" });
    return;
  }

  const emails = Array.from(recipients.keys());
  const existing = new Map<string, string>();
  const role = normalizeDashboardRole(currentUser.user_metadata?.role ?? currentUser.app_metadata?.role);
  const clientAccountId = role === "agent"
    ? String(currentUser.user_metadata?.client_account_id ?? currentUser.app_metadata?.client_account_id ?? "")
    : "";
  for (let start = 0; start < emails.length; start += 50) {
    const values = emails.slice(start, start + 50).map((email) => `"${email.replace(/["\\]/g, "")}"`).join(",");
    const scope = clientAccountId ? `&client_account_id=eq.${encodeURIComponent(clientAccountId)}` : "";
    const rows = await supabaseRest(
      `leads?normalized_email=${encodeURIComponent(`in.(${values})`)}${scope}&select=id,normalized_email`,
      { method: "GET" },
      req,
    ) as Array<{ id: string | number; normalized_email: string }>;
    for (const row of rows) if (!existing.has(row.normalized_email)) existing.set(row.normalized_email, String(row.id));
  }

  const missing = emails.filter((email) => !existing.has(email)).map((email) => {
    const recipient = recipients.get(email)!;
    const words = recipient.name.split(/\s+/).filter(Boolean);
    return {
      first_name: words.shift() || recipient.company,
      last_name: words.join(" ") || "Contact",
      email: recipient.email,
      phone: recipient.phone,
      company: recipient.company,
      source: "company_crm",
      ...(clientAccountId ? { client_account_id: clientAccountId } : {}),
    };
  });
  for (let start = 0; start < missing.length; start += 100) {
    const rows = await supabaseRest("leads", {
      method: "POST",
      body: JSON.stringify(missing.slice(start, start + 100)),
      headers: { prefer: "resolution=ignore-duplicates,return=representation" },
    }, req) as LeadRow[];
    for (const row of rows) existing.set(String(row.email).trim().toLowerCase(), String(row.id));
  }

  const leadIds = emails.map((email) => existing.get(email)).filter((id): id is string => !!id);
  let enrolled = 0;
  const scope = role === "agent" ? clientAccountId || "__unassigned__" : null;
  for (let start = 0; start < leadIds.length; start += 500) {
    const result = await supabaseRest("rpc/outreach_sequence_bulk_enroll", {
      method: "POST",
      body: JSON.stringify({
        p_sequence: sequenceId,
        p_leads: leadIds.slice(start, start + 500),
        p_actor: currentUser.id,
        p_scope: scope,
      }),
    }, req) as { enrolled?: number };
    enrolled += Number(result.enrolled ?? 0);
  }
  sendJson(res, 201, { enrolled, recipients: leadIds.length, companies: companies.length });
}

async function getLead(id: string, currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const rows = (await supabaseRest(`leads?id=eq.${encodeURIComponent(id)}${leadScopeSuffix(currentUser)}&select=*&limit=1`, {
    method: "GET",
  }, req)) as LeadRow[];
  if (!rows[0]) {
    sendJson(res, 404, { error: "Lead not found" });
    return;
  }
  sendJson(res, 200, leadFromRow(rows[0]));
}

async function insertActivities(leads: Array<{ id?: number | string }>, actor: string, req: VercelRequest, action: "created" | "imported" = "imported") {
  const activities = leads
    .filter((lead) => typeof lead.id === "number" || typeof lead.id === "string")
    .map((lead) => ({
      lead_id: lead.id,
      type: action,
      description: `Lead ${action} by ${actor}`,
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

async function createLead(currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as LeadInput;
  const lead = normalizeLead(body);
  const error = validateLead(lead);
  if (error) {
    sendJson(res, 400, { error });
    return;
  }
  if (await isMeetingStage(body.pipelineStageId, req) && !validMeetingAt(body.meetingAt)) {
    sendJson(res, 400, { error: "Meeting date and time are required" }); return;
  }

  const assignedClientId = clientAccountIdForUser(currentUser);
  const requestedClientId = typeof body.clientAccountId === "string" ? body.clientAccountId : "";
  const clientAccountId = assignedClientId || (canManageClientAccounts(currentUser) ? requestedClientId : "");
  if (requestedClientId && !/^[0-9a-f-]{36}$/i.test(requestedClientId)) {
    sendJson(res, 400, { error: "Invalid client account id" });
    return;
  }
  const inserted = (await supabaseRest("leads", {
    method: "POST",
    body: JSON.stringify({ ...leadInsertPayload(lead), ...(clientAccountId ? { client_account_id: clientAccountId } : {}) }),
  }, req)) as LeadRow[];

  await insertActivities(inserted, actorLabelForUser(currentUser), req, "created");
  sendJson(res, 201, inserted[0] ? leadFromRow(inserted[0]) : null);
}

async function updateLead(id: string, currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as LeadInput;
  if (body.disposition !== undefined || body.contactAttempts !== undefined) {
    sendJson(res,409,{error:'Use atomic call logging to change disposition or attempts.'}); return;
  }
  const update = leadUpdatePayload(body);
  if ((body.status === "meeting_booked" || await isMeetingStage(body.pipelineStageId, req)) && !validMeetingAt(body.meetingAt)) {
    sendJson(res, 400, { error: "Meeting date and time are required" }); return;
  }
  if (body.meetingAt !== undefined && body.meetingAt !== null && !validMeetingAt(body.meetingAt)) {
    sendJson(res, 400, { error: "Invalid meeting date and time" }); return;
  }
  update.updated_by = currentUser.id;

  const rows = (await supabaseRest(`leads?id=eq.${encodeURIComponent(id)}${leadScopeSuffix(currentUser)}`, {
    method: "PATCH",
    body: JSON.stringify(update),
  }, req)) as LeadRow[];

  if (!rows[0]) {
    sendJson(res, 404, { error: "Lead not found" });
    return;
  }

  if (typeof body.status === "string") {
    await supabaseRest("activities", {
      method: "POST",
      body: JSON.stringify({ lead_id: id, type: "status_changed", description: `Status set to "${body.status}" by ${actorLabelForUser(currentUser)}` }),
    }, req);
  }

  sendJson(res, 200, leadFromRow(rows[0]));
}

async function deleteLead(id: string, currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const existing = await supabaseRest(`leads?id=eq.${encodeURIComponent(id)}${leadScopeSuffix(currentUser)}&select=id&limit=1`, { method: "GET" }, req) as unknown[];
  if (!existing.length) { sendJson(res, 404, { error: "Lead not found" }); return; }
  try {
    await supabaseRest(`activities?lead_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }, req);
  } catch (error) {
    console.warn("Activity cleanup skipped", error);
  }
  await supabaseRest(`leads?id=eq.${encodeURIComponent(id)}${leadScopeSuffix(currentUser)}`, { method: "DELETE" }, req);
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

async function getClientWorkspaceStats(clientId: string, req: VercelRequest, res: VercelResponse) {
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
    sendJson(res, 400, { error: "Invalid client account id" });
    return;
  }

  const leads: Array<{ id: string | number; status?: string | null; disposition?: string | null; updated_at?: string | null }> = [];
  for (let offset = 0; ; offset += 500) {
    const page = await supabaseRest(
      `leads?client_account_id=eq.${encodeURIComponent(clientId)}&select=id,status,disposition,updated_at&order=id.asc&limit=500&offset=${offset}`,
      { method: "GET" },
      req,
    ) as typeof leads;
    leads.push(...page);
    if (page.length < 500) break;
  }

  const statuses: Record<string, number> = {};
  const dispositions: Record<string, number> = {};
  let lastUpdatedAt: string | null = null;
  for (const lead of leads) {
    const status = lead.status || "new";
    statuses[status] = (statuses[status] ?? 0) + 1;
    if (lead.disposition) dispositions[lead.disposition] = (dispositions[lead.disposition] ?? 0) + 1;
    if (lead.updated_at && (!lastUpdatedAt || lead.updated_at > lastUpdatedAt)) lastUpdatedAt = lead.updated_at;
  }

  let notes = 0;
  for (let start = 0; start < leads.length; start += 100) {
    const ids = leads.slice(start, start + 100).map((lead) => String(lead.id).replace(/[^0-9a-z-]/gi, ""));
    if (!ids.length) continue;
    const rows = await supabaseRest(`notes?lead_id=in.(${ids.join(",")})&select=id`, { method: "GET" }, req) as unknown[];
    notes += rows.length;
  }

  sendJson(res, 200, { total: leads.length, statuses, dispositions, notes, lastUpdatedAt });
}

async function createTeamInvite(currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as { name?: string; email?: string; role?: string; clientAccountId?: string | null; pagePermissions?: string[] };
  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const role = body.role ?? "member";
  if (!name || !email.includes("@")) { sendJson(res, 400, { error: "Name and a valid email are required" }); return; }
  if ((role === "agent" || role === "client") && !body.clientAccountId) { sendJson(res, 400, { error: "Select a client account" }); return; }
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

async function deleteLeads(currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (!ids.length) { sendJson(res, 400, { error: "At least one contact is required" }); return; }
  const rows = await supabaseRest(
    `leads?id=in.(${ids.map(encodeURIComponent).join(",")})${leadScopeSuffix(currentUser)}&select=id`,
    { method: "GET" },
    req,
  ) as Array<{ id: string | number }>;
  const allowedIds = rows.map((row) => String(row.id));
  if (allowedIds.length) {
    await supabaseRest(`leads?id=in.(${allowedIds.map(encodeURIComponent).join(",")})${leadScopeSuffix(currentUser)}`, { method: "DELETE" }, req);
  }
  sendJson(res, 200, { deleted: allowedIds.length });
}

type DuplicateLeadCandidate = {
  id: string | number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at?: string | null;
};

function normalizedDuplicatePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 7) return "";
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

async function findDuplicateLeads(currentUser: AuthenticatedUser, req: VercelRequest) {
  const rows: DuplicateLeadCandidate[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabaseRest(
      `leads?select=id,first_name,last_name,email,phone,created_at${leadScopeSuffix(currentUser)}&order=created_at.asc&limit=${pageSize}&offset=${offset}`,
      { method: "GET" },
      req,
    ) as DuplicateLeadCandidate[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const parent = rows.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]!));
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  const owners = new Map<string, number>();
  rows.forEach((row, index) => {
    const email = String(row.email ?? "").trim().toLowerCase();
    const phone = normalizedDuplicatePhone(row.phone);
    for (const key of [email ? `email:${email}` : "", phone ? `phone:${phone}` : ""].filter(Boolean)) {
      const owner = owners.get(key);
      if (owner === undefined) owners.set(key, index);
      else union(owner, index);
    }
  });

  const components = new Map<number, DuplicateLeadCandidate[]>();
  rows.forEach((row, index) => {
    const root = find(index);
    components.set(root, [...(components.get(root) ?? []), row]);
  });
  const groups = [...components.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      keep: group[0]!,
      remove: group.slice(1),
      matchedBy: [
        new Set(group.map((row) => String(row.email ?? "").trim().toLowerCase()).filter(Boolean)).size === 1 ? "email" : null,
        new Set(group.map((row) => normalizedDuplicatePhone(row.phone)).filter(Boolean)).size === 1 ? "phone" : null,
      ].filter(Boolean),
    }));
  return {
    groups,
    duplicateIds: groups.flatMap((group) => group.remove.map((row) => String(row.id))),
  };
}

async function scanDuplicateLeads(currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const result = await findDuplicateLeads(currentUser, req);
  sendJson(res, 200, {
    groupCount: result.groups.length,
    duplicateCount: result.duplicateIds.length,
    groups: result.groups.slice(0, 50).map((group) => ({
      keep: leadFromRow(group.keep as LeadRow),
      duplicates: group.remove.map((row) => leadFromRow(row as LeadRow)),
      matchedBy: group.matchedBy,
    })),
  });
}

async function removeDuplicateLeads(currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const body = await readJson(req) as { confirm?: boolean };
  if (body.confirm !== true) {
    sendJson(res, 400, { error: "Confirm duplicate removal before continuing" });
    return;
  }
  const result = await findDuplicateLeads(currentUser, req);
  for (let index = 0; index < result.duplicateIds.length; index += 100) {
    const ids = result.duplicateIds.slice(index, index + 100);
    await supabaseRest(
      `leads?id=in.(${ids.map(encodeURIComponent).join(",")})${leadScopeSuffix(currentUser)}`,
      { method: "DELETE" },
      req,
    );
  }
  sendJson(res, 200, {
    deleted: result.duplicateIds.length,
    groupsResolved: result.groups.length,
    kept: result.groups.length,
  });
}

type ContactGroupFilters = {
  type?: string;
  leadIds?: Array<string | number>;
  clientAccountId?: string | null;
  clientName?: string | null;
  agentId?: string | null;
  agentName?: string | null;
};

async function listContactGroups(req: VercelRequest, res: VercelResponse) {
  const rows = await supabaseRest(
    "segments?select=*&order=created_at.desc",
    { method: "GET" },
    req,
  ) as Array<Record<string, unknown>>;
  const groups = rows.filter((row) => {
    const filters = row.filters as ContactGroupFilters | null;
    return filters?.type === "contact_group";
  });
  sendJson(res, 200, groups.map(toCamelValue));
}

async function assignContactGroupLeads(
  group: Record<string, unknown>,
  leadIds: string[],
  clientAccountId: string | null,
  clientName: string | null,
  agentId: string | null,
  agentName: string | null,
  req: VercelRequest,
) {
  if (!leadIds.length) return;
  const rows = await supabaseRest(
    `leads?id=in.(${leadIds.map(encodeURIComponent).join(",")})&select=id,custom_fields`,
    { method: "GET" },
    req,
  ) as Array<{ id: string | number; custom_fields?: Record<string, unknown> | null }>;
  for (const row of rows) {
    const existingFields = row.custom_fields ?? {};
    const existingGroups = Array.isArray(existingFields.contact_group_ids)
      ? existingFields.contact_group_ids.map(String)
      : [];
    const update: Record<string, unknown> = {
      custom_fields: {
        ...existingFields,
        contact_group_ids: Array.from(new Set([...existingGroups, String(group.id)])),
        contact_group_name: group.name,
        assigned_client_name: clientName,
        assigned_agent_id: agentId,
        assigned_agent_name: agentName,
      },
    };
    if (clientAccountId) update.client_account_id = clientAccountId;
    await supabaseRest(`leads?id=eq.${encodeURIComponent(String(row.id))}`, {
      method: "PATCH",
      body: JSON.stringify(update),
    }, req);
  }
}

async function saveContactGroup(req: VercelRequest, res: VercelResponse) {
  const body = await readJson(req) as {
    groupId?: string | number;
    name?: string;
    description?: string;
    leadIds?: Array<string | number>;
    clientAccountId?: string | null;
    clientName?: string | null;
    agentId?: string | null;
    agentName?: string | null;
  };
  const leadIds = Array.from(new Set((Array.isArray(body.leadIds) ? body.leadIds : []).map(String).filter(Boolean)));
  if (!leadIds.length) {
    sendJson(res, 400, { error: "Select at least one contact" });
    return;
  }

  let group: Record<string, unknown> | undefined;
  if (body.groupId !== undefined && body.groupId !== null && String(body.groupId)) {
    const rows = await supabaseRest(
      `segments?id=eq.${encodeURIComponent(String(body.groupId))}&select=*&limit=1`,
      { method: "GET" },
      req,
    ) as Array<Record<string, unknown>>;
    group = rows[0];
    const currentFilters = (group?.filters ?? {}) as ContactGroupFilters;
    if (!group || currentFilters.type !== "contact_group") {
      sendJson(res, 404, { error: "Contact group not found" });
      return;
    }
    const combinedLeadIds = Array.from(new Set([...(currentFilters.leadIds ?? []).map(String), ...leadIds]));
    const updated = await supabaseRest(`segments?id=eq.${encodeURIComponent(String(group.id))}`, {
      method: "PATCH",
      body: JSON.stringify({
        filters: {
          ...currentFilters,
          leadIds: combinedLeadIds,
          clientAccountId: body.clientAccountId ?? currentFilters.clientAccountId ?? null,
          clientName: body.clientName ?? currentFilters.clientName ?? null,
          agentId: body.agentId ?? currentFilters.agentId ?? null,
          agentName: body.agentName ?? currentFilters.agentName ?? null,
        },
        contact_count: combinedLeadIds.length,
        updated_at: new Date().toISOString(),
      }),
    }, req) as Array<Record<string, unknown>>;
    group = updated[0] ?? group;
  } else {
    const name = String(body.name ?? "").trim();
    if (!name) {
      sendJson(res, 400, { error: "Group name is required" });
      return;
    }
    const rows = await supabaseRest("segments", {
      method: "POST",
      body: JSON.stringify({
        name,
        description: String(body.description ?? "").trim() || null,
        filters: {
          type: "contact_group",
          leadIds,
          clientAccountId: body.clientAccountId ?? null,
          clientName: body.clientName ?? null,
          agentId: body.agentId ?? null,
          agentName: body.agentName ?? null,
        },
        contact_count: leadIds.length,
      }),
    }, req) as Array<Record<string, unknown>>;
    group = rows[0];
  }

  if (!group?.id) {
    sendJson(res, 500, { error: "The contact group could not be saved" });
    return;
  }
  const filters = group.filters as ContactGroupFilters;
  await assignContactGroupLeads(
    group,
    leadIds,
    body.clientAccountId ?? filters.clientAccountId ?? null,
    body.clientName ?? filters.clientName ?? null,
    body.agentId ?? filters.agentId ?? null,
    body.agentName ?? filters.agentName ?? null,
    req,
  );
  sendJson(res, 200, toCamelValue(group));
}

async function analyticsReport(path: string, user: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const report = path.split("/").pop()!;
  if (!["overview", "by-status", "by-source", "lead-sources", "by-campaign", "timeline", "top-leads", "attribution"].includes(report)) {
    sendJson(res, 404, { error: "Report not found" }); return;
  }
  const clientAccountId = user.user_metadata?.client_account_id ?? user.app_metadata?.client_account_id;
  const scope = clientAccountId ? "&client_account_id=eq." + encodeURIComponent(String(clientAccountId)) : "";
  async function allRows(resource: string) {
    const rows: any[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await supabaseRest(resource + "&order=id.asc&limit=500&offset=" + offset, { method: "GET" }, req) as any[];
      rows.push(...page); if (page.length < 500) break;
    }
    return rows;
  }
  let leads = await allRows("leads?select=" + (report === "top-leads" ? "*" : "id,status,source,score,created_at,campaign_id") + scope);
  if (report === "top-leads") {
    sendJson(res, 200, leads.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10).map(leadFromRow)); return;
  }
  if (report === "attribution") {
    const days = new URL(req.url ?? "", "https://local.invalid").searchParams.get("days") ?? "all";
    if (!["all", "7", "30", "90"].includes(days)) { sendJson(res, 400, { error: "Choose all time, 7, 30 or 90 days." }); return; }
    if (days !== "all") { const cutoff = Date.now() - Number(days) * 86400000; leads = leads.filter(lead => Date.parse(lead.created_at) >= cutoff); }
  }
  const campaigns = ["by-campaign", "attribution"].includes(report) ? await allRows("campaigns?select=id,name") : [];
  const reports = leadReports(leads, campaigns);
  sendJson(res, 200, reports[report as keyof typeof reports]);
}

async function importLeads(currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const body = (await readJson(req)) as { leads?: LeadInput[]; campaignId?: number; clientAccountId?: string };
  const incoming = Array.isArray(body.leads) ? body.leads : [];
  const valid = incoming.map((lead) => normalizeLead({
    ...lead,
    firstName: lead.firstName ?? "",
    lastName: lead.lastName ?? "",
    email: lead.email ?? "",
    campaignId: body.campaignId ?? lead.campaignId,
  }));
  const errors: string[] = [];

  if (valid.length === 0) {
    sendJson(res, 400, {
      imported: 0,
      failed: incoming.length,
      total: incoming.length,
      errors: errors.length ? errors : ["No valid leads to import"],
    });
    return;
  }

  const assignedClientId = clientAccountIdForUser(currentUser);
  const requestedClientId = typeof body.clientAccountId === "string" ? body.clientAccountId : "";
  const clientAccountId = assignedClientId || (canManageClientAccounts(currentUser) ? requestedClientId : "");
  if (requestedClientId && !/^[0-9a-f-]{36}$/i.test(requestedClientId)) {
    sendJson(res, 400, { error: "Invalid client account id" });
    return;
  }

  const inserted = (await supabaseRest("leads", {
    method: "POST",
    body: JSON.stringify(valid.map((lead) => ({ ...leadInsertPayload(lead), ...(clientAccountId ? { client_account_id: clientAccountId } : {}) }))),
  }, req)) as Array<{ id?: number | string; organization_id?: string | null; custom_fields?: Record<string,unknown> }>;

  for(const row of inserted){
    if(!row.id||!row.custom_fields)continue;
    try{
      const profiles=importedSocials(row.custom_fields);
      for(const profile of profiles)await socialRest('social_profiles?on_conflict=organization_id,platform,normalized_handle,entity_type,entity_id',{
        method:'POST',headers:{prefer:'resolution=ignore-duplicates,return=representation'},
        body:JSON.stringify({organization_id:row.organization_id||'cfbaf78a-3caa-4cb2-a367-d3b3eb161ba1',
          entity_type:'lead',entity_id:row.id,platform:profile.platform,handle:profile.handle,
          normalized_handle:profile.normalizedHandle,profile_url:profile.profileUrl,source:'import',confidence:90}),
      });
    }catch(error){errors.push(`Lead ${row.id}: social profile needs review (${error instanceof Error?error.message:'invalid handle'})`);}
  }

  await insertActivities(inserted, actorLabelForUser(currentUser), req);
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

async function assertLeadAccess(leadId: string, currentUser: AuthenticatedUser, req: VercelRequest) {
  const rows = await supabaseRest(
    `leads?id=eq.${encodeURIComponent(leadId)}${leadScopeSuffix(currentUser)}&select=id&limit=1`,
    { method: "GET" },
    req,
  ) as unknown[];
  return rows.length > 0;
}

async function listLeadChildren(leadId: string, kind: keyof typeof leadChildTables, currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  if (!await assertLeadAccess(leadId, currentUser, req)) {
    sendJson(res, 404, { error: "Lead not found" });
    return;
  }
  const table = leadChildTables[kind];
  const rows = await supabaseRest(`${table}?lead_id=eq.${encodeURIComponent(leadId)}&select=*&order=created_at.desc`, {
    method: "GET",
  }, req);
  sendJson(res, 200, toCamelValue(rows));
}

async function createLeadChild(leadId: string, kind: keyof typeof leadChildTables, currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  if (!await assertLeadAccess(leadId, currentUser, req)) {
    sendJson(res, 404, { error: "Lead not found" });
    return;
  }
  const table = leadChildTables[kind];
  const body = (await readJson(req)) as Record<string, unknown>;
  if (kind === 'activities' && body.type === 'call') { sendJson(res,409,{error:'Log calls through the call queue to resolve the next action.'}); return; }
  const payload = stripUndefined({
    ...(toSnakeValue(body) as Record<string, unknown>),
    lead_id: leadId,
  });
  if (kind === "activities" && !payload.type) payload.type = "other";
  if (kind === "activities" && typeof payload.description === "string") {
    payload.description = `${payload.description} — recorded by ${actorLabelForUser(currentUser)}`;
  }
  if (kind === "tasks" && !payload.priority) payload.priority = "medium";
  const rows = await supabaseRest(table, {
    method: "POST",
    body: JSON.stringify(payload),
  }, req);
  const created = Array.isArray(rows) ? rows[0] ?? null : rows;
  if (kind === "notes") {
    await supabaseRest("activities", {
      method: "POST",
      body: JSON.stringify({ lead_id: leadId, type: "note_added", description: `Note added by ${actorLabelForUser(currentUser)}` }),
    }, req);
  }
  sendJson(res, 201, toCamelValue(created));
}

async function updateLeadChild(leadId: string, kind: keyof typeof leadChildTables, childId: string, currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  if (!await assertLeadAccess(leadId, currentUser, req)) {
    sendJson(res, 404, { error: "Lead not found" });
    return;
  }
  const table = leadChildTables[kind];
  const body = (await readJson(req)) as Record<string, unknown>;
  const payload = stripUndefined(toSnakeValue(body) as Record<string, unknown>);
  if (kind === "tasks" && payload.is_completed === true && !payload.completed_at) {
    payload.completed_at = new Date().toISOString();
  }
  if (kind === "tasks" && payload.is_completed === false) {
    payload.completed_at = null;
  }
  const rows = await supabaseRest(`${table}?id=eq.${encodeURIComponent(childId)}&lead_id=eq.${encodeURIComponent(leadId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }, req);
  sendJson(res, 200, Array.isArray(rows) ? toCamelValue(rows[0] ?? null) : toCamelValue(rows));
}

async function deleteLeadChild(leadId: string, kind: keyof typeof leadChildTables, childId: string, currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  if (!await assertLeadAccess(leadId, currentUser, req)) {
    sendJson(res, 404, { error: "Lead not found" });
    return;
  }
  const table = leadChildTables[kind];
  await supabaseRest(`${table}?id=eq.${encodeURIComponent(childId)}&lead_id=eq.${encodeURIComponent(leadId)}`, {
    method: "DELETE",
  }, req);
  if (kind === "notes") {
    await supabaseRest("activities", {
      method: "POST",
      body: JSON.stringify({ lead_id: leadId, type: "note_deleted", description: `Note deleted by ${actorLabelForUser(currentUser)}` }),
    }, req);
  }
  res.statusCode = 204;
  res.end();
}

async function handleLeadChildren(path: string, method: string, currentUser: AuthenticatedUser, req: VercelRequest, res: VercelResponse) {
  const match = getLeadChildMatch(path);
  if (!match) return false;

  if (!match.childId && method === "GET") {
    await listLeadChildren(match.leadId, match.kind, currentUser, req, res);
    return true;
  }
  if (!match.childId && method === "POST") {
    await createLeadChild(match.leadId, match.kind, currentUser, req, res);
    return true;
  }
  if (match.childId && (method === "PATCH" || method === "PUT")) {
    await updateLeadChild(match.leadId, match.kind, match.childId, currentUser, req, res);
    return true;
  }
  if (match.childId && method === "DELETE") {
    await deleteLeadChild(match.leadId, match.kind, match.childId, currentUser, req, res);
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

async function getPipelineLeads(req: VercelRequest, res: VercelResponse, currentUser: AuthenticatedUser) {
  const url = new URL(req.url ?? "/api/pipeline/leads", "https://local.invalid");
  const pipelineId = url.searchParams.get("pipelineId");
  const stagePath = pipelineId
    ? `pipeline_stages?pipeline_id=eq.${encodeURIComponent(pipelineId)}&select=*&order=position.asc`
    : "pipeline_stages?select=*&order=position.asc";
  const scope = clientLeadScope(currentUser);
  const [stages, leads] = await Promise.all([
    supabaseRest(stagePath, { method: "GET" }, req) as Promise<Array<Record<string, unknown>>>,
    supabaseRest(`leads?select=*&order=created_at.desc&limit=1000${scope ? `&client_account_id=eq.${encodeURIComponent(scope)}` : ""}`, { method: "GET" }, req) as Promise<LeadRow[]>,
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

async function updateLeadStage(path: string, method: string, req: VercelRequest, res: VercelResponse, currentUser: AuthenticatedUser) {
  if(path==='/api/pipeline/leads/stage'&&(method==='PATCH'||method==='PUT')){
    const body=await readJson(req) as {leadIds?:unknown[];stageId?:string|number|null;pipelineId?:string|number;meetingAt?:string;meetingTimezone?:string};const ids=[...new Set((body.leadIds??[]).map(String))];
    if(!ids.length||ids.length>1000||ids.some(id=>!/^[a-zA-Z0-9-]{1,80}$/.test(id))){sendJson(res,400,{error:'Choose 1 to 1,000 contacts'});return true;}
    if(body.stageId){const stages=await supabaseRest(`pipeline_stages?id=eq.${encodeURIComponent(String(body.stageId))}&select=id,pipeline_id&limit=1`,{method:'GET'},req) as Array<{id:string;pipeline_id:string}>;if(!stages.length||body.pipelineId&&String(stages[0].pipeline_id)!==String(body.pipelineId)){sendJson(res,400,{error:'Choose a stage in this pipeline'});return true;}}
    const meeting = await isMeetingStage(body.stageId, req);
    if(meeting && !validMeetingAt(body.meetingAt)){sendJson(res,400,{error:'Meeting date and time are required'});return true;}
    const payload={pipeline_stage_id:body.stageId??null,updated_by:currentUser.id,...(meeting?{status:'meeting_booked',meeting_at:body.meetingAt,meeting_timezone:body.meetingTimezone??null}:{})};
    let updated=0;for(let start=0;start<ids.length;start+=200){const values=ids.slice(start,start+200).join(',');const rows=await supabaseRest(`leads?id=in.(${values})`,{method:'PATCH',body:JSON.stringify(payload)},req) as LeadRow[];updated+=rows.length;}
    sendJson(res,200,{updated});return true;
  }
  const match = path.match(/^\/api\/pipeline\/leads\/([^/]+)\/stage$/);
  if (!match || (method !== "PATCH" && method !== "PUT")) return false;
  const leadId = decodeURIComponent(match[1] ?? "");
  const body = (await readJson(req)) as { stageId?: string | number | null; pipelineStageId?: string | number | null; meetingAt?: string; meetingTimezone?: string };
  const stageId = body.stageId ?? body.pipelineStageId ?? null;
  const meeting = await isMeetingStage(stageId, req);
  if (meeting && !validMeetingAt(body.meetingAt)) { sendJson(res, 400, { error: "Meeting date and time are required" }); return true; }
  const rows = await supabaseRest(`leads?id=eq.${encodeURIComponent(leadId)}`, {
    method: "PATCH",
    body: JSON.stringify({ pipeline_stage_id: stageId, updated_by: currentUser.id,
      ...(meeting ? { status: "meeting_booked", meeting_at: body.meetingAt, meeting_timezone: body.meetingTimezone ?? null } : {}) }),
  }, req) as LeadRow[];
  sendJson(res, 200, rows[0] ? leadFromRow(rows[0]) : null);
  return true;
}

async function getProspectFilters(res: VercelResponse) {
  const rows = await mcpPool.query("select distinct industry,company_size,seniority from public.prospects");
  const options = (key: "industry" | "company_size" | "seniority") =>
    [...new Set(rows.rows.map((row) => row[key]).filter((value) => typeof value === "string" && value.trim()))].sort();
  sendJson(res, 200, {
    industries: options("industry"), companySizes: options("company_size"),
    seniorities: options("seniority"),
  });
}

async function listCrmProspects(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? "/api/prospects/crm", "https://local.invalid");
  const search = (url.searchParams.get("search") || "").trim().slice(0, 120);
  const category = (url.searchParams.get("category") || "").trim().slice(0, 80);
  const status = (url.searchParams.get("status") || "").trim().slice(0, 60);
  const offset = Math.min(10000, Math.max(0, Number(url.searchParams.get("offset")) || 0));
  const where = [`true`];
  const args: unknown[] = [];
  if (search) {
    args.push(`%${search}%`);
    where.push(`(coalesce(company,'') ilike $${args.length} or coalesce(first_name,'') ilike $${args.length}
      or coalesce(last_name,'') ilike $${args.length} or coalesce(email,'') ilike $${args.length}
      or coalesce(phone,'') ilike $${args.length})`);
  }
  if (category) {
    args.push(`%${category}%`);
    where.push(`coalesce(custom_fields->'open_places'->>'category',custom_fields->>'industry','') ilike $${args.length}`);
  }
  if (status) { args.push(status); where.push(`status=$${args.length}`); }
  const filter = where.join(" and ");
  const count = await mcpPool.query(`select count(*)::int as total from public.leads where ${filter}`, args);
  const rows = await mcpPool.query(`select id,first_name,last_name,company,email,phone,status,source,state,
    dnc,suppressed_reason,tags,created_at,custom_fields->>'city' as city,
    coalesce(custom_fields->'open_places'->>'category',custom_fields->>'industry') as category
    from public.leads where ${filter} order by created_at desc,id desc
    limit 100 offset $${args.length + 1}`, [...args, offset]);
  sendJson(res, 200, { prospects: rows.rows.map(toCamelValue), total: count.rows[0]?.total || 0,
    limit: 100, offset });
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
  const body = (await readJson(req)) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : [];
  if (!ids.length || ids.length > 500 || ids.some((id) => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) {
    sendJson(res, 400, { error: "Select 1 to 500 prospects" });
    return;
  }
  const client = await mcpPool.connect();
  let saved = 0;
  try {
    await client.query("begin");
    const { rows } = await client.query(
      "select * from public.prospects where id=any($1::uuid[]) for update", [ids]);
    for (const prospect of rows) {
      if (prospect.saved_to_leads) continue;
      const phone = prospect.phone ? String(prospect.phone) : null;
      const email = prospect.email ? String(prospect.email).trim().toLowerCase() : null;
      if (!phone && !email) continue;
      const eligible = await client.query(`select not exists (
        select 1 from public.leads where (normalized_phone=public.outreach_phone($1))
          or ($2::text is not null and normalized_email=$2)
        union all select 1 from public.outreach_suppressions where
          (identity_type='phone' and identity_value=public.outreach_phone($1)) or
          (identity_type='email' and identity_value=$2)
      ) as available`, [phone, email]);
      if (!eligible.rows[0]?.available) continue;
      const inserted = await client.query(`insert into public.leads
        (first_name,last_name,email,phone,company,title,source,status,custom_fields)
        values($1,$2,$3,$4,$5,$6,'prospect_search','new',$7::jsonb) returning id`,
        [prospect.first_name, prospect.last_name, email, phone, prospect.company,
          prospect.title, JSON.stringify({ prospect_id: prospect.id, city: prospect.city, state: prospect.state })]);
      await client.query("update public.prospects set saved_to_leads=true,lead_id=$2,updated_at=now() where id=$1",
        [prospect.id, inserted.rows[0].id]);
      saved++;
    }
    await client.query("commit");
    sendJson(res, 200, { saved, skipped: ids.length - saved });
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
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
  if (!["/api/scraper/url", "/api/scraper/domain", "/api/scraper/search", "/api/scraper/import"].includes(path)) {
    return false;
  }

  const body = (await readJson(req)) as Record<string, unknown>;
  if (path === "/api/scraper/import") {
    const contacts = Array.isArray(body.contacts) ? body.contacts as Array<Record<string, unknown>> : [];
    if (!contacts.length || contacts.length > 100) { sendJson(res, 400, { error: "Select 1 to 100 contacts" }); return true; }
    const client = await mcpPool.connect();
    let imported = 0;
    try {
      await client.query("begin");
      for (const contact of contacts) {
        const email = String(contact.email || "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) continue;
        const phone = String(contact.phone || "").trim().slice(0, 40) || null;
        const exists = await client.query(`select exists(
          select 1 from public.leads where normalized_email=$1 or
            ($2::text is not null and normalized_phone=public.outreach_phone($2))
          union all select 1 from public.outreach_suppressions where
            (identity_type='email' and identity_value=$1) or
            (identity_type='phone' and identity_value=public.outreach_phone($2))
        ) as blocked`, [email, phone]);
        if (exists.rows[0]?.blocked) continue;
        await client.query(`insert into public.leads(first_name,last_name,email,phone,company,title,source,status,custom_fields)
          values($1,$2,$3,$4,$5,$6,'web_scrape','new',$7::jsonb)`, [
          String(contact.firstName || "").slice(0, 100), String(contact.lastName || "").slice(0, 100),
          email, phone, String(contact.company || "").slice(0, 200) || null,
          String(contact.title || "").slice(0, 100) || null,
          JSON.stringify({ source_url: String(contact.sourceUrl || "").slice(0, 500) }),
        ]);
        imported++;
      }
      await client.query("commit");
      sendJson(res, 200, { imported, skipped: contacts.length - imported });
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
    return true;
  }
  const query = String(body.url ?? body.domain ?? body.query ?? "").trim();
  if (!query) {
    sendJson(res, 400, { error: "url, domain, or query is required" });
    return true;
  }

  if (query.length > 500) { sendJson(res, 400, { error: "URL or domain is too long" }); return true; }
  if (path === "/api/scraper/url") {
    sendJson(res, 200, await fetchWebsiteContacts(query)); return true;
  }
  if (path === "/api/scraper/domain") {
    sendJson(res, 200, await scanDomain(query)); return true;
  }
  sendJson(res, 400, { error: "For a local business search, use Prospecting. For website contacts, enter a company domain or a public URL." });
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
  let auditPromise: Promise<void> | undefined;
  try {
    const path = pathFromUrl(req.url);
    const method = (req.method ?? "GET").toUpperCase();
    const emailPath=path.replace(/^\/api/,'');
    async function runEmail(authenticated:boolean,user?:AuthenticatedUser) {
      try {
        let raw='';let body:unknown={};
        if(emailPath.startsWith('/email/events/')) {
          if(typeof req.body==='string') raw=req.body;
          else if(Buffer.isBuffer(req.body)) raw=req.body.toString('utf8');
          else if(req.body!==undefined) throw new EmailInputError('Signed events require raw request bodies');
          else raw=await new Promise<string>((resolve,reject)=>{const chunks:Buffer[]=[];req.on('data',x=>chunks.push(x));req.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));req.on('error',reject);});
          body=JSON.parse(raw);
        } else if(emailPath==='/email/unsubscribe') body={token:new URL(req.url??'/', 'https://local.invalid').searchParams.get('token')};
        else if(!['GET','HEAD'].includes(method)) body=await readJson(req);
        else body=Object.fromEntries(new URL(req.url??'/', 'https://local.invalid').searchParams.entries());
        const service=new EmailService((name,data)=>supabaseRest(`rpc/${name}`,{method:'POST',body:JSON.stringify(data)},req),mailboxTransport,undefined,undefined,undefined,inboxAdapter);
        const reply=await service.handle({path:emailPath,method,body,raw,headers:Object.fromEntries(Object.entries(req.headers).map(([k,v])=>[k.toLowerCase(),Array.isArray(v)?v[0]??'':v??''])),actor:user?.id??'system',scope:user?.user_metadata?.role==='agent'?String(user.user_metadata.client_account_id??'__unassigned__'):null,authenticated});
        res.setHeader('Cache-Control','no-store');if(reply.text){res.statusCode=reply.status;res.setHeader('content-type','text/plain; charset=utf-8');res.end(reply.body);}else sendJson(res,reply.status,reply.body);
      }catch(error){console.error('Email operation failed',{path:emailPath,method,message:error instanceof Error?error.message:'unknown'});const failure=emailOperationError(error);sendJson(res,failure.status,{error:failure.error});}
    }
    async function runWorkflow(authenticated:boolean,user?:AuthenticatedUser) {
      try{
        const body=!['GET','HEAD'].includes(method)?await readJson(req):{};
        const email=new EmailService((name,data)=>supabaseRest(`rpc/${name}`,{method:'POST',body:JSON.stringify(data)},req),mailboxTransport,undefined,undefined,undefined,inboxAdapter);
        const workflows=new WorkflowService((name,data)=>supabaseRest(`rpc/${name}`,{method:'POST',body:JSON.stringify(data)},req),email);
        const reply=await workflows.handle({path:emailPath,method,body,raw:'',headers:Object.fromEntries(Object.entries(req.headers).map(([k,v])=>[k.toLowerCase(),Array.isArray(v)?v[0]??'':v??''])),actor:user?.id??'system',scope:user?.user_metadata?.role==='agent'?String(user.user_metadata.client_account_id??'__unassigned__'):null,authenticated});
        res.setHeader('Cache-Control','no-store');sendJson(res,reply.status,reply.body);
      }catch(error){console.error('Workflow operation failed',{path:emailPath,method,message:error instanceof Error?error.message:'unknown'});const failure=emailOperationError(error);sendJson(res,failure.status,{error:failure.error});}
    }
    if(isPublicEmailEndpoint(emailPath)) {await runEmail(false);return;}
    if(isPublicWorkflowEndpoint(emailPath)) {await runWorkflow(false);return;}

    if (path === "/api/healthz") {
      if (new URL(req.url || path, "https://app.victorysync.com").searchParams.get("deep") === "1") {
        const checks = await Promise.allSettled([
          fetch(`${supabaseUrl}/rest/v1/forms?select=id&limit=1`, {
            headers: { apikey: supabaseKey || "", authorization: `Bearer ${supabaseKey || ""}` },
            signal: AbortSignal.timeout(8000),
          }).then(response => response.status),
          mcpPool.query("select 1").then(() => true),
        ]);
        const restStatus = checks[0].status === "fulfilled" ? checks[0].value : null;
        const databaseReachable = checks[1].status === "fulfilled";
        const healthy = restStatus === 200 && databaseReachable;
        sendJson(res, healthy ? 200 : 503, { status: healthy ? "ok" : "degraded", supabaseRestStatus: restStatus, databaseReachable });
        return;
      }
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
    const claimedRole = String(currentUser.user_metadata?.role ?? "");
    if (path !== "/api/auth/sync-session" && path !== "/api/activity/events" &&
      (["agency_staff", "client_owner", "client_staff"].includes(claimedRole) ||
        (["member", "viewer", "agent", "client"].includes(claimedRole) && await portalEnabledForUser(req)))) {
      sendJson(res, 403, { message: "Use the client portal for this account" }); return;
    }
    if(path==='/api/activity/events'&&method==='POST'){
      const body=await readJson(req) as Record<string,unknown> | null;
      const entries=Array.isArray(body?.events)?body.events:[body];
      if (!entries.length || entries.length > 50 || entries.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
        sendJson(res,400,{error:'Provide 1 to 50 activity events'});return;
      }
      const events=entries.map((item) => {
        const event=item as Record<string,unknown>;
        return {eventType:String(event.eventType??'interaction'),action:String(event.action??'unknown'),pagePath:typeof event.pagePath==='string'?event.pagePath:null,target:typeof event.target==='string'?event.target:null,requestMethod:typeof event.requestMethod==='string'?event.requestMethod:null,requestStatus:typeof event.requestStatus==='number'?event.requestStatus:null,sessionId:typeof event.sessionId==='string'?event.sessionId:null,metadata:event.metadata&&typeof event.metadata==='object'&&!Array.isArray(event.metadata)?event.metadata as Record<string,unknown>:undefined};
      });
      await recordPortalActivities(req,currentUser,events);
      sendJson(res,201,{recorded:true});return;
    }
    if(path==='/api/activity/logs'&&method==='GET'){
      const role=String(currentUser.user_metadata?.role??'member');if(!['owner','admin'].includes(role)){sendJson(res,403,{error:'Only owners and administrators can view the activity log'});return;}
      const q=new URL(req.url??'/', 'https://local.invalid').searchParams;
      const result=await supabaseRest('rpc/portal_activity_list',{method:'POST',body:JSON.stringify({p_query:q.get('query'),p_event_type:q.get('type'),p_limit:Number(q.get('limit')??100),p_offset:Number(q.get('offset')??0),p_org:null})},req);sendJson(res,200,result);return;
    }
    auditPromise = recordPortalActivity(req,currentUser,{eventType:'api',action:'api_request',pagePath:path,requestMethod:method});
    if (/^\/api\/(companies|company-crm)(\/|$)/.test(path)) {
      const result = await companyCrmRequest(method, req.url ?? path, getHeader(req, "authorization") ?? "", currentUser, () => readJson(req));
      sendJson(res, result.status, result.data);
      return;
    }
    if (method === "POST" && path === "/api/auth/sync-session") {
      await syncDashboardTeamMember(currentUser, req, res);
      return;
    }
    if (!currentUser.crmRoleVerified) {
      sendJson(res, 403, { message: "No Lead Gen Hub access is assigned to this account" }); return;
    }
    const role = normalizeDashboardRole(currentUser.user_metadata?.role ?? currentUser.app_metadata?.role);
    const status = String(currentUser.user_metadata?.status ?? "active");
    if (status === "inactive" || status === "deactivated") {
      sendJson(res, 403, { message: "This CRM account has been deactivated" });
      return;
    }
    if ((role === "viewer" || role === "client") && method !== "GET") {
      sendJson(res, 403, { message: "This account has read-only access" });
      return;
    }
    if (role === "client" && !(
      path === "/api/leads" || /^\/api\/leads\/[^/]+$/.test(path) ||
      path === "/api/pipeline/leads" || path === "/api/pipeline/stages" || path === "/api/pipelines"
    )) {
      sendJson(res, 403, { message: "This page is not available to client accounts" }); return;
    }
    if (role === "agent" && !(
      path === "/api/leads" || /^\/api\/leads\/[^/]+$/.test(path) ||
      /^\/api\/leads\/[^/]+\/(calls|outreach)$/.test(path) ||
      path === "/api/outreach/queue" || path === "/api/outreach/needs-timezone" ||
      path === "/api/dispositions" || path === "/api/pipeline/leads" ||
      /^\/api\/pipeline\/leads\/[^/]+\/stage$/.test(path) ||
      path === "/api/pipeline/leads/stage" || path === "/api/pipeline/stages" ||
      path === "/api/pipelines"
    )) {
      sendJson(res, 403, { message: "Agent access is limited to assigned contacts" }); return;
    }
    if (role === "agent" && method !== "GET" && (path === "/api/pipelines" || path === "/api/pipeline/stages")) {
      sendJson(res, 403, { message: "Only administrators can change pipeline settings" }); return;
    }
    if ((role === "agent" || Boolean(clientAccountIdForUser(currentUser))) && /^\/api\/(?:team|sub-accounts|api-keys)/.test(path)) {
      sendJson(res, 403, { message: "Client and agent accounts cannot manage workspace access" });
      return;
    }
    const pagePermissions = currentUser.user_metadata?.page_permissions;
    const requiredPermission = apiPermissionForPath(path);
    if (role !== "owner" && Array.isArray(pagePermissions) && requiredPermission && !pagePermissions.includes(requiredPermission)) {
      sendJson(res, 403, { message: `Access to ${requiredPermission} is disabled for this account` });
      return;
    }

    const enrollCompaniesMatch = emailPath.match(/^\/sequences\/([^/]+)\/enroll-companies$/);
    if (enrollCompaniesMatch && method === "POST") {
      await enrollSequenceCompanies(decodeURIComponent(enrollCompaniesMatch[1]), currentUser, req, res);
      return;
    }

    if (method === "GET" && path.startsWith("/api/analytics/")) {
      await analyticsReport(path, currentUser, req, res); return;
    }

    if(isEmailEndpoint(emailPath)) {await runEmail(true,currentUser);return;}
    if(isWorkflowEndpoint(emailPath)) {await runWorkflow(true,currentUser);return;}
    if (path === '/api/dispositions') {
      if (method === 'GET') sendJson(res, 200, DISPOSITIONS.map((name,id)=>({id:id+1,name,color:'#f97316'})));
      else sendJson(res, 405, {error:'Outreach dispositions are fixed'});
      return;
    }
    if (path.startsWith('/api/outreach/') || /^\/api\/leads\/[^/]+\/(calls|outreach)$/.test(path)) {
      const scope = role === 'agent' ? String(currentUser.user_metadata?.client_account_id ?? '__unassigned__') : null;
      if (method === 'GET' && path === '/api/outreach/queue') {
        const timezone = new URL(req.url ?? '/', 'https://local.invalid').searchParams.get('timezone');
        sendJson(res,200,await supabaseRest('rpc/outreach_call_queue',{method:'POST',body:JSON.stringify({p_timezone:timezone,p_client:scope})},req));
        return;
      }
      if (method === 'GET' && path === '/api/outreach/needs-timezone') {
        if (scope === '__unassigned__') { sendJson(res,200,[]); return; }
        const query = new URLSearchParams({select:'id,first_name,last_name,company,phone,custom_fields',timezone_confirmed:'eq.false',order:'created_at.asc,id.asc',limit:'100'});
        if (scope) query.set('client_account_id',`eq.${scope}`);
        sendJson(res,200,await supabaseRest(`outreach_eligible_leads?${query}`,{method:'GET'},req));
        return;
      }
      const match = path.match(/^\/api\/leads\/([^/]+)\/(calls|outreach)$/);
      if (match && method === 'POST' && match[2] === 'calls') {
        try {
          const data = parseCall(await readJson(req));
          sendJson(res,201,await supabaseRest('rpc/outreach_log_call',{method:'POST',body:JSON.stringify({...data,p_lead_id:decodeURIComponent(match[1]),p_actor:currentUser.id,p_client:scope})},req));
        } catch (error) { sendJson(res,400,{error:error instanceof Error ? error.message : 'Invalid call'}); }
        return;
      }
      if (match && method === 'PATCH' && match[2] === 'outreach') {
        try {
          if (scope === '__unassigned__') { sendJson(res,404,{error:'Lead not found'}); return; }
          const data = parseOutreachUpdate(await readJson(req));
          const query = new URLSearchParams({id:`eq.${decodeURIComponent(match[1])}`});
          if (scope) query.set('client_account_id',`eq.${scope}`);
          const rows = await supabaseRest(`leads?${query}`,{method:'PATCH',body:JSON.stringify(data)},req) as unknown[];
          sendJson(res,rows.length ? 200 : 404,rows[0] ?? {error:'Lead not found'});
        } catch (error) { sendJson(res,400,{error:error instanceof Error ? error.message : 'Invalid update'}); }
        return;
      }
      sendJson(res,405,{error:'Unsupported outreach operation'});
      return;
    }
    if (method === "GET" && path === "/api/leads") {
      await listLeads(currentUser, req, res);
      return;
    }

    if (method === "POST" && path === "/api/leads") {
      await createLead(currentUser, req, res);
      return;
    }

    if (method === "DELETE" && path === "/api/leads") {
      await deleteLeads(currentUser, req, res);
      return;
    }

    if (method === "GET" && path === "/api/leads/duplicates") {
      await scanDuplicateLeads(currentUser, req, res);
      return;
    }

    if (method === "DELETE" && path === "/api/leads/duplicates") {
      await removeDuplicateLeads(currentUser, req, res);
      return;
    }

    if (method === "GET" && path === "/api/contact-groups") {
      await listContactGroups(req, res);
      return;
    }

    if (method === "POST" && path === "/api/contact-groups") {
      await saveContactGroup(req, res);
      return;
    }

    const leadId = getLeadId(path);
    if (leadId && method === "GET") {
      await getLead(leadId, currentUser, req, res);
      return;
    }

    if (leadId && method === "PATCH") {
      await updateLead(leadId, currentUser, req, res);
      return;
    }

    if (leadId && method === "DELETE") {
      await deleteLead(leadId, currentUser, req, res);
      return;
    }

    if (method === "POST" && path === "/api/leads/import") {
      await importLeads(currentUser, req, res);
      return;
    }

    if (await handleLeadChildren(path, method, currentUser, req, res)) {
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
      sendJson(res,409,{error:'Email sending is paused until outreach email infrastructure is configured.'});
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
      await getPipelineLeads(req, res, currentUser);
      return;
    }

    if (await updateLeadStage(path, method, req, res, currentUser)) {
      return;
    }

    if (method === "GET" && path === "/api/prospects/filters") {
      await getProspectFilters(res);
      return;
    }

    if (method === "GET" && path === "/api/prospects/crm") {
      await listCrmProspects(req, res);
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

    const clientWorkspaceStatsMatch = path.match(/^\/api\/sub-accounts\/([^/]+)\/workspace-stats$/);
    if (method === "GET" && clientWorkspaceStatsMatch?.[1]) {
      await getClientWorkspaceStats(decodeURIComponent(clientWorkspaceStatsMatch[1]), req, res);
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

    if (await handleContactOpportunity(path, method, currentUser, req, res)) {
      return;
    }

    if (await handleContactContext(path, method, currentUser, req, res)) {
      return;
    }

    if (await handleContactViews(path, method, currentUser, req, res)) {
      return;
    }

    if (await handleContactBulk(path, method, currentUser, req, res)) {
      return;
    }

    if (await handleContactActivity(path, method, req, res)) {
      return;
    }

    if (await handleContactSegments(path, method, currentUser, req, res)) {
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
  } finally {
    // Finish the audit after the response has been sent, without delaying data work.
    if (auditPromise) await auditPromise;
  }
}
