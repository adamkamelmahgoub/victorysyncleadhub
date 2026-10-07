import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Google = { status: string; name?: string; city?: string; state?: string; rating?: number;
  review_count?: number; category?: string; hours?: unknown; website?: string; place_id?: string;
  top3_points?: number; avg_rank?: number; reviews_vs_top3_pct?: number;
  suggested_tags?: string[];
  grid?: Array<{ x: number; y: number; position: number }>;
  competitors?: Array<{ name?: string; rating?: number; review_count?: number; place_id: string }> };
type Ai = { owner_name?: string | null; owner_title?: string | null; website_issues?: string[];
  call_hooks?: string[]; summary?: string; confidence?: string;
  sources?: Array<{ field: string; url: string }> };
type State = { google?: { place_id?: string; fetched_at?: string }; enrichment?: Ai;
  history?: Array<{ source: string; status: string; fetched_at: string; cost_usd: number }> };
const safeUrl = (url: string) => /^https?:\/\//i.test(url);

export function EnrichmentCard({ leadId }: { leadId: string }) {
  const qc = useQueryClient(), { toast } = useToast();
  const [google, setGoogle] = useState<Google | null>(null);
  const [grid, setGrid] = useState<3 | 5>(5);
  const [question, setQuestion] = useState(""), [answer, setAnswer] = useState("");
  const [answerSources, setAnswerSources] = useState<string[]>([]);
  const { data } = useQuery<State>({ queryKey: ["lead-enrichment", leadId],
    queryFn: () => apiFetch(`/api/enrichment?action=lead&lead_id=${encodeURIComponent(leadId)}`), enabled: !!leadId });
  const enrich = useMutation({ mutationFn: () => apiFetch("/api/enrichment?action=enrich", {
    method: "POST", body: JSON.stringify({ lead_id: leadId, mode: "both", grid }),
  }) as Promise<{ google?: Google; ai?: Ai }>,
  onSuccess: (result) => { setGoogle(result.google || null); qc.invalidateQueries({ queryKey: ["lead-enrichment", leadId] }); toast({ title: "Lead enriched" }); },
  onError: (error) => toast({ title: "Enrichment failed", description: String(error), variant: "destructive" }) });
  const ask = useMutation({ mutationFn: () => apiFetch("/api/enrichment?action=ask", {
    method: "POST", body: JSON.stringify({ lead_id: leadId, question }),
  }) as Promise<{ answer: string; sources?: string[] }>, onSuccess: (result) => { setAnswer(result.answer); setAnswerSources(result.sources || []); },
  onError: (error) => toast({ title: "Could not ask AI", description: String(error), variant: "destructive" }) });
  const save = useMutation({ mutationFn: () => apiFetch("/api/enrichment?action=save_note", {
    method: "POST", body: JSON.stringify({ lead_id: leadId, note: answer }),
  }), onSuccess: () => toast({ title: "Answer saved to notes" }) });
  const ai = data?.enrichment, last = data?.history?.[0]?.fetched_at;
  return <section className="rounded-2xl border border-border bg-white p-5 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Business enrichment</h2><p className="text-sm text-muted-foreground">{last ? `Last researched ${new Date(last).toLocaleString()}` : "No research yet"}</p></div>
      <div className="flex items-center gap-2"><select aria-label="Rank grid size" value={grid} onChange={(event) => setGrid(Number(event.target.value) as 3 | 5)} className="border rounded-lg px-2 py-2 text-sm"><option value={5}>5×5 grid</option><option value={3}>3×3 grid</option></select>
        <button disabled={enrich.isPending} onClick={() => enrich.mutate()} className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50">{enrich.isPending ? "Enriching…" : "Enrich"}</button></div>
    </div>
    {google?.status === "ok" && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Google Places snapshot</h3><a className="text-xs text-gray-600 underline" href={google.place_id ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(google.place_id)}` : "https://maps.google.com"} target="_blank" rel="noreferrer">Google Maps</a></div>
      <p className="text-sm">{google.name} · {google.city}, {google.state} · {google.rating ?? "–"} stars · {google.review_count ?? "–"} reviews</p>
      <p className="text-sm">Top 3 on {google.top3_points}/{google.grid?.length} points · average rank {google.avg_rank} · reviews versus top 3: {google.reviews_vs_top3_pct ?? "–"}%</p>
      <p className="text-sm">Category: {google.category || "–"} · Hours: {google.hours ? "listed" : "missing"}</p>
      {google.website && safeUrl(google.website) && <a className="text-sm underline" href={google.website} target="_blank" rel="noreferrer">Visit website</a>}
      <div className={`grid ${grid === 5 ? "grid-cols-5" : "grid-cols-3"} gap-1 max-w-xs`} aria-label="Search rank heatmap">{google.grid?.map((point) => <div key={`${point.x}:${point.y}`} title={`Rank ${point.position === 21 ? "not found" : point.position}`} className={`rounded p-2 text-center text-xs font-semibold ${point.position <= 3 ? "bg-green-200" : point.position <= 10 ? "bg-amber-200" : "bg-red-200"}`}>{point.position === 21 ? "21+" : point.position}</div>)}</div>
      {!!google.competitors?.length && <div className="text-sm"><strong>Center competitors</strong><ul className="list-disc pl-5">{google.competitors.map((competitor) => <li key={competitor.place_id}>{competitor.name}: {competitor.rating ?? "–"} stars, {competitor.review_count ?? "–"} reviews</li>)}</ul></div>}
      {!!google.suggested_tags?.length && <p className="text-sm">Suggested tags: {google.suggested_tags.join(", ")}</p>}
      <p className="text-xs text-muted-foreground">Places content is shown from this request and is not saved to the CRM.</p>
    </div>}
    {google?.status === "not_found" && <p className="text-sm text-amber-700">No reliable Google Places match was found.</p>}
    {ai && <div className="space-y-2"><h3 className="font-medium">AI research</h3><p className="text-sm">{ai.summary}</p><p className="text-sm">Owner: {ai.owner_name || "unconfirmed"} {ai.owner_title ? `(${ai.owner_title})` : ""}</p>
      {!!ai.website_issues?.length && <p className="text-sm">Website issues: {ai.website_issues.join("; ")}</p>}
      {!!ai.call_hooks?.length && <ul className="list-disc pl-5 text-sm">{ai.call_hooks.map((hook, index) => <li key={index}>{hook}</li>)}</ul>}
      {!!ai.sources?.length && <div className="flex flex-wrap gap-2 text-xs">{ai.sources.filter((source) => safeUrl(source.url)).map((source, index) => <a key={index} href={source.url} target="_blank" rel="noreferrer" className="underline">{source.field || "Source"}</a>)}</div>}</div>}
    <div className="space-y-2 border-t pt-4"><label htmlFor="ask-about-lead" className="block text-sm font-medium">Ask AI about this lead</label><div className="flex gap-2"><input id="ask-about-lead" value={question} onChange={(event) => setQuestion(event.target.value)} className="flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="What should I know before calling?" /><button disabled={!question.trim() || ask.isPending} onClick={() => ask.mutate()} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{ask.isPending ? "Searching…" : "Ask"}</button></div>
      {answer && <div className="space-y-2 rounded-lg bg-muted p-3 text-sm"><p className="whitespace-pre-wrap">{answer}</p><div className="flex flex-wrap gap-2">{answerSources.filter(safeUrl).map((url, index) => <a key={index} href={url} target="_blank" rel="noreferrer" className="text-primary underline">Source {index + 1}</a>)}</div><button disabled={save.isPending} onClick={() => save.mutate()} className="text-primary underline">Save to notes</button></div>}</div>
  </section>;
}
