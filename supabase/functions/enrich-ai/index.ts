import { authorize, askAboutLead, enrichAi, errorResponse, json } from "../_shared/enrichment.ts";

declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void };
Deno.serve(async (request) => {
  try {
    authorize(request);
    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    const input = await request.json() as { lead_id?: string; question?: string };
    if (!input.lead_id) return json({ error: "lead_id is required" }, 400);
    if (input.question) {
      if (input.question.length > 2000) return json({ error: "Question is too long" }, 400);
      return json(await askAboutLead(input.lead_id, input.question));
    }
    return json(await enrichAi(input.lead_id));
  } catch (error) { return errorResponse(error); }
});
