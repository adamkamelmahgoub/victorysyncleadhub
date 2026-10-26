import type { IncomingMessage, ServerResponse } from "node:http";
import { allowedEmail, mcpPool } from "../lib/mcp-auth.js";
import { askAboutLead, askAboutCompany, bulkEnrich, edgeCall, enrichLead, enrichCompany, jobStatus, leadEnrichment, previewBulk, resumeEnrichmentJob, validUuid } from "../lib/enrichment-client.js";

export const config = { api: { bodyParser: false }, maxDuration: 300 };
function respond(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(data));
}
async function body(req: IncomingMessage): Promise<Record<string, any>> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 500000) throw new Error("Request is too large");
  }
  return JSON.parse(raw || "{}");
}
async function admin(req: IncomingMessage): Promise<{ id: string; email: string }> {
  const header = req.headers.authorization;
  const auth = Array.isArray(header) ? header[0] : header;
  if (!auth?.startsWith("Bearer ")) throw new Error("Sign in to Victory Sync first");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase Auth is not configured");
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, authorization: auth }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Session expired; sign in again");
  const user = await response.json() as { id: string; email: string; email_confirmed_at?: string };
  if (!user.email_confirmed_at || !allowedEmail(user.email))
    throw new Error("Enrichment is available to the CRM administrator only");
  return user;
}
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const user = await admin(req);
    const url = new URL(req.url || "/api/enrichment", "https://local.invalid");
    const action = url.searchParams.get("action");
    if (req.method === "GET" && action === "lead") {
      const id = url.searchParams.get("lead_id") || "";
      if (!validUuid(id)) throw new Error("Invalid lead ID");
      const q = await mcpPool.query(
        "select custom_fields->'google' as google,custom_fields->'open_places' as open_places,custom_fields->'enrichment' as enrichment from public.leads where id=$1", [id],
      );
      if (!q.rows[0]) throw new Error("Lead not found");
      respond(res, 200, { ...q.rows[0], history: await leadEnrichment(id) }); return;
    }
    if (req.method === "GET" && action === "company") {
      const id = url.searchParams.get("company_id") || "";
      if (!validUuid(id)) throw new Error("Invalid company ID");
      const q = await mcpPool.query("select custom_fields,fit_notes from public.companies where id=$1", [id]);
      if (!q.rows[0]) throw new Error("Company not found");
      respond(res, 200, q.rows[0]); return;
    }
    if (req.method === "GET" && action === "job") {
      respond(res, 200, await jobStatus(url.searchParams.get("job_id") || "")); return;
    }
    if (req.method !== "POST") { respond(res, 405, { error: "Method not allowed" }); return; }
    const input = await body(req);
    if (action === "discover") {
      const discovered = await edgeCall("find-new-leads", { action: "preview", city: input.city,
        state: input.state, radius_mi: input.radius_mi, pages: input.pages || 1,
        category: input.category, query: input.query });
      const places = Array.isArray(discovered.places) ? discovered.places : [];
      const phones = [...new Set(places.map((place: Record<string, any>) =>
        String(place.phone || "").replace(/\D/g, "").slice(-10)).filter((phone: string) => phone.length === 10))]
        .map((phone) => `+1${phone}`);
      const unavailable = new Set<string>();
      if (phones.length) {
        const existing = await mcpPool.query(
          `select identity_value from public.outreach_suppressions where identity_type='phone' and identity_value=any($1::text[])
           union select normalized_phone from public.leads where normalized_phone=any($1::text[])`, [phones]);
        for (const row of existing.rows) unavailable.add(String(row.identity_value || row.normalized_phone));
      }
      respond(res, 200, { ...discovered, places: places.map((place: Record<string, any>) => ({
        ...place, already_saved: unavailable.has(`+1${String(place.phone || "").replace(/\D/g, "").slice(-10)}`),
      })) }); return;
    }
    if (action === "import_places") {
      respond(res, 200, await edgeCall("find-new-leads", { action: "import", city: input.city,
        state: input.state, radius_mi: input.radius_mi, places: input.places })); return;
    }
    if (["preview", "bulk", "enrich"].includes(action || "")) {
      input.mode ||= "both";
      input.grid ||= action === "enrich" ? 5 : 3;
      if (!["google", "ai", "both"].includes(input.mode) || ![3, 5].includes(input.grid))
        throw new Error("Choose mode google, ai or both and grid 3 or 5");
    }
    if (action === "preview") {
      respond(res, 200, await previewBulk(input, input.mode, input.grid || 3)); return;
    }
    if (action === "bulk") {
      respond(res, 200, await bulkEnrich(input, input.mode, input.grid || 3,
        input.max_cost_usd ?? null, user.id)); return;
    }
    if (action === "enrich") {
      respond(res, 200, await enrichLead(input.lead_id, input.mode || "both", input.grid || 5,
        input.provider || "combined")); return;
    }
    if (action === "company_enrich") {
      respond(res, 200, await enrichCompany(input.company_id, input.mode || "both", input.grid || 3,
        input.provider || "combined")); return;
    }
    if (action === "company_ask") {
      respond(res, 200, await askAboutCompany(input.company_id, input.question)); return;
    }
    if (action === "ask") {
      respond(res, 200, await askAboutLead(input.lead_id, input.question)); return;
    }
    if (action === "resume") {
      respond(res, 200, await resumeEnrichmentJob(input.job_id)); return;
    }
    if (action === "save_note") {
      if (!validUuid(input.lead_id) || typeof input.note !== "string" || !input.note.trim() || input.note.length > 5000)
        throw new Error("Lead ID and a note up to 5,000 characters are required");
      await mcpPool.query("update public.leads set notes=$2 || E'\\n' || coalesce(notes,'') where id=$1",
        [input.lead_id, input.note.trim()]);
      respond(res, 200, { saved: true }); return;
    }
    respond(res, 404, { error: "Unknown enrichment action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enrichment request failed";
    respond(res, message.includes("budget") ? 402 : message.includes("Sign in") || message.includes("Session") ? 401 :
      message.includes("administrator") ? 403 : 400, { error: message });
  }
}
