import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useEnrichmentPreference } from "@/lib/enrichment-preference";

type Snapshot = { custom_fields?: { open_places?: { name?: string; category?: string;
  website?: string; attribution?: string; fetched_at?: string; match_confidence?: number };
  google?: { place_id?: string; fetched_at?: string };
  enrichment?: { summary?: string; call_hooks?: string[]; website_issues?: string[];
    sources?: Array<{ field: string; url: string }>; fetched_at?: string } }; fit_notes?: string };
export function CompanyEnrichment({ companyId }: { companyId: string }) {
  const cache = useQueryClient();
  const preference = useEnrichmentPreference();
  const query = useQuery<Snapshot>({ queryKey: ["company-enrichment", companyId],
    queryFn: () => apiFetch(`/api/enrichment?action=company&company_id=${companyId}`) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [google, setGoogle] = useState<{ rating?: number; review_count?: number;
    category?: string; top3_points?: number; grid?: Array<{ position: number }> } | null>(null);
  async function enrich() {
    setBusy(true); setError("");
    try {
      const result = await apiFetch("/api/enrichment?action=company_enrich", { method: "POST",
        body: JSON.stringify({ company_id: companyId, mode: "both", grid: 3,
          provider: preference.provider }) }) as { google?: typeof google };
      setGoogle(result.google || null);
      await cache.invalidateQueries({ queryKey: ["company-enrichment", companyId] });
      await cache.invalidateQueries({ queryKey: ["company-crm", "company", companyId] });
    } catch (e) {
      await cache.invalidateQueries({ queryKey: ["company-enrichment", companyId] });
      await cache.invalidateQueries({ queryKey: ["company-crm", "company", companyId] });
      setError(e instanceof Error ? e.message : "Enrichment failed");
    }
    finally { setBusy(false); }
  }
  async function ask() {
    if (!question.trim()) return;
    setBusy(true); setError("");
    try {
      const result = await apiFetch("/api/enrichment?action=company_ask", { method: "POST",
        body: JSON.stringify({ company_id: companyId, question }) }) as { answer: string };
      setAnswer(result.answer);
    } catch (e) { setError(e instanceof Error ? e.message : "Question failed"); }
    finally { setBusy(false); }
  }
  const data = query.data?.custom_fields;
  return <section className="rounded-lg border bg-white p-5 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Company enrichment</h2>
      <p className="text-xs text-slate-500">Choose a listing source; AI research is saved to this company.</p></div>
      <div className="flex flex-wrap items-center gap-2"><label className="text-xs font-medium">Source
        <select aria-label="Company enrichment source" value={preference.provider} onChange={(event) => preference.setProvider(event.target.value as "open_places" | "google_places")}
          className="ml-2 rounded-lg border px-2 py-2 text-sm"><option value="open_places">Open Places</option><option value="google_places">Google Places</option></select></label>
        <button type="button" onClick={() => void preference.save()} disabled={preference.saving} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50">{preference.saved ? "Preference saved" : preference.saving ? "Saving…" : "Save preference"}</button>
        <button onClick={() => void enrich()} disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Working…" : "Enrich company"}</button></div></div>
    {preference.error && <p role="alert" className="text-sm text-red-700">{preference.error}</p>}
    <p className="text-xs text-slate-500">{preference.provider === "open_places" ? "Open Places listing + AI research. No Google calls." : "Google Places rating and rank + AI research. Google usage applies."}</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {query.error && <p className="text-sm text-red-700">{String(query.error)}</p>}
    {data?.open_places && <div className="text-sm"><strong>Business listing (Open Places / Overture)</strong>
      <p>{data.open_places.name} · {data.open_places.category || "Category unavailable"}</p>
      {data.open_places.website && <a className="text-blue-700 underline" href={data.open_places.website} target="_blank" rel="noreferrer">Website</a>}
      <p className="text-xs text-slate-500">Data © OpenStreetMap contributors and Overture Maps Foundation</p></div>}
    {data?.google?.place_id && <p className="text-sm"><strong>Google Places ID:</strong> {data.google.place_id}</p>}
    {google && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm"><strong>Google Places snapshot</strong>
      <p>{google.rating ?? "–"} stars · {google.review_count ?? "–"} reviews · {google.category || "Unknown category"}</p>
      {!!google.grid?.length && <p>Top 3 on {google.top3_points}/{google.grid.length} grid points</p>}
      <p className="text-xs text-slate-500">Google content is shown for this request; only its place ID is saved.</p></div>}
    {data?.enrichment && <div className="space-y-2 text-sm"><strong>AI research</strong>
      <p>{data.enrichment.summary}</p>
      {!!data.enrichment.call_hooks?.length && <div><strong>Call hooks</strong><ul className="list-disc pl-5">{data.enrichment.call_hooks.map((h) => <li key={h}>{h}</li>)}</ul></div>}
      {!!data.enrichment.website_issues?.length && <p>Website issues: {data.enrichment.website_issues.join(", ")}</p>}
      {!!data.enrichment.sources?.length && <div className="flex flex-wrap gap-3">{data.enrichment.sources.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">{s.field || "Source"}</a>)}</div>}
    </div>}
    <div className="flex gap-2"><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about this company…" className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" />
      <button onClick={() => void ask()} disabled={busy || !question.trim()} className="rounded-lg border px-4 text-sm disabled:opacity-50">Ask AI</button></div>
    {answer && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{answer}</p>}
  </section>;
}
