// Shared by Supabase Edge Functions. Only server-side service credentials are used.
import { z } from "npm:zod@3.25.76";
import { leadSearchCenter, stateCode, stateFromAreaCode } from "./us-centers.ts";
declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const INVOKE_KEY = Deno.env.get("ENRICHMENT_INVOKE_KEY") || SERVICE_KEY;
const GOOGLE_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") || "";
const OPEN_PLACES_KEY = Deno.env.get("OPEN_PLACES_API_KEY") || "";
const OPENROUTER_KEY = Deno.env.get("OPENROUTER_API_KEY") || "";
const OPENROUTER_MODEL = Deno.env.get("OPENROUTER_MODEL") || "nvidia/nemotron-3.5-lightning:free";
const OPENROUTER_RESEARCH_MODEL = Deno.env.get("OPENROUTER_RESEARCH_MODEL") || "nvidia/nemotron-3.5-lightning";
const GOOGLE_CALL_USD = 0.035; // Conservative current Text Search Enterprise list price.
const AI_RESERVE_USD = 0.1;
const MONTHLY_BUDGET_MESSAGE = "Monthly enrichment budget reached";

export type Mode = "google" | "ai" | "both";
export type Lead = {
  id: string; company: string | null; phone: string | null;
  normalized_phone: string | null; email: string | null; state: string | null;
  first_name: string | null; last_name: string | null; notes: string | null;
  tags: string[]; custom_fields: Record<string, unknown>;
};
type OpenPlace = {
  place_id: string; name: string; lat: number; lon: number; distance_mi?: number;
  category?: string; categories?: string[]; category_hierarchy?: string[];
  address?: { formatted?: string; street?: string; locality?: string; region?: string;
    postal_code?: string; country_code?: string };
  phone?: string; website?: string; confidence?: number; operating_status?: string;
  match?: unknown;
};
type OpenPlacesResponse = { results: OpenPlace[]; meta?: Record<string, unknown> };
type Place = {
  id: string; displayName?: { text?: string }; formattedAddress?: string;
  addressComponents?: Array<{ longText: string; shortText: string; types: string[] }>;
  location?: { latitude: number; longitude: number }; nationalPhoneNumber?: string;
  websiteUri?: string; rating?: number; userRatingCount?: number;
  primaryType?: string; types?: string[]; regularOpeningHours?: unknown;
  businessStatus?: string;
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
export function authorize(req: Request): void {
  const header = req.headers.get("authorization") || "";
  if (!INVOKE_KEY || header !== `Bearer ${INVOKE_KEY}`)
    throw new Error("Unauthorized enrichment request");
}
export function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Enrichment failed";
  return json({ error: message }, message.includes("Unauthorized") ? 401 :
    message.includes("budget") ? 402 : 400);
}
async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase service is not configured");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json", prefer: "return=representation",
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 350)}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
export const database = rest;
export async function leadById(id: string): Promise<Lead> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Invalid lead ID");
  const rows = await rest<Lead[]>(`leads?id=eq.${encodeURIComponent(id)}&select=id,company,phone,normalized_phone,email,state,first_name,last_name,notes,tags,custom_fields`);
  if (!rows[0]) throw new Error("Lead not found");
  return rows[0];
}
export async function logCall(leadId: string, source: "open_places" | "google_places" | "google_rank" | "ai_research", data: Record<string, unknown>, status: "ok" | "not_found" | "error", cost: number, error?: string): Promise<void> {
  await rest("lead_enrichment", { method: "POST", body: JSON.stringify({
    lead_id: leadId, source, data, status, error: error || null, cost_usd: cost,
    expires_at: source === "google_places" || source === "google_rank"
      ? new Date(Date.now() + 29 * 86400000).toISOString() : null,
  }) });
}
async function logEntityCall(id: string | null, companyId: string | null, source: "google_places" | "google_rank" | "ai_research", data: Record<string, unknown>, status: "ok" | "not_found" | "error", cost: number, error?: string): Promise<void> {
  if (id) return logCall(id, source, data, status, cost, error);
  await rest("enrichment_api_log", { method: "POST", body: JSON.stringify({
    provider: source, lead_id: null, request: { company_id: companyId, ...data, error }, status,
    cost_usd: cost,
  }) });
}
async function reserve(amount: number): Promise<void> {
  const allowed = await rest<boolean>("rpc/enrichment_reserve_cost", {
    method: "POST", body: JSON.stringify({ p_amount: amount }),
  });
  if (!allowed) throw new Error(MONTHLY_BUDGET_MESSAGE);
}
async function release(amount: number): Promise<void> {
  if (amount > 0) await rest("rpc/enrichment_release_cost", {
    method: "POST", body: JSON.stringify({ p_amount: amount }),
  });
}
async function slack(message: string): Promise<void> {
  const url = Deno.env.get("SLACK_WEBHOOK_URL");
  if (!url) return;
  await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: message }) });
}
async function budgetNotice(): Promise<void> {
  await slack("Victory Sync enrichment paused: monthly budget reached.").catch(() => {});
}
const digits = (phone: string | null | undefined) => (phone || "").replace(/\D/g, "").slice(-10);
const normalized = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const nameScore = (name: string, candidate: string) => {
  const words = normalized(name).match(/.{1,3}/g) || [];
  return words.filter((word) => normalized(candidate).includes(word)).length / Math.max(words.length, 1);
};
const openPlaceSchema = z.object({
  place_id: z.string(), name: z.string(), lat: z.number(), lon: z.number(),
  distance_mi: z.number().optional(), category: z.string().optional(),
  categories: z.array(z.string()).optional(), category_hierarchy: z.array(z.string()).optional(),
  address: z.object({ formatted: z.string().optional(), street: z.string().optional(),
    locality: z.string().optional(), region: z.string().optional(),
    postal_code: z.string().optional(), country_code: z.string().optional() }).optional(),
  phone: z.string().optional(), website: z.string().optional(),
  confidence: z.number().optional(), operating_status: z.string().optional(), match: z.unknown().optional(),
}).passthrough();
const openPlacesSchema = z.object({ results: z.array(openPlaceSchema), meta: z.record(z.unknown()).optional() });
export async function openPlacesSearch(leadId: string | null, params: { q?: string; category?: string;
  lat: number; lon: number; radius_mi?: number; mode?: "all" | "name" | "address";
  limit?: number; offset?: number; min_confidence?: number }): Promise<OpenPlacesResponse> {
  if (!OPEN_PLACES_KEY) throw new Error("OPEN_PLACES_API_KEY is not configured");
  if (!Number.isFinite(params.lat) || Math.abs(params.lat) > 90 ||
      !Number.isFinite(params.lon) || Math.abs(params.lon) > 180 ||
      !params.q && !params.category ||
      (params.radius_mi ?? 25) <= 0 || (params.radius_mi ?? 25) > 50 ||
      (params.limit ?? 10) < 1 || (params.limit ?? 10) > (params.category ? 50 : 20) ||
      (params.min_confidence !== undefined && (params.min_confidence < 0 || params.min_confidence > 1)))
    throw new Error("Invalid Open Places search parameters");
  const allowed = await rest<boolean>("rpc/enrichment_reserve_api_call", {
    method: "POST", body: JSON.stringify({ p_provider: "open_places" }),
  });
  if (!allowed) throw new Error("Open Places budget exhausted until the 1st");
  const url = new URL("https://api.openplacesapi.com/v1/places");
  for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  const audit = async (status: string) => rest("enrichment_api_log", { method: "POST",
    body: JSON.stringify({ provider: "open_places", lead_id: leadId, request: params, status, cost_usd: 0 }) });
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${OPEN_PLACES_KEY}` },
      signal: AbortSignal.timeout(20000) });
  } catch (error) {
    await audit("network_error");
    if (leadId) await logCall(leadId, "open_places", { params }, "error", 0, String(error));
    throw error;
  }
  if (response.status === 402) {
    await audit("quota_exhausted");
    await rest("rpc/enrichment_block_api_month", {
      method: "POST", body: JSON.stringify({ p_provider: "open_places" }),
    });
    if (leadId) await logCall(leadId, "open_places", { params }, "error", 0, "Monthly quota exhausted");
    await slack("Victory Sync Open Places searches paused until next month: provider quota exhausted.").catch(() => {});
    throw new Error("Open Places budget exhausted until the 1st");
  }
  const payload = await response.json();
  if (!response.ok) {
    await audit(`http_${response.status}`);
    if (leadId) await logCall(leadId, "open_places", { params, response: payload }, "error", 0,
      `Open Places HTTP ${response.status}`);
    throw new Error(`Open Places API: HTTP ${response.status}`);
  }
  let data: OpenPlacesResponse;
  try { data = openPlacesSchema.parse(payload) as OpenPlacesResponse; }
  catch (error) {
    await audit("invalid_response");
    if (leadId) await logCall(leadId, "open_places", { params, response: payload }, "error", 0,
      `Invalid response: ${String(error).slice(0,300)}`);
    throw error;
  }
  await audit(data.results.length ? "ok" : "not_found");
  if (leadId) await logCall(leadId, "open_places", { params, response: data },
    data.results.length ? "ok" : "not_found", 0);
  return data;
}
export async function enrichOpenPlaces(leadId: string): Promise<{ status: "ok" | "not_found";
  place?: OpenPlace; match_confidence?: number }> {
  const lead = await leadById(leadId);
  if (!lead.company) throw new Error("Lead has no company name");
  const wantedState = stateCode(lead.state || String(lead.custom_fields?.state || "")) ||
    stateFromAreaCode(lead.normalized_phone || lead.phone);
  const center = leadSearchCenter(wantedState, lead.normalized_phone || lead.phone);
  if (!center) {
    await rest(`leads?id=eq.${encodeURIComponent(leadId)}`, { method: "PATCH", body: JSON.stringify({
      tags: [...new Set([...lead.tags, "enrich-op-not-found"])],
    }) });
    return { status: "not_found" };
  }
  const data = await openPlacesSearch(leadId, { q: lead.company, lat: center[0], lon: center[1],
    radius_mi: 50, mode: "name", limit: 20, min_confidence: 0.7 });
  const sameState = data.results.filter((place) => !wantedState ||
    stateCode(place.address?.region) === wantedState);
  const phone = digits(lead.normalized_phone || lead.phone);
  const phoneMatch = phone ? sameState.find((place) => digits(place.phone) === phone) : undefined;
  const bestName = sameState.sort((a,b) => nameScore(lead.company!, b.name) - nameScore(lead.company!, a.name))[0];
  const match = phoneMatch || (bestName && nameScore(lead.company, bestName.name) >= 0.6 ? bestName : undefined);
  if (!match) {
    await rest(`leads?id=eq.${encodeURIComponent(leadId)}`, { method: "PATCH", body: JSON.stringify({
      tags: [...new Set([...lead.tags, "enrich-op-not-found"])],
    }) });
    return { status: "not_found" };
  }
  const matchConfidence = phoneMatch ? 1 : Math.round(nameScore(lead.company, match.name) * 100) / 100;
  const city = match.address?.locality || null;
  const state = stateCode(match.address?.region) || wantedState;
  const openFields = { ...match, match_confidence: matchConfidence, fetched_at: new Date().toISOString(),
    attribution: "Open Places / Overture Maps" };
  const fields = { ...lead.custom_fields, open_places: openFields,
    ...(!lead.custom_fields?.city && city ? { city } : {}) };
  const line = `${new Date().toISOString().slice(0,10)} | Business listing (Open Places / Overture) | ${match.name} | ${city || "unknown city"}, ${state || "unknown state"} | ${match.category || "unknown category"} | ${match.website || "no website listed"}`;
  await rest(`leads?id=eq.${encodeURIComponent(leadId)}`, { method: "PATCH", body: JSON.stringify({
    custom_fields: fields, notes: `${line}\n${lead.notes || ""}`,
    tags: lead.tags.filter((tag) => tag !== "enrich-op-not-found"),
    ...(!lead.state && state ? { state } : {}),
  }) });
  return { status: "ok", place: match, match_confidence: matchConfidence };
}
async function placesSearch(leadId: string | null, source: "google_places" | "google_rank", operation: string, body: Record<string, unknown>, fieldMask: string, companyId: string | null = null): Promise<Place[]> {
  if (!GOOGLE_KEY) throw new Error("GOOGLE_PLACES_API_KEY is not configured");
  try { await reserve(GOOGLE_CALL_USD); } catch (error) { await budgetNotice(); throw error; }
  if (source === "google_places") {
    let quota: boolean;
    try { quota = await rest<boolean>("rpc/enrichment_reserve_api_call", {
      method: "POST", body: JSON.stringify({ p_provider: "google_places" }),
    }); } catch (error) { await release(GOOGLE_CALL_USD); throw error; }
    if (!quota) {
      await release(GOOGLE_CALL_USD);
      throw new Error("Google Places monthly cap reached");
    }
  }
  let logged = false;
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST", headers: {
        "content-type": "application/json", "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": fieldMask,
      }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    const result = await response.json() as { places?: Place[]; error?: { message?: string } };
    await logEntityCall(leadId, companyId, source, { operation, result_count: result.places?.length || 0 }, response.ok ? "ok" : "error", GOOGLE_CALL_USD, result.error?.message);
    logged = true;
    if (!response.ok) throw new Error(`Places API: ${result.error?.message || response.status}`);
    return result.places || [];
  } catch (error) {
    // The reservation is intentionally retained when billing status is unknown.
    if (!logged) await logEntityCall(leadId, companyId, source, { operation }, "error", GOOGLE_CALL_USD, String(error)).catch(() => {});
    throw error;
  }
}
const matchMask = "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.primaryType,places.types,places.regularOpeningHours,places.businessStatus";
const openMatchMask = "places.id,places.rating,places.userRatingCount,places.regularOpeningHours,places.primaryType,places.businessStatus";
const rankMask = "places.id";
function locality(place: Place, type: string): string | null {
  return place.addressComponents?.find((part) => part.types.includes(type))?.longText || null;
}
function gridPoints(location: { latitude: number; longitude: number }, size: 3 | 5) {
  const half = Math.floor(size / 2);
  return Array.from({ length: size * size }, (_, i) => {
    const y = Math.floor(i / size) - half, x = i % size - half;
    return { x, y, latitude: location.latitude + y * 1609.344 / 111320,
      longitude: location.longitude + x * 1609.344 / (111320 * Math.cos(location.latitude * Math.PI / 180)) };
  });
}
export async function enrichGoogle(leadId: string, grid: 3 | 5, useOpenPlaces = true): Promise<Record<string, unknown>> {
  let lead = await leadById(leadId);
  if (!lead.company) throw new Error("Lead has no company name");
  const open = useOpenPlaces ? await enrichOpenPlaces(leadId) : { status: "not_found" as const };
  lead = await leadById(leadId);
  const phone = lead.normalized_phone || lead.phone || "";
  const listing = open.place;
  const city = listing?.address?.locality || String(lead.custom_fields?.city || "");
  const state = stateCode(listing?.address?.region || lead.state) || lead.state || "";
  let match: Place | undefined;
  let confidence = "low";
  if (listing && city) {
    const candidates = await placesSearch(leadId, "google_places", "match_open_places", {
      textQuery: `${lead.company} ${city} ${state}`, pageSize: 20,
      locationBias: { circle: { center: { latitude: listing.lat, longitude: listing.lon }, radius: 1609.344 } },
    }, openMatchMask);
    const knownId = (lead.custom_fields?.google as { place_id?: string } | undefined)?.place_id;
    match = candidates.find((place) => place.id === knownId) || candidates[0];
    confidence = match?.id === knownId ? "high" : "medium";
  } else {
    const candidates = await placesSearch(leadId, "google_places", "fallback_match", {
      textQuery: `${lead.company} ${phone || state}`, pageSize: 20,
    }, matchMask);
    match = candidates.find((place) => digits(place.nationalPhoneNumber) && digits(place.nationalPhoneNumber) === digits(phone));
    confidence = match ? "high" : "low";
    if (!match) {
      match = candidates.sort((a,b) => nameScore(lead.company!, b.displayName?.text || "") - nameScore(lead.company!, a.displayName?.text || ""))[0];
      if (match && nameScore(lead.company, match.displayName?.text || "") < 0.6) match = undefined;
      confidence = match ? "medium" : "low";
    }
  }
  if (!match) {
    await rest(`leads?id=eq.${encodeURIComponent(leadId)}`, { method: "PATCH", body: JSON.stringify({ tags: [...new Set([...lead.tags, "enrich-not-found"]) ] }) });
    await logCall(leadId, "google_places", { operation: "match", place_id: null }, "not_found", 0);
    return { status: "not_found", match_confidence: "low" };
  }
  const matchedCity = city || locality(match, "locality");
  const matchedState = state || locality(match, "administrative_area_level_1");
  const shop = listing ? { latitude: listing.lat, longitude: listing.lon } : match.location;
  if (!shop || !matchedCity) {
    await rest(`leads?id=eq.${encodeURIComponent(leadId)}`, { method: "PATCH", body: JSON.stringify({
      custom_fields: { ...lead.custom_fields, google: { place_id: match.id,
        fetched_at: new Date().toISOString() } },
    }) });
    return { status: "matched_no_grid", match_confidence: confidence, place_id: match.id,
      city: matchedCity, state: matchedState, location: shop,
      website: listing?.website || match.websiteUri, rating: match.rating,
      review_count: match.userRatingCount, category: match.primaryType,
      hours: match.regularOpeningHours, business_status: match.businessStatus,
      open_places: listing || null };
  }
  const query = match.primaryType === "plumber" || /plumb/i.test(lead.company || "")
    ? "plumber" : /hvac|heating|cooling|air conditioning/i.test(`${lead.company} ${listing?.category || lead.custom_fields?.category || ""}`)
      ? "HVAC contractor" : "plumber";
  const points = [] as Array<{ x: number; y: number; position: number }>;
  let center: Place[] = [];
  for (const point of gridPoints(shop, grid)) {
    const results = await placesSearch(leadId, "google_rank", `rank_${point.x}_${point.y}`, {
      textQuery: query, pageSize: 20,
      locationBias: { circle: { center: { latitude: point.latitude, longitude: point.longitude }, radius: 1609.344 } },
    }, rankMask);
    if (point.x === 0 && point.y === 0) center = results;
    const index = results.findIndex((place) => place.id === match!.id);
    points.push({ x: point.x, y: point.y, position: index < 0 ? 21 : index + 1 });
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  const competitors = center.filter((place) => place.id !== match!.id).slice(0, 3);
  const topReviews = competitors.reduce((sum, place) => sum + (place.userRatingCount || 0), 0) / Math.max(competitors.length, 1);
  const reviewRatio = topReviews ? (match.userRatingCount || 0) / topReviews : null;
  const top3 = points.filter((point) => point.position <= 3).length;
  const avgRank = points.reduce((sum, point) => sum + point.position, 0) / points.length;
  const expectedTown = String(lead.custom_fields?.town || lead.custom_fields?.city || "").toLowerCase();
  const insideTown = expectedTown ? matchedCity?.toLowerCase() === expectedTown : null;
  const tags = new Set(lead.tags.filter((tag) => !["top3-fit", "top3-reviews-first", "top3-already", "enrich-not-found"].includes(tag)));
  if (reviewRatio !== null && reviewRatio < 0.6) tags.add("top3-reviews-first");
  else if (top3 >= Math.ceil(points.length / 2)) tags.add("top3-already");
  else if ((match.rating || 0) >= 4.5 && reviewRatio !== null && reviewRatio >= 0.6 && insideTown !== false) tags.add("top3-fit");
  const googleFields = { place_id: match.id, fetched_at: new Date().toISOString() };
  const fields = { ...lead.custom_fields, google: googleFields };
  await rest(`leads?id=eq.${encodeURIComponent(leadId)}`, { method: "PATCH", body: JSON.stringify({
    custom_fields: fields,
  }) });
  // Places content is returned for immediate display, not persisted in the CRM.
  return { status: "ok", match_confidence: confidence, place_id: match.id,
    name: match.displayName?.text, address: match.formattedAddress, city: matchedCity, state: matchedState,
    location: shop, website: listing?.website || match.websiteUri, rating: match.rating,
    review_count: match.userRatingCount, category: match.primaryType,
    hours: match.regularOpeningHours, business_status: match.businessStatus,
    grid: points, top3_points: top3, avg_rank: Math.round(avgRank * 10) / 10,
    competitors: competitors.map((place) => ({ place_id: place.id })),
    reviews_vs_top3_pct: reviewRatio === null ? null : Math.round(reviewRatio * 100),
    suggested_tags: [...tags].filter((tag) => !lead.tags.includes(tag)), source: "Google Maps",
    open_places: listing || null };
}

const VICTORYSYNC_CONTEXT = "VictorySync (Victory Sync LLC) is a US-managed contact center with Cairo-based trained agents. Human agents handle outbound calling, inbound support, lead follow-up, qualification, and appointment setting. AI assists with prompts, summaries, routing, and reporting; humans handle conversations. VictorySync serves US small and midsize businesses, including home services. The usual next step is a discovery call to scope a managed calling workflow. Do not portray VictorySync as a Google Maps SEO agency or promise rankings, leads, booked jobs, or ROI. Website: https://www.victorysync.com/.";
const AI_SYSTEM = `You research US home-service businesses to prepare VictorySync's human calling team. ${VICTORYSYNC_CONTEXT} Use only public business information. Every field must come from a source you actually opened; put the URL in sources. If you cannot confirm something, return null. Never collect home addresses, personal phone numbers, family information, or personal social accounts. Return one JSON object only. Do not include Google Places ratings, review counts, hours, rank, or other Google Maps content in the persisted answer. Do not identify individuals or include personal data when using a free model. Ground call_hooks in verified facts and VictorySync's actual contact-center services.`;
const AI_KEYS = ["owner_name", "owner_title", "website", "website_issues", "years_in_business", "license_numbers", "services", "service_area", "emergency_24_7", "bbb", "facebook", "instagram", "booking_software", "employees_estimate", "is_franchise", "is_lead_gen_listing", "call_hooks", "summary", "sources", "confidence"];
const publicUrl = z.string().url().refine((value) => /^https?:\/\//i.test(value));
const researchSchema = z.object({
  owner_name: z.string().nullable(), owner_title: z.string().nullable(),
  website: publicUrl.nullable(), website_issues: z.array(z.string()),
  years_in_business: z.number().nonnegative().nullable(),
  license_numbers: z.array(z.string()), services: z.array(z.string()),
  service_area: z.array(z.string()), emergency_24_7: z.boolean().nullable(),
  bbb: z.object({ rating: z.string().nullable(), accredited: z.boolean().nullable(),
    url: publicUrl.nullable() }),
  facebook: z.object({ url: publicUrl.nullable(), last_post_date: z.string().nullable() }),
  instagram: z.object({ url: publicUrl.nullable(), last_post_date: z.string().nullable() }),
  booking_software: z.string().nullable(), employees_estimate: z.number().nonnegative().nullable(),
  is_franchise: z.boolean().nullable(), is_lead_gen_listing: z.boolean().nullable(),
  call_hooks: z.array(z.string()).max(3), summary: z.string(),
  sources: z.array(z.object({ field: z.string(), url: publicUrl })),
  confidence: z.enum(["high", "medium", "low"]),
});
const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };
const nullableBoolean = { type: ["boolean", "null"] };
const stringArray = { type: "array", items: { type: "string" } };
const researchJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    owner_name: nullableString, owner_title: nullableString, website: nullableString,
    website_issues: stringArray, years_in_business: nullableNumber,
    license_numbers: stringArray, services: stringArray, service_area: stringArray,
    emergency_24_7: nullableBoolean,
    bbb: { type: "object", additionalProperties: false,
      properties: { rating: nullableString, accredited: nullableBoolean, url: nullableString },
      required: ["rating", "accredited", "url"] },
    facebook: { type: "object", additionalProperties: false,
      properties: { url: nullableString, last_post_date: nullableString },
      required: ["url", "last_post_date"] },
    instagram: { type: "object", additionalProperties: false,
      properties: { url: nullableString, last_post_date: nullableString },
      required: ["url", "last_post_date"] },
    booking_software: nullableString, employees_estimate: nullableNumber,
    is_franchise: nullableBoolean, is_lead_gen_listing: nullableBoolean,
    call_hooks: stringArray, summary: { type: "string" },
    sources: { type: "array", items: { type: "object", additionalProperties: false,
      properties: { field: { type: "string" }, url: { type: "string" } },
      required: ["field", "url"] } },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  }, required: AI_KEYS,
};
function parseResearch(text: string): Record<string, unknown> {
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("AI response did not contain a JSON object");
  const raw = JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>;
  const data = researchSchema.parse({
    owner_name: null, owner_title: null, website: null, website_issues: [],
    years_in_business: null, license_numbers: [], services: [], service_area: [],
    emergency_24_7: null, bbb: { rating: null, accredited: null, url: null },
    facebook: { url: null, last_post_date: null },
    instagram: { url: null, last_post_date: null },
    booking_software: null, employees_estimate: null, is_franchise: null,
    is_lead_gen_listing: null, call_hooks: [], summary: "", sources: [], confidence: "low",
    ...raw,
    bbb: { rating: null, accredited: null, url: null, ...(raw.bbb as object || {}) },
    facebook: { url: null, last_post_date: null, ...(raw.facebook as object || {}) },
    instagram: { url: null, last_post_date: null, ...(raw.instagram as object || {}) },
  });
  for (const field of ["owner_name", "owner_title", "website", "website_issues",
    "years_in_business", "license_numbers", "services", "service_area", "emergency_24_7",
    "booking_software", "employees_estimate", "is_franchise", "is_lead_gen_listing"] as const) {
    const value = data[field];
    if (value !== null && (!Array.isArray(value) || value.length > 0) &&
        !data.sources.some((source) => source.field === field))
      (data as Record<string, unknown>)[field] = Array.isArray(value) ? [] : null;
  }
  for (const field of ["bbb", "facebook", "instagram"] as const)
    if (Object.values(data[field]).some((value) => value !== null) &&
        !data.sources.some((source) => source.field === field))
      (data as Record<string, unknown>)[field] = field === "bbb"
        ? { rating: null, accredited: null, url: null }
        : { url: null, last_post_date: null };
  return data;
}
async function anthropic(leadId: string | null, operation: string, prompt: string, maxSearches = 1, useTools = true, maxTokens = 1600, systemPrompt = AI_SYSTEM, model = OPENROUTER_MODEL, structured = false, forceSearch = false, companyId: string | null = null): Promise<{ text: string; cost: number; sources: string[]; fetchedSources: string[] }> {
  if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY is not configured");
  try { await reserve(AI_RESERVE_USD); } catch (error) { await budgetNotice(); throw error; }
  let logged = false;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { authorization: `Bearer ${OPENROUTER_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: maxTokens,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
        ...(structured ? { reasoning: { effort: "none" } } : {}),
        ...(structured ? { response_format: { type: "json_schema", json_schema: {
          name: "lead_research", strict: true, schema: researchJsonSchema } } } : {}),
        ...(forceSearch ? { plugins: [{ id: "web", max_results: 2 }] } : {}),
        ...(useTools ? { tools: [
          ...(forceSearch ? [] : [
          { type: "openrouter:web_search", parameters: { max_uses: maxSearches, max_total_results: Math.max(2, maxSearches) } },
          ]), { type: "openrouter:web_fetch" }], max_tool_calls: forceSearch ? 2 : maxSearches > 1 ? 16 : 3 } : {}) }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await response.json() as { choices?: Array<{ message?: { content?: string;
      annotations?: Array<{ url_citation?: { url?: string } }> } }>;
      usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number;
        server_tool_use_details?: { web_search_requests?: number; web_fetch_requests?: number } };
      error?: { message?: string } };
    const searches = data.usage?.server_tool_use_details?.web_search_requests || 0;
    const actual = Number(data.usage?.cost ?? searches * 0.007);
    await release(AI_RESERVE_USD - actual);
    await logEntityCall(leadId, companyId, "ai_research", { operation, searches,
      fetches: data.usage?.server_tool_use_details?.web_fetch_requests || 0,
      model,
      input_tokens: data.usage?.prompt_tokens, output_tokens: data.usage?.completion_tokens },
      response.ok ? "ok" : "error", actual, data.error?.message);
    logged = true;
    if (!response.ok && model.endsWith(":free") &&
        /free-models-per-day/i.test(data.error?.message || ""))
      return anthropic(leadId, operation, prompt, maxSearches, useTools, maxTokens,
        systemPrompt, OPENROUTER_RESEARCH_MODEL, structured, forceSearch, companyId);
    if (!response.ok) throw new Error(`OpenRouter API: ${data.error?.message || response.status}`);
    const message = data.choices?.[0]?.message;
    const cited = message?.annotations?.map((item) => item.url_citation?.url)
      .filter((url): url is string => Boolean(url)) || [];
    return { text: message?.content || "", cost: actual, sources: [...new Set(cited)], fetchedSources: [...new Set(cited)] };
  } catch (error) {
    if (!logged) await logEntityCall(leadId, companyId, "ai_research", { operation }, "error", AI_RESERVE_USD, String(error)).catch(() => {});
    throw error;
  }
}
export async function enrichAi(leadId: string): Promise<Record<string, unknown>> {
  const lead = await leadById(leadId);
  const listing = lead.custom_fields?.open_places as { website?: string; category?: string } | undefined;
  const discovery = await anthropic(leadId, "research_search",
    `Search the web once for public business information about ${lead.company || "unknown"} in ${lead.state || "unknown"}. Return at most three short factual statements with cited source URLs. Do not include people's names, phone numbers, email addresses, or Google ratings. Public listing website: ${listing?.website || "unknown"}.`, 1, true, 450,
    "Find public business facts with one web search. Cite source URLs in a short plain-text answer. Exclude people, phone numbers, email addresses, and Google Maps data.", OPENROUTER_MODEL, false, true);
  if (!discovery.sources.length) throw new Error("AI web search returned no cited source");
  const findings = discovery.text.replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[redacted]")
    .replace(/\b(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g, "[redacted]").slice(0, 1500);
  const prompt = `Using only these web search findings, output JSON with exactly these fields: ${AI_KEYS.join(", ")}. Empty arrays for unknown lists, null for unknown scalar fields, and 2-3 factual call hooks if supported. Set owner_name and owner_title to null. Cite only these source URLs: ${discovery.sources.join(", ")}. Findings: ${findings}. Company: ${lead.company || "unknown"}; state: ${lead.state || "unknown"}; public listing category: ${listing?.category || "unknown"}.`;
  let data: Record<string, unknown> | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await anthropic(leadId, "research_json", prompt + (attempt ? " Return strictly valid JSON this time." : ""),
      0, false, 1600, AI_SYSTEM, OPENROUTER_RESEARCH_MODEL, true);
    try {
      data = parseResearch(result.text);
      if (OPENROUTER_MODEL.endsWith(":free")) {
        data.owner_name = null;
        data.owner_title = null;
      }
      const opened = new Set(discovery.sources.map((url) => url.replace(/\/#?$/, "")));
      data.sources = (data.sources as Array<{ field: string; url: string }>).filter((source) =>
        opened.has(source.url.replace(/\/#?$/, "")));
      data = parseResearch(JSON.stringify(data));
      if (!(data.sources as Array<unknown>).length) {
        for (const field of ["website", "years_in_business", "emergency_24_7", "booking_software",
          "employees_estimate", "is_franchise", "is_lead_gen_listing"]) data[field] = null;
        for (const field of ["website_issues", "license_numbers", "services", "service_area", "call_hooks"]) data[field] = [];
        data.bbb = { rating: null, accredited: null, url: null };
        data.facebook = { url: null, last_post_date: null };
        data.instagram = { url: null, last_post_date: null };
        data.summary = "No verified public business facts found.";
        data.confidence = "low";
      }
      break;
    } catch (error) {
      await logCall(leadId, "ai_research", { operation: "research_validation",
        response_length: result.text.length }, "error", 0, String(error)).catch(() => {});
      if (attempt) throw error;
    }
  }
  if (!data) throw new Error("AI research validation failed");
  await logCall(leadId, "ai_research", { operation: "validated_research", result: data }, "ok", 0);
  const tags = new Set(lead.tags);
  if (data.is_lead_gen_listing === true) tags.add("review-leadgen");
  if (data.is_franchise === true) tags.add("franchise");
  const owner = data.owner_name && data.confidence === "high" ? String(data.owner_name).trim() : null;
  const names = owner?.split(/\s+/) || [];
  if (names.length >= 2) tags.delete("needs-owner-name");
  const date = new Date().toISOString().slice(0, 10);
  const summary = `${date} | AI research | ${String(data.summary || "").replace(/[\r\n]+/g, " ").slice(0, 600)}${owner ? ` | owner: ${owner} (high)` : ""}`;
  await rest(`leads?id=eq.${encodeURIComponent(leadId)}`, { method: "PATCH", body: JSON.stringify({
    tags: [...tags], custom_fields: { ...lead.custom_fields, enrichment: data },
    notes: `${summary}\n${lead.notes || ""}`,
    ...(names.length >= 2 ? { first_name: names[0], last_name: names.slice(1).join(" ") } : {}),
  }) });
  return data;
}
export async function askAboutLead(leadId: string, question: string): Promise<Record<string, unknown>> {
  const lead = await leadById(leadId);
  if (OPENROUTER_MODEL.endsWith(":free") && (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i.test(question) || /\b\+?\d[\d\s().-]{8,}\d\b/.test(question)))
    throw new Error("Remove personal contact details from the question before using the free model");
  const answer = await anthropic(leadId, "ask",
    `Company: ${lead.company}; state: ${lead.state}. Question: ${question}`, 4, true, 1200,
    `You are a practical VictorySync CRM assistant. ${VICTORYSYNC_CONTEXT} Answer in natural prose, not JSON. Help with call scripts, opening lines, follow-up plans, and cold emails from VictorySync to this prospect when asked. Use only public business facts; cite a URL for any fact learned from web search. Do not include private contact details or invent facts. Keep the answer ready to copy and use.`);
  let prose = answer.text.trim();
  if (prose.startsWith("{")) {
    try { const parsed = JSON.parse(prose) as { answer?: string; response?: string };
      prose = parsed.answer || parsed.response || prose;
    } catch { /* A plain answer can contain braces. */ }
  }
  return { answer: prose, sources: answer.sources, cost_usd: answer.cost };
}
export async function enrichCompany(companyId: string, mode: Mode = "both", grid: 3 | 5 = 3,
  provider: "open_places" | "google_places" | "combined" = "combined"): Promise<Record<string, unknown>> {
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) throw new Error("Invalid company ID");
  const rows = await rest<Array<{ id: string; name: string; phone: string | null; city: string | null;
    state: string | null; website: string | null; fit_notes: string | null; tags: string[];
    custom_fields: Record<string, unknown> }>>(`companies?id=eq.${encodeURIComponent(companyId)}&select=id,name,phone,city,state,website,fit_notes,tags,custom_fields`);
  const company = rows[0];
  if (!company) throw new Error("Company not found");
  const fields = { ...(company.custom_fields || {}) };
  const tags = new Set(company.tags || []);
  const lines: string[] = [];
  const result: Record<string, unknown> = {};
  const date = new Date().toISOString().slice(0, 10);
  let listing = provider === "google_places" ? undefined : fields.open_places as OpenPlace | undefined;
  if (mode !== "ai") {
    const wantedState = stateCode(company.state) || stateFromAreaCode(company.phone);
    const center = leadSearchCenter(wantedState, company.phone);
    if (center && provider !== "google_places") {
      const found = await openPlacesSearch(null, { q: company.name, lat: center[0], lon: center[1],
        radius_mi: 50, mode: "name", limit: 20, min_confidence: 0.7 });
      const candidates = found.results.filter((p) => !wantedState || stateCode(p.address?.region) === wantedState);
      const phone = digits(company.phone);
      const exact = phone ? candidates.find((p) => digits(p.phone) === phone) : undefined;
      const best = candidates.sort((a, b) => nameScore(company.name, b.name) - nameScore(company.name, a.name))[0];
      listing = exact || (best && nameScore(company.name, best.name) >= 0.6 ? best : undefined);
    }
    if (listing) {
      const confidence = digits(company.phone) && digits(company.phone) === digits(listing.phone)
        ? 1 : Math.round(nameScore(company.name, listing.name) * 100) / 100;
      fields.open_places = { ...listing, match_confidence: confidence, fetched_at: new Date().toISOString(),
        attribution: "Open Places / Overture Maps" };
      tags.delete("enrich-op-not-found");
      lines.push(`${date} | Business listing (Open Places / Overture) | ${listing.name} | ${listing.address?.locality || "unknown city"}, ${stateCode(listing.address?.region) || wantedState || "unknown state"} | ${listing.category || "unknown category"}`);
      result.open_places = fields.open_places;
    } else if (provider !== "google_places") {
      tags.add("enrich-op-not-found"); result.open_places = { status: "not_found" };
    }
    const city = listing?.address?.locality || company.city;
    const state = stateCode(listing?.address?.region || company.state) || company.state;
    if (provider !== "open_places" && (city || state)) {
      const matches = await placesSearch(null, "google_places", "company_match", {
        textQuery: `${company.name} ${city || ""} ${state || ""}`, pageSize: 20,
        ...(listing ? { locationBias: { circle: { center: { latitude: listing.lat,
          longitude: listing.lon }, radius: 1609.344 } } } : {}),
      }, listing ? openMatchMask : matchMask, companyId);
      const knownId = (fields.google as { place_id?: string } | undefined)?.place_id;
      const exactPhone = digits(company.phone) ? matches.find((candidate) =>
        digits(candidate.nationalPhoneNumber) === digits(company.phone)) : undefined;
      const bestName = matches.sort((a, b) => nameScore(company.name, b.displayName?.text || "") -
        nameScore(company.name, a.displayName?.text || ""))[0];
      const place = matches.find((candidate) => candidate.id === knownId) || exactPhone ||
        (listing ? matches[0] : bestName && nameScore(company.name, bestName.displayName?.text || "") >= 0.6 ? bestName : undefined);
      if (place) {
        fields.google = { place_id: place.id, fetched_at: new Date().toISOString() };
        const points: Array<{ x: number; y: number; position: number }> = [];
        const shop = listing ? { latitude: listing.lat, longitude: listing.lon } : place.location;
        if (shop) for (const point of gridPoints(shop, grid)) {
          const ranked = await placesSearch(null, "google_rank", `company_rank_${point.x}_${point.y}`, {
            textQuery: /hvac|heating|cooling|air conditioning/i.test(`${company.name} ${listing?.category || ""}`)
              ? "HVAC contractor" : "plumber", pageSize: 20,
            locationBias: { circle: { center: { latitude: point.latitude,
              longitude: point.longitude }, radius: 1609.344 } },
          }, rankMask, companyId);
          const position = ranked.findIndex((p) => p.id === place.id);
          points.push({ x: point.x, y: point.y, position: position < 0 ? 21 : position + 1 });
        }
        result.google = { place_id: place.id, rating: place.rating, review_count: place.userRatingCount,
          hours: place.regularOpeningHours, category: place.primaryType, grid: points,
          top3_points: points.filter((p) => p.position <= 3).length };
        lines.push(`${date} | Google Places match | place ID: ${place.id} | live rating and rank shown only in this enrichment result`);
      } else result.google = { status: "not_found" };
    }
  }
  if (mode === "both" && lines.length) await rest(`companies?id=eq.${encodeURIComponent(companyId)}`, {
    method: "PATCH", body: JSON.stringify({ custom_fields: fields,
      fit_notes: `${lines.join("\n")}\n${company.fit_notes || ""}`,
      tags: [...tags].slice(0, 30),
      ...(!company.city && listing?.address?.locality ? { city: listing.address.locality } : {}),
      ...(!company.state && listing?.address?.region ? { state: stateCode(listing.address.region) } : {}),
      ...(!company.website && listing?.website ? { website: listing.website } : {}),
    }),
  });
  if (mode !== "google") {
    const discovery = await anthropic(null, "company_research_search",
      `Search once for public business information about ${company.name} in ${company.state || "unknown"}. Return three short facts with source URLs. Website: ${listing?.website || company.website || "unknown"}. Do not include personal contacts or Google data.`,
      1, true, 450, "Find public business facts with cited source URLs. Exclude people, private contact details and Google Maps data.", OPENROUTER_MODEL, false, true, companyId);
    const synthesis = await anthropic(null, "company_research_json",
      `Using only these cited findings, return the requested research JSON. Set owner_name and owner_title to null. Cite only these URLs: ${discovery.sources.join(", ")}. Findings: ${discovery.text.slice(0, 1500)}. Company: ${company.name}.`,
      0, false, 1600, AI_SYSTEM, OPENROUTER_RESEARCH_MODEL, true, false, companyId);
    const research = parseResearch(synthesis.text);
    const opened = new Set(discovery.sources);
    research.sources = (research.sources as Array<{ field: string; url: string }>).filter((s) => opened.has(s.url));
    if (!(research.sources as Array<unknown>).length) {
      for (const key of ["website", "years_in_business", "emergency_24_7", "booking_software",
        "employees_estimate", "is_franchise", "is_lead_gen_listing"]) research[key] = null;
      for (const key of ["website_issues", "license_numbers", "services", "service_area", "call_hooks"]) research[key] = [];
      research.bbb = { rating: null, accredited: null, url: null };
      research.facebook = { url: null, last_post_date: null };
      research.instagram = { url: null, last_post_date: null };
      research.summary = "No verified public business facts found.";
      research.confidence = "low";
    }
    fields.enrichment = { ...research, fetched_at: new Date().toISOString() };
    if (research.is_franchise === true) tags.add("franchise");
    if (research.is_lead_gen_listing === true) tags.add("review-leadgen");
    lines.push(`${date} | AI research | ${String(research.summary || "").replace(/[\r\n]+/g, " ").slice(0, 600)}`);
    result.ai = research;
  }
  await rest(`companies?id=eq.${encodeURIComponent(companyId)}`, { method: "PATCH", body: JSON.stringify({
    custom_fields: fields, fit_notes: `${lines.join("\n")}\n${company.fit_notes || ""}`,
    tags: [...tags].slice(0, 30),
    ...(!company.city && listing?.address?.locality ? { city: listing.address.locality } : {}),
    ...(!company.state && listing?.address?.region ? { state: stateCode(listing.address.region) } : {}),
    ...(!company.website && listing?.website ? { website: listing.website } : {}),
  }) });
  return result;
}
export async function askAboutCompany(companyId: string, question: string): Promise<Record<string, unknown>> {
  const rows = await rest<Array<{ name: string; state: string | null; custom_fields: Record<string, unknown> }>>(
    `companies?id=eq.${encodeURIComponent(companyId)}&select=name,state,custom_fields`);
  if (!rows[0]) throw new Error("Company not found");
  const answer = await anthropic(null, "company_ask",
    `Company: ${rows[0].name}; state: ${rows[0].state}. Stored research: ${JSON.stringify(rows[0].custom_fields?.enrichment || {}).slice(0, 4000)}. Question: ${question}`,
    2, true, 1200, `You are a practical VictorySync CRM assistant. ${VICTORYSYNC_CONTEXT} Answer in natural prose, not JSON. Help with scripts, openers and cold emails from VictorySync to this prospect. Cite sourced business facts; do not invent facts or include private contacts.`,
    OPENROUTER_MODEL, false, false, companyId);
  return { answer: answer.text, sources: answer.sources, cost_usd: answer.cost };
}
export async function runLead(leadId: string, mode: Mode, grid: 3 | 5): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  if (mode === "google" || mode === "both") result.google = await enrichGoogle(leadId, grid);
  if (mode === "ai" || mode === "both") result.ai = await enrichAi(leadId);
  return result;
}
export async function sendJobSummary(message: string): Promise<void> { await slack(message); }
export const costEstimate = (mode: Mode, grid: 3 | 5) =>
  (mode === "ai" ? 0 : (grid * grid + 1) * GOOGLE_CALL_USD) + (mode === "google" ? 0 : 2 * AI_RESERVE_USD);
