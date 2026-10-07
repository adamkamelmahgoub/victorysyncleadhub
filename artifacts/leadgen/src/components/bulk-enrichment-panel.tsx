import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

type Mode = "google" | "ai" | "both";
type Preview = { count: number; estimated_cost_usd: number;
  budget: { monthly_budget_usd: number; month_reserved_usd: number } };
type Job = { job_id: string; total: number; estimated_cost_usd: number };
type Status = { status: string; total: number; done: number; failed: number; cost_usd: number;
  tag_counts: Record<string, number> };

export function BulkEnrichmentPanel({ segmentId, initialTags = "", onClose }: {
  segmentId?: string; initialTags?: string; onClose: () => void;
}) {
  const [tagsText, setTagsText] = useState(initialTags);
  const [mode, setMode] = useState<Mode>("both"), [grid, setGrid] = useState<3 | 5>(3);
  const [maxCost, setMaxCost] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const selector = segmentId ? { segment_id: segmentId } :
    { tags: tagsText.split(",").map((tag) => tag.trim()).filter(Boolean) };
  const previewRequest = useMutation({ mutationFn: () => apiFetch("/api/enrichment?action=preview", {
    method: "POST", body: JSON.stringify({ ...selector, mode, grid }),
  }) as Promise<Preview>, onSuccess: setPreview });
  const start = useMutation({ mutationFn: () => apiFetch("/api/enrichment?action=bulk", {
    method: "POST", body: JSON.stringify({ ...selector, mode, grid,
      max_cost_usd: Number(maxCost || preview?.estimated_cost_usd || 0) }),
  }) as Promise<Job>, onSuccess: setJob });
  const { data: status } = useQuery<Status>({ queryKey: ["enrichment-job", job?.job_id],
    queryFn: () => apiFetch(`/api/enrichment?action=job&job_id=${job?.job_id}`),
    enabled: Boolean(job), refetchInterval: job ? 10000 : false });
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
    <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4" onClick={(event) => event.stopPropagation()}>
      <div className="flex justify-between"><h2 className="text-lg font-semibold">Enrich all</h2><button onClick={onClose} aria-label="Close">✕</button></div>
      {!segmentId && <label className="block text-sm">Tags to match (comma separated, all required)
        <input value={tagsText} onChange={(event) => { setTagsText(event.target.value); setPreview(null); }} placeholder="top3-prospect, region-tristate" className="mt-1 w-full rounded-lg border px-3 py-2" /></label>}
      <div className="flex gap-3"><label className="text-sm">Mode<select value={mode} onChange={(event) => { setMode(event.target.value as Mode); setPreview(null); }} className="mt-1 block rounded-lg border px-3 py-2"><option value="both">Google + AI</option><option value="google">Google only</option><option value="ai">AI only</option></select></label>
        <label className="text-sm">Grid<select value={grid} onChange={(event) => { setGrid(Number(event.target.value) as 3 | 5); setPreview(null); }} className="mt-1 block rounded-lg border px-3 py-2"><option value={3}>3×3</option><option value={5}>5×5</option></select></label></div>
      {!job && <button onClick={() => previewRequest.mutate()} disabled={previewRequest.isPending || (!segmentId && !tagsText.trim())} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{previewRequest.isPending ? "Estimating…" : "Show cost estimate"}</button>}
      {preview && !job && <div className="rounded-lg bg-muted p-3 text-sm space-y-2"><p>{preview.count} leads · reserve up to ${preview.estimated_cost_usd.toFixed(2)}</p><p>Monthly budget: ${Number(preview.budget.monthly_budget_usd).toFixed(2)} · reserved so far: ${Number(preview.budget.month_reserved_usd).toFixed(2)}</p>
        <label className="block">Maximum job spend (USD)<input type="number" min="0.01" step="0.01" value={maxCost} onChange={(event) => setMaxCost(event.target.value)} placeholder={preview.estimated_cost_usd.toFixed(2)} className="mt-1 block w-full rounded-lg border px-3 py-2" /></label>
        <button onClick={() => start.mutate()} disabled={start.isPending || !preview.count} className="rounded-lg bg-primary px-4 py-2 text-white disabled:opacity-50">{start.isPending ? "Starting…" : "Start enrichment"}</button></div>}
      {job && <div className="rounded-lg bg-muted p-3 text-sm space-y-1"><p>Job {job.job_id}</p><p>{status?.status || "queued"}: {status?.done || 0}/{status?.total || job.total} done · {status?.failed || 0} failed · ${Number(status?.cost_usd || 0).toFixed(2)} estimated cost</p>
        {status?.tag_counts && <p>Tags: {Object.entries(status.tag_counts).map(([tag, count]) => `${tag} ${count}`).join(" · ") || "none yet"}</p>}</div>}
      {(previewRequest.error || start.error) && <p className="text-sm text-red-600">{String(previewRequest.error || start.error)}</p>}
    </div>
  </div>;
}
