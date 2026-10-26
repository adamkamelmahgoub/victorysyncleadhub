import { mcpPool } from "./mcp-auth.js";

export type EnrichmentMode = "google" | "ai" | "both";
export type EnrichmentProvider = "open_places" | "google_places" | "combined";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validUuid(value: string): boolean { return uuid.test(value); }

export async function edgeCall(name: "enrich-google" | "enrich-ai" | "enrich-company" | "enrichment-worker" | "find-new-leads", body: unknown): Promise<any> {
  const base = process.env.SUPABASE_URL;
  const key = process.env.ENRICHMENT_INVOKE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!base || !key) throw new Error("Supabase Edge Functions are not configured");
  const response = await fetch(`${base}/functions/v1/${name}`, {
    method: "POST", headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(180000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) throw new Error(String(data.error || `Edge Function ${name} returned ${response.status}`));
  return data;
}
export async function enrichCompany(companyId: string, mode: EnrichmentMode = "both", grid: 3 | 5 = 3,
  provider: EnrichmentProvider = "combined") {
  if (!validUuid(companyId)) throw new Error("Invalid company ID");
  return edgeCall("enrich-company", { company_id: companyId, mode, grid, provider });
}
export async function askAboutCompany(companyId: string, question: string) {
  if (!validUuid(companyId) || !question.trim() || question.length > 2000)
    throw new Error("Company ID and a question up to 2,000 characters are required");
  return edgeCall("enrich-company", { company_id: companyId, question });
}
export async function findNewLeads(city: string, state: string, radiusMi: number,
  category?: string, query?: string) {
  if (!city.trim() || city.length > 100 || !state.trim() || state.length > 40 ||
      !Number.isFinite(radiusMi) || radiusMi <= 0 || radiusMi > 50)
    throw new Error("City, state, and radius_mi from 1 to 50 are required");
  if (category && query) throw new Error("Choose a category or a search phrase");
  return edgeCall("find-new-leads", { city: city.trim(), state: state.trim(), radius_mi: radiusMi,
    category: category?.trim(), query: query?.trim() });
}
export async function enrichLead(leadId: string, mode: EnrichmentMode, grid: 3 | 5,
  provider: EnrichmentProvider = "combined") {
  if (!validUuid(leadId)) throw new Error("Invalid lead ID");
  const result: Record<string, unknown> = {};
  if (mode === "google" || mode === "both")
    result[provider === "open_places" ? "open_places" : "google"] =
      await edgeCall("enrich-google", { lead_id: leadId, grid, provider });
  if (mode === "ai" || mode === "both")
    result.ai = await edgeCall("enrich-ai", { lead_id: leadId });
  return result;
}
export async function askAboutLead(leadId: string, question: string) {
  if (!validUuid(leadId)) throw new Error("Invalid lead ID");
  if (!question.trim() || question.length > 2000) throw new Error("Question must be 1–2,000 characters");
  return edgeCall("enrich-ai", { lead_id: leadId, question });
}
export async function leadEnrichment(leadId: string) {
  if (!validUuid(leadId)) throw new Error("Invalid lead ID");
  const result = await mcpPool.query(
    `select e.source,e.status,e.error,e.data,e.cost_usd,e.fetched_at
     from public.lead_enrichment e where e.lead_id=$1
     order by e.fetched_at desc limit 30`, [leadId],
  );
  return result.rows;
}
export async function budgetStatus() {
  const q = await mcpPool.query(
    `select s.enrichment_budget_usd as monthly_budget_usd,
       coalesce(e.reserved_usd,0) as month_reserved_usd
     from public.enrichment_settings s left join public.enrichment_spend e
       on e.month=date_trunc('month',now() at time zone 'UTC')::date
     where s.id=true`,
  );
  return q.rows[0] || { monthly_budget_usd: 0, month_reserved_usd: 0 };
}
export const estimateCost = (count: number, mode: EnrichmentMode, grid: 3 | 5) =>
  Math.round(count * ((mode === "ai" ? 0 : (grid * grid + 1) * 0.035) +
    (mode === "google" ? 0 : 0.2)) * 100) / 100;

type BulkSelector = { segment_id?: string; tag?: string; tags?: string[]; lead_ids?: string[] };
async function selectLeadIds(selector: BulkSelector): Promise<string[]> {
  const supplied = [selector.segment_id, selector.tag || selector.tags?.length, selector.lead_ids].filter(Boolean);
  if (supplied.length !== 1) throw new Error("Supply exactly one of segment_id, tag/tags or lead_ids");
  if (selector.lead_ids) {
    if (!selector.lead_ids.length || selector.lead_ids.length > 5000 || selector.lead_ids.some((id) => !validUuid(id)))
      throw new Error("lead_ids must contain 1–5,000 UUIDs");
    const q = await mcpPool.query("select id from public.leads where id=any($1::uuid[])", [selector.lead_ids]);
    return q.rows.map((row) => row.id);
  }
  if (selector.segment_id) {
    if (!validUuid(selector.segment_id)) throw new Error("Invalid segment ID");
    const q = await mcpPool.query("select filters from public.segments where id=$1", [selector.segment_id]);
    if (!q.rows[0]) throw new Error("Segment not found");
    const filters = q.rows[0].filters || {};
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => { values.push(value); conditions.push(sql.replace("?", `$${values.length}`)); };
    if (filters.tag) add("tags @> array[?]::text[]", filters.tag);
    if (filters.tags) add("tags @> ?::text[]", filters.tags);
    if (filters.status) add("status=?", filters.status);
    if (filters.source) add("source=?", filters.source);
    if (filters.scoreMin !== undefined) add("score>=?", Number(filters.scoreMin));
    if (filters.scoreMax !== undefined) add("score<=?", Number(filters.scoreMax));
    if (filters.search) add("concat_ws(' ',first_name,last_name,email,company) ilike ?", `%${filters.search}%`);
    if (!conditions.length) throw new Error("Segment has no supported filters");
    const leads = await mcpPool.query(`select id from public.leads where ${conditions.join(" and ")} limit 5000`, values);
    return leads.rows.map((row) => row.id);
  }
  const tags = selector.tags?.length ? selector.tags : [selector.tag!];
  if (tags.some((tag) => !tag || tag.length > 100)) throw new Error("Invalid tag");
  const q = await mcpPool.query("select id from public.leads where tags @> $1::text[] limit 5000", [tags]);
  return q.rows.map((row) => row.id);
}
export async function previewBulk(selector: BulkSelector, mode: EnrichmentMode, grid: 3 | 5) {
  const leadIds = await selectLeadIds(selector);
  return { count: leadIds.length, estimated_cost_usd: estimateCost(leadIds.length, mode, grid),
    budget: await budgetStatus() };
}
export async function bulkEnrich(selector: BulkSelector, mode: EnrichmentMode, grid: 3 | 5, maxCostUsd: number | null, createdBy: string | null) {
  const leadIds = await selectLeadIds(selector);
  if (!leadIds.length) throw new Error("No leads matched");
  if (maxCostUsd !== null && (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0))
    throw new Error("max_cost_usd must be positive");
  const db = await mcpPool.connect();
  try {
    await db.query("begin");
    const q = await db.query(
      `insert into public.enrichment_jobs(segment_id,lead_ids,mode,grid,total,max_cost_usd,created_by)
       values($1,$2,$3,$4,$5,$6,$7) returning id`,
      [selector.segment_id || null, leadIds, mode, grid, leadIds.length, maxCostUsd, createdBy],
    );
    const jobId = q.rows[0].id as string;
    await db.query(
      `insert into public.enrichment_job_items(job_id,lead_id)
       select $1,unnest($2::uuid[])`, [jobId, leadIds],
    );
    await db.query("commit");
    return { job_id: jobId, total: leadIds.length, estimated_cost_usd: estimateCost(leadIds.length, mode, grid) };
  } catch (error) { await db.query("rollback"); throw error; }
  finally { db.release(); }
}
export async function jobStatus(jobId: string) {
  if (!validUuid(jobId)) throw new Error("Invalid job ID");
  const q = await mcpPool.query("select id,status,total,done,failed,cost_usd,max_cost_usd,created_at,finished_at from public.enrichment_jobs where id=$1", [jobId]);
  if (!q.rows[0]) throw new Error("Job not found");
  const tags = await mcpPool.query("select public.enrichment_job_tag_counts($1) as counts", [jobId]);
  return { ...q.rows[0], tag_counts: tags.rows[0]?.counts || {} };
}
export async function resumeEnrichmentJob(jobId: string) {
  if (!validUuid(jobId)) throw new Error("Invalid job ID");
  const q = await mcpPool.query(
    "update public.enrichment_jobs set status='queued', updated_at=now() where id=$1 and status='paused_budget' returning id,status",
    [jobId],
  );
  if (!q.rows[0]) throw new Error("Job is not paused or does not exist");
  return q.rows[0];
}
