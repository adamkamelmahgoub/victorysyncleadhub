import { authorize, database, errorResponse, json, openPlacesSearch } from "../_shared/enrichment.ts";
import { citySearchCenter, stateCode } from "../_shared/us-centers.ts";

declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void };

Deno.serve(async (request) => {
  try {
    authorize(request);
    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    const input = await request.json() as { city?: string; state?: string; radius_mi?: number;
      action?: "preview" | "import"; places?: Record<string, unknown>[]; pages?: number;
      category?: string; query?: string };
    const city = String(input.city || "").trim();
    const state = stateCode(input.state);
    const radius = Number(input.radius_mi ?? 25);
    if (!city || city.length > 100 || !state || !Number.isFinite(radius) || radius <= 0 || radius > 50)
      throw new Error("City, US state and a radius of 1-50 miles are required");
    const category = String(input.category || "").trim().toLowerCase();
    const query = String(input.query || "").trim();
    if (category && !/^[a-z0-9][a-z0-9_:-]{0,127}$/.test(category))
      throw new Error("Choose a valid Overture category");
    if (query && (query.length < 2 || query.length > 128))
      throw new Error("Search phrase must be 2-128 characters");
    if (category && query) throw new Error("Use a category or a search phrase, not both");
    if (input.action === "import") {
      const places = input.places;
      if (!Array.isArray(places) || places.length < 1 || places.length > 500 || places.some((place) =>
        typeof place !== "object" || place === null || typeof place.name !== "string" ||
        typeof place.phone !== "string" || typeof place.place_id !== "string" ||
        !/^[a-zA-Z0-9:_-]{1,200}$/.test(place.place_id) ||
        place.name.length > 200 || place.phone.length > 40))
        throw new Error("Select up to 500 valid business listings to import");
      const imported = await database<Record<string, unknown>>("rpc/enrichment_import_open_places", {
        method: "POST", body: JSON.stringify({ p_places: places, p_city: city, p_state: state }),
      });
      return json(imported);
    }
    const center = citySearchCenter(city, state);
    if (!center) throw new Error("City was not found in the US Census places gazetteer");
    const found = new Map<string, Record<string, unknown>>();
    let calls = 0;
    const pages = input.action === "preview" ? Math.min(10, Math.max(1, Number(input.pages) || 1)) : 20;
    const searches = category ? [{ category }] : query ? [{ q: query }] :
      [{ category: "plumbing" }, { category: "hvac_service" }];
    for (const search of searches) {
      let offset = 0;
      for (let page = 0; page < pages && calls < 500; page++) {
        const result = await openPlacesSearch(null, { ...search, lat: center[0], lon: center[1],
          radius_mi: radius, limit: "category" in search ? 50 : 20,
          ...("category" in search ? { offset } : {}), min_confidence: 0.7 });
        calls++;
        for (const place of result.results) if (place.place_id)
          found.set(place.place_id, place as unknown as Record<string, unknown>);
        if (!("category" in search)) break;
        const next = Number(result.meta?.next_offset);
        if (!Number.isInteger(next) || next <= offset || next > 950) break;
        offset = next;
      }
    }
    if (input.action === "preview") return json({ places: [...found.values()], api_calls: calls,
      search_center: { lat: center[0], lon: center[1] }, category: category || null, query: query || null });
    const imported = await database<Record<string, unknown>>("rpc/enrichment_import_open_places", {
      method: "POST", body: JSON.stringify({ p_places: [...found.values()], p_city: city, p_state: state }),
    });
    return json({ ...imported, api_calls: calls, category: category || null, query: query || null,
      search_center: { lat: center[0], lon: center[1] } });
  } catch (error) { return errorResponse(error); }
});
