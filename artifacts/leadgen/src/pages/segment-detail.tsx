import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContactGrid, type ContactRow } from "@/components/contact-grid";
import { ContactBulkActions } from "@/components/contact-bulk-actions";
import { apiFetch } from "@/lib/api";
import { asArray } from "@/lib/data-shape";
import { getDisplayName } from "@/lib/contact-display";

type SegmentResponse = { segment: { id: string; name: string; segmentType: "smart" | "static"; filterSummary: string }; leads: ContactRow[]; total: number; page: number; limit: number };

export default function SegmentDetail() {
  const [, params] = useRoute("/contacts/segments/:id");
  const id = params?.id ?? "";
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("created_at");
  const [desc, setDesc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [actionError, setActionError] = useState("");
  const { data, isLoading, error } = useQuery<SegmentResponse>({ queryKey: ["segment-contacts", id, page, search, sort, desc], enabled: Boolean(id), queryFn: () => {
    const query = new URLSearchParams({ page: String(page), limit: "50", search, sort, desc: String(desc) });
    return apiFetch(`/api/segments/${id}/contacts?${query}`);
  } });
  const { data: choices } = useQuery<{leads:ContactRow[]}>({ queryKey: ["segment-add-search",contactSearch], enabled: adding && contactSearch.trim().length > 1, queryFn: () => apiFetch(`/api/leads?search=${encodeURIComponent(contactSearch)}&limit=20`) });
  const leads = asArray<ContactRow>(data?.leads);
  const total = data?.total ?? 0;
  async function refresh() { await client.invalidateQueries({ queryKey: ["segment-contacts", id] }); await client.invalidateQueries({ queryKey: ["segments"] }); }
  async function add(idToAdd: string) {
    setActionError("");
    try { await apiFetch(`/api/segments/${id}/members`, { method: "POST", body: JSON.stringify({ ids: [idToAdd] }) }); await refresh(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "Could not add contact"); }
  }
  async function removeSelected() {
    if (!selected.size || !window.confirm(`Remove ${selected.size} contacts from this static segment?`)) return;
    setActionError("");
    try { await apiFetch(`/api/segments/${id}/members`, { method: "DELETE", body: JSON.stringify({ ids: [...selected] }) }); setSelected(new Set()); await refresh(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "Could not remove contacts"); }
  }
  return <div className="page-stack"><header><Link href="/segments" className="text-sm text-primary hover:underline">← All segments</Link>
    <div className="mt-2 flex flex-wrap items-end justify-between gap-2"><div><h1 className="text-2xl font-semibold">{data?.segment.name ?? "Segment"}</h1><p className="text-sm text-muted-foreground">{data?.segment.segmentType === "static" ? "Static" : "Smart"} · {total.toLocaleString()} contacts · {data?.segment.filterSummary ?? ""}</p></div>
      {data?.segment.segmentType === "static" && <div className="flex gap-2"><Button variant="outline" onClick={() => setAdding((value) => !value)}>Add contacts</Button><Button variant="outline" disabled={!selected.size} onClick={() => void removeSelected()}>Remove selected</Button></div>}</div></header>
    {adding && <div className="rounded-lg border p-3"><Input placeholder="Search contacts to add" aria-label="Search contacts to add" value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} />
      <div className="mt-2 max-h-48 overflow-y-auto">{asArray<ContactRow>(choices?.leads).map((lead) => <button key={lead.id} className="flex w-full justify-between border-b p-2 text-left text-sm hover:bg-muted" onClick={() => void add(lead.id)}><span>{getDisplayName(lead)} · {lead.company}</span><span>Add</span></button>)}</div></div>}
    {actionError && <p role="alert" className="text-destructive">{actionError}</p>}
    <div className="rounded-lg border bg-card"><div className="flex flex-wrap items-center gap-2 border-b p-3"><Input className="min-w-48 flex-1" placeholder="Search this segment" aria-label="Search this segment" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
      <select className="workspace-control rounded border px-2 py-2 text-sm" aria-label="Sort segment contacts" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="created_at">Created date</option><option value="name">Name</option><option value="company">Company</option></select>
      <Button variant="outline" onClick={() => setDesc((value) => !value)}>{desc ? "↓" : "↑"}</Button><Button variant="outline" onClick={() => setSelected(new Set(leads.map((lead) => lead.id)))}>Select page</Button></div>
      {isLoading && <p className="p-6">Loading contacts…</p>}{error && <p role="alert" className="p-6 text-destructive">{error instanceof Error ? error.message : "Could not load segment"}</p>}
      {!isLoading && !error && <ContactGrid contacts={leads} selected={selected} onSelect={(leadId) => setSelected((current) => { const next = new Set(current); next.has(leadId) ? next.delete(leadId) : next.add(leadId); return next; })} />}
      <ContactBulkActions selected={selected} segmentId={id} total={total} onDone={() => { setSelected(new Set()); void refresh(); }} />
      <div className="flex items-center justify-between border-t p-3 text-sm"><span>{total ? (page-1)*50+1 : 0}–{Math.min(page*50,total)} of {total.toLocaleString()}</span><div className="flex gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(page-1)}>Previous</Button><Button variant="outline" disabled={page*50 >= total} onClick={() => setPage(page+1)}>Next</Button></div></div>
    </div>
  </div>;
}
