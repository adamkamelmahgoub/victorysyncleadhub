import { authorize, enrichGoogle, errorResponse, json } from "../_shared/enrichment.ts";

declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void };
Deno.serve(async (request) => {
  try {
    authorize(request);
    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    const input = await request.json() as { lead_id?: string; grid?: number };
    if (!input.lead_id || ![3, 5].includes(input.grid || 5))
      return json({ error: "lead_id and grid 3 or 5 are required" }, 400);
    return json(await enrichGoogle(input.lead_id, (input.grid || 5) as 3 | 5));
  } catch (error) { return errorResponse(error); }
});
