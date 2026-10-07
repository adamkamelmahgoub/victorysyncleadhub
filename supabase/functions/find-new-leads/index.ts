import { authorize, database, errorResponse, json, openPlacesSearch } from "../_shared/enrichment.ts";
import { citySearchCenter, stateCode } from "../_shared/us-centers.ts";

declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void };

Deno.serve(async (request) => {
  try {
    authorize(request);
    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    const input = await request.json() as { city?: string; state?: string; radius_mi?: number };
    const city = String(input.city || "").trim();
    const state = stateCode(input.state);
    const radius = Number(input.radius_mi ?? 25);
    if (!city || city.length > 100 || !state || !Number.isFinite(radius) || radius <= 0 || radius > 50)
      throw new Error("City, US state and a radius of 1-50 miles are required");
    const center = citySearchCenter(city, state);
    if (!center) throw new Error("City was not found in the US Census places gazetteer");
    const found = new Map<string, Record<string, unknown>>();
    let calls = 0;
    for (const category of ["plumbing", "hvac_service"]) {
      let offset = 0;
      for (let page = 0; page < 20 && calls < 500; page++) {
        const result = await openPlacesSearch(null, { category, lat: center[0], lon: center[1],
          radius_mi: radius, limit: 50, offset, min_confidence: 0.7 });
        calls++;
        for (const place of result.results) if (place.phone && place.place_id)
          found.set(place.place_id, place as unknown as Record<string, unknown>);
        const next = Number(result.meta?.next_offset);
        if (!Number.isInteger(next) || next <= offset || next > 950) break;
        offset = next;
      }
    }
    const imported = await database<Record<string, unknown>>("rpc/enrichment_import_open_places", {
      method: "POST", body: JSON.stringify({ p_places: [...found.values()], p_city: city, p_state: state }),
    });
    return json({ ...imported, api_calls: calls, categories: ["plumbing", "hvac_service"],
      search_center: { lat: center[0], lon: center[1] } });
  } catch (error) { return errorResponse(error); }
});
