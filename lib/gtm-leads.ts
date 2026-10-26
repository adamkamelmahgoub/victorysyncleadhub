import { edgeCall } from "./enrichment-client.js";
import { mcpPool } from "./mcp-auth.js";

type Listing = { place_id: string; name: string; phone?: string; website?: string;
  category?: string; categories?: string[]; confidence?: number; operating_status?: string;
  lat?: number; lon?: number; address?: { formatted?: string; locality?: string; region?: string } };
export type LeadSearch = { city: string; state: string; category?: string; query?: string;
  radius_mi: number; max_results: number; min_score: number; require_website: boolean;
  save: boolean };

export function usPhone(value?: string): string | null {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function scoreListing(place: Listing, category = "", query = "") {
  const reasons: string[] = [];
  const confidence = Number.isFinite(place.confidence) ? Math.min(1, Math.max(0, place.confidence!)) : 0;
  let score = Math.round(confidence * 35);
  if (confidence >= 0.8) reasons.push("high-confidence business listing");
  if (usPhone(place.phone)) { score += 20; reasons.push("business phone listed"); }
  if (/^https?:\/\/[^\s]+/i.test(place.website || "")) { score += 20; reasons.push("business website listed"); }
  const wanted = (category || query).toLowerCase().replace(/[^a-z0-9]/g, "");
  const categories = [place.category, ...(place.categories || [])]
    .filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (wanted && categories.includes(wanted)) { score += 10; reasons.push("category matches search"); }
  if (place.address?.locality && place.address.region) { score += 10; reasons.push("city and state listed"); }
  if (/^(?:open|active|operational)$/i.test(place.operating_status || "")) {
    score += 5; reasons.push("listed as operating");
  }
  return { score: Math.min(100, score), reasons };
}

type Services = { call?: typeof edgeCall; existingPhones?: (phones: string[]) => Promise<string[]> };
export async function generateGtmLeads(input: LeadSearch, services: Services = {}) {
  const call = services.call || edgeCall;
  const city = input.city.trim();
  const state = input.state.trim();
  const category = input.category?.trim().toLowerCase() || "";
  const query = input.query?.trim() || "";
  if (!city || city.length > 100 || !state || state.length > 40 ||
      Boolean(category) === Boolean(query) ||
      category && !/^[a-z0-9][a-z0-9_:-]{0,127}$/.test(category) ||
      query && (query.length < 2 || query.length > 128) ||
      !Number.isFinite(input.radius_mi) || input.radius_mi < 1 || input.radius_mi > 50 ||
      !Number.isInteger(input.max_results) || input.max_results < 1 || input.max_results > 50 ||
      !Number.isFinite(input.min_score) || input.min_score < 0 || input.min_score > 100)
    throw new Error("Choose one category or search phrase, a US city and state, radius 1-50, and 1-50 results");

  const preview = await call("find-new-leads", { action: "preview", city, state,
    radius_mi: input.radius_mi, pages: category ? 3 : 1,
    ...(category ? { category } : { query }), min_confidence: 0.7 }) as
    { places?: Listing[]; api_calls?: number };
  const places = Array.isArray(preview.places) ? preview.places : [];
  const phones = [...new Set(places.map((place) => usPhone(place.phone)).filter((phone): phone is string => !!phone))];
  const excluded = new Set<string>();
  if (phones.length) {
    const existingPhones = services.existingPhones || (async (values: string[]) => {
      const matches = await mcpPool.query(`select normalized_phone as phone from public.leads
        where normalized_phone=any($1::text[])
        union select identity_value as phone from public.outreach_suppressions
        where identity_type='phone' and identity_value=any($1::text[])`, [values]);
      return matches.rows.map((row) => String(row.phone));
    });
    for (const phone of await existingPhones(phones)) excluded.add(phone);
  }
  const candidates = places.filter((place) => {
    const phone = usPhone(place.phone);
    return Boolean(place.place_id && place.name && phone && !excluded.has(phone));
  }).filter((place) =>
    !/closed/i.test(place.operating_status || "") &&
    (!input.require_website || /^https?:\/\//i.test(place.website || "")))
    .map((place) => ({ place, ...scoreListing(place, category, query) }))
    .filter((candidate) => candidate.score >= input.min_score)
    .sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name));
  const seen = new Set<string>();
  const shortlist = candidates.filter(({ place }) => {
    const phone = usPhone(place.phone)!;
    if (seen.has(phone)) return false;
    seen.add(phone);
    return true;
  }).slice(0, input.max_results);
  const visible = shortlist.map(({ place, score, reasons }) => ({
    name: place.name, phone: place.phone, website: place.website || null,
    category: place.category || null, city: place.address?.locality || null,
    state: place.address?.region || null, address: place.address?.formatted || null,
    place_id: place.place_id, confidence: place.confidence ?? null,
    score, reasons, source: "Open Places / Overture Maps",
  }));
  let saved: { inserted?: number; skipped?: number; lead_ids?: string[] } | null = null;
  if (input.save && shortlist.length) {
    saved = await call("find-new-leads", { action: "import", city, state,
      radius_mi: input.radius_mi, places: shortlist.map(({ place }) => place) });
  }
  return { search: { city, state, category: category || null, query: query || null,
      radius_mi: input.radius_mi }, found: places.length, already_in_crm_or_suppressed: excluded.size,
    qualified: visible.length, api_calls: preview.api_calls || 0,
    scoring_note: "Score reflects listing completeness and category match. It does not verify revenue, demand, decision-maker, or buying intent.",
    candidates: visible, saved: saved || { inserted: 0, skipped: 0, lead_ids: [] } };
}
