import { authorize, enrichGoogle, enrichOpenPlaces, errorResponse, json } from "../_shared/enrichment.ts";

declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void };
Deno.serve(async (request) => {
  try {
    authorize(request);
    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    const input = await request.json() as { lead_id?: string; grid?: number;
      provider?: "open_places" | "google_places" | "combined" };
    if (!input.lead_id || ![3, 5].includes(input.grid || 5))
      return json({ error: "lead_id and grid 3 or 5 are required" }, 400);
    if (input.provider && !["open_places", "google_places", "combined"].includes(input.provider))
      return json({ error: "Invalid enrichment provider" }, 400);
    if (input.provider === "open_places") return json(await enrichOpenPlaces(input.lead_id));
    return json(await enrichGoogle(input.lead_id, (input.grid || 5) as 3 | 5,
      input.provider !== "google_places"));
  } catch (error) { return errorResponse(error); }
});
