import { authorize, askAboutCompany, enrichCompany, errorResponse, json } from "../_shared/enrichment.ts";

declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void };
Deno.serve(async (request) => {
  try {
    authorize(request);
    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    const input = await request.json() as { company_id?: string; mode?: "google" | "ai" | "both";
      grid?: 3 | 5; question?: string };
    if (!input.company_id) return json({ error: "company_id is required" }, 400);
    if (input.question) {
      if (input.question.length > 2000) return json({ error: "Question is too long" }, 400);
      return json(await askAboutCompany(input.company_id, input.question));
    }
    if (input.mode && !["google", "ai", "both"].includes(input.mode)) return json({ error: "Invalid mode" }, 400);
    if (input.grid && ![3, 5].includes(input.grid)) return json({ error: "Invalid grid" }, 400);
    return json(await enrichCompany(input.company_id, input.mode || "both", input.grid || 3));
  } catch (error) { return errorResponse(error); }
});
