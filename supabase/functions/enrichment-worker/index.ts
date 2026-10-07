import { authorize, costEstimate, database, errorResponse, json, runLead, sendJobSummary, type Mode } from "../_shared/enrichment.ts";

declare const Deno: { serve(handler: (request: Request) => Promise<Response>): void };
type Claimed = { job_id: string; lead_id: string; mode: Mode; grid: 3 | 5;
  max_cost_usd: number | null; job_cost_usd: number };

Deno.serve(async (request) => {
  try {
    authorize(request);
    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    const claimed = await database<Claimed[]>("rpc/enrichment_claim_batch", {
      method: "POST", body: JSON.stringify({ p_limit: 10 }),
    });
    const results = [] as Array<{ job_id: string; lead_id: string; status: string }>;
    async function processItem(item: Claimed) {
      const start = new Date().toISOString();
      let success = false, message: string | null = null;
      try {
        const currentJob = await database<Array<{ cost_usd: number }>>(
          `enrichment_jobs?id=eq.${item.job_id}&select=cost_usd`,
        );
        if (item.max_cost_usd !== null &&
            Number(currentJob[0]?.cost_usd || 0) + costEstimate(item.mode, item.grid) > Number(item.max_cost_usd)) {
          await database(`enrichment_jobs?id=eq.${item.job_id}`, {
            method: "PATCH", body: JSON.stringify({ status: "paused_budget" }),
          });
          message = "Job cost cap reached";
        } else {
          await runLead(item.lead_id, item.mode, item.grid);
          success = true;
        }
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
        if (message.includes("budget")) {
          await database(`enrichment_jobs?id=eq.${item.job_id}`, {
            method: "PATCH", body: JSON.stringify({ status: "paused_budget" }),
          });
        }
      }
      const calls = await database<Array<{ cost_usd: number }>>(
        `lead_enrichment?lead_id=eq.${item.lead_id}&fetched_at=gte.${encodeURIComponent(start)}&select=cost_usd`,
      );
      const cost = calls.reduce((sum, call) => sum + Number(call.cost_usd), 0);
      const finished = await database<boolean>("rpc/enrichment_complete_item", {
        method: "POST", body: JSON.stringify({ p_job_id: item.job_id, p_lead_id: item.lead_id,
          p_cost: cost, p_success: success, p_error: message }),
      });
      results.push({ job_id: item.job_id, lead_id: item.lead_id,
        status: success ? "done" : message?.includes("budget") ? "paused_budget" : "retry_or_failed" });
      if (finished) {
        const jobs = await database<Array<{ total: number; done: number; failed: number; cost_usd: number }>>(
          `enrichment_jobs?id=eq.${item.job_id}&select=total,done,failed,cost_usd`,
        );
        const counts = await database<Record<string, number>>("rpc/enrichment_job_tag_counts", {
          method: "POST", body: JSON.stringify({ p_job_id: item.job_id }),
        });
        await sendJobSummary(`Victory Sync enrichment job ${item.job_id} finished: ${jobs[0]?.done}/${jobs[0]?.total} done, ${jobs[0]?.failed} failed, $${Number(jobs[0]?.cost_usd || 0).toFixed(2)} estimated cost. Tags: ${JSON.stringify(counts)}`).catch(() => {});
      }
    }
    // Claim ten at once, but run only two leads concurrently to stay inside
    // Supabase Edge wall time and avoid bursts against Google and Anthropic.
    for (let index = 0; index < claimed.length; index += 2)
      await Promise.all(claimed.slice(index, index + 2).map(processItem));
    return json({ processed: results.length, results });
  } catch (error) { return errorResponse(error); }
});
