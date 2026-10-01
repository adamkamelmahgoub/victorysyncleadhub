import { PageTitle, PageDescription } from "@/components/page-layout";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListLeads } from "@workspace/api-client-react";
import { Users, Plus, Filter, Trash2, ChevronRight, Search, SlidersHorizontal, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { asArray, type ArrayElement } from "@/lib/data-shape";

interface Segment {
  id: number;
  name: string;
  description?: string;
  filters: {
    status?: string;
    source?: string;
    scoreMin?: number;
    scoreMax?: number;
    tag?: string;
    search?: string;
  };
  contactCount: number;
  createdAt: string;
}

const STATUS_OPTIONS = ["new", "contacted", "qualified", "meeting_booked", "proposal", "converted", "lost"];
const SOURCE_OPTIONS = ["LinkedIn", "Facebook", "Google Ads", "Referral", "Website", "Email", "Cold Outreach", "Webinar", "Other"];

type Filters = Segment["filters"];

const SEGMENT_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-red-500",
];

export default function Segments() {
  const qc = useQueryClient();
  const { data: leadsData } = useListLeads();
  const allLeads = asArray<ArrayElement<NonNullable<typeof leadsData>["leads"]>>(leadsData?.leads);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", filters: {} as Filters });
  const [previewFilters, setPreviewFilters] = useState<Filters>({});

  const { data: segmentsResponse = [], isLoading } = useQuery<Segment[]>({
    queryKey: ["segments"],
    queryFn: () => apiFetch("/api/segments"),
  });
  const segments = asArray<Segment>(segmentsResponse);

  const create = useMutation({
    mutationFn: (body: object) => apiFetch("/api/segments", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["segments"] }); setShowCreate(false); setForm({ name: "", description: "", filters: {} }); setPreviewFilters({}); },
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/segments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["segments"] }),
  });

  function applyFilters(leads: typeof allLeads, f: Filters) {
    return leads.filter((lead) => {
      if (f.status && lead.status !== f.status) return false;
      if (f.source && lead.source !== f.source) return false;
      if (f.scoreMin !== undefined && (lead.score ?? 0) < f.scoreMin) return false;
      if (f.scoreMax !== undefined && (lead.score ?? 0) > f.scoreMax) return false;
      if (f.tag && !asArray<string>(lead.tags).includes(f.tag)) return false;
      if (f.search) {
        const q = f.search.toLowerCase();
        if (!(`${lead.firstName} ${lead.lastName} ${lead.email} ${lead.company}`.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }

  const previewContacts = applyFilters(allLeads, previewFilters);
  const hasFilters = Object.values(previewFilters).some((v) => v !== undefined && v !== "");

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setPreviewFilters((f) => ({ ...f, [key]: value }));
    setForm((f) => ({ ...f, filters: { ...f.filters, [key]: value } }));
  }

  function clearFilter(key: keyof Filters) {
    setPreviewFilters((f) => { const n = { ...f }; delete n[key]; return n; });
    setForm((f) => { const filters = { ...f.filters }; delete filters[key]; return { ...f, filters }; });
  }

  const PRESET_SEGMENTS = [
    { name: "Hot Leads", description: "Score 80+", filters: { scoreMin: 80 }, icon: "🔥" },
    { name: "New Contacts", description: "Status: New", filters: { status: "new" }, icon: "✨" },
    { name: "Qualified", description: "Status: Qualified", filters: { status: "qualified" }, icon: "✅" },
    { name: "Lost Deals", description: "Status: Lost", filters: { status: "lost" }, icon: "❌" },
    { name: "From LinkedIn", description: "Source: LinkedIn", filters: { source: "LinkedIn" }, icon: "💼" },
    { name: "Converted Customers", description: "Status: Converted", filters: { status: "converted" }, icon: "💰" },
  ];

  return (
    <>
      <div className="page-stack ">
        <div className="flex items-center justify-between flex-wrap gap-4 min-w-0">
          <div>
            <PageTitle>Segments & Smart Lists</PageTitle>
            <PageDescription>Save contact filters as reusable segments for targeting and automation</PageDescription>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90">
            <Plus className="w-4 h-4" /> New Segment
          </button>
        </div>

        {/* Preset segments */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick Segments</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PRESET_SEGMENTS.map((preset, i) => {
              const count = applyFilters(allLeads, preset.filters).length;
              return (
          <Link key={preset.name} href={`/leads?status=${preset.filters.status ?? ""}&source=${preset.filters.source ?? ""}&scoreMin=${preset.filters.scoreMin ?? ""}`}>
                  <div className="bg-white rounded-xl border border-border shadow-sm p-4 hover:border-primary/40 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`}>
                        {preset.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">{preset.name}</div>
                        <div className="text-xs text-muted-foreground">{preset.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-bold text-foreground">{count}</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Custom segments */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Custom Segments</div>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : segments.length === 0 ? (
            <div className="bg-white rounded-xl border border-border shadow-sm p-8 text-center">
              <Filter className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No custom segments yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-3">Create a segment to save a filter and reuse it across automations</p>
              <button onClick={() => setShowCreate(true)} className="text-sm text-primary hover:underline">Create your first segment</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {segments.map((seg, i) => (
                <div key={seg.id} className="bg-white rounded-xl border border-border shadow-sm p-4 group">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-base flex-shrink-0 ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`}>
                      <Filter className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground text-sm">{seg.name}</div>
                      {seg.description && <div className="text-xs text-muted-foreground truncate">{seg.description}</div>}
                    </div>
                    <button onClick={() => remove.mutate(seg.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-foreground">{seg.contactCount}</div>
                      <div className="text-xs text-muted-foreground">contacts</div>
                    </div>
                    <div className="flex flex-wrap gap-1 max-w-[120px] justify-end">
                      {Object.entries(seg.filters).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => (
                        <span key={k} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground capitalize">{k}: {String(v)}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border">
                      <Link href={`/leads?status=${(seg.filters.status as string) ?? ""}`} className="flex-1">
                      <div className="flex items-center justify-center gap-1.5 text-xs py-1.5 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors cursor-pointer">
                        <ExternalLink className="w-3 h-3" /> View Contacts
                      </div>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create segment modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Create Segment</h3>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Segment Name *</label>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="workspace-control w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. Hot Leads Q3" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Description</label>
                  <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="workspace-control w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder="Optional description" />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filters</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Status</label>
                    <select value={previewFilters.status ?? ""} onChange={(e) => e.target.value ? updateFilter("status", e.target.value) : clearFilter("status")} className="workspace-control w-full px-3 py-2 text-sm border border-border rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="">Any status</option>
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s} className="capitalize">{s === "meeting_booked" ? "Meeting Booked" : s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Source</label>
                    <select value={previewFilters.source ?? ""} onChange={(e) => e.target.value ? updateFilter("source", e.target.value) : clearFilter("source")} className="workspace-control w-full px-3 py-2 text-sm border border-border rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="">Any source</option>
                      {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Min Score</label>
                    <input type="number" min={0} max={100} value={previewFilters.scoreMin ?? ""} onChange={(e) => e.target.value ? updateFilter("scoreMin", parseInt(e.target.value)) : clearFilter("scoreMin")} placeholder="0" className="workspace-control w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Max Score</label>
                    <input type="number" min={0} max={100} value={previewFilters.scoreMax ?? ""} onChange={(e) => e.target.value ? updateFilter("scoreMax", parseInt(e.target.value)) : clearFilter("scoreMax")} placeholder="100" className="workspace-control w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Name / Email / Company Contains</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <input value={previewFilters.search ?? ""} onChange={(e) => e.target.value ? updateFilter("search", e.target.value) : clearFilter("search")} placeholder="Search keywords..." className="workspace-control w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className={`rounded-xl border p-4 ${hasFilters ? "border-primary/30 bg-primary/5" : "border-border bg-muted/30"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className={`w-4 h-4 ${hasFilters ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-sm font-medium text-foreground">Matching Contacts</span>
                  </div>
                  <span className={`text-2xl font-bold ${hasFilters ? "text-primary" : "text-muted-foreground"}`}>{previewContacts.length}</span>
                </div>
                {previewContacts.length > 0 && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {previewContacts.slice(0, 5).map((l) => (
                      <div key={l.id} className="flex items-center gap-1.5 text-xs bg-white border border-border rounded-full px-2.5 py-1">
                        <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{l.firstName?.[0]}</div>
                        {l.firstName} {l.lastName}
                      </div>
                    ))}
                    {previewContacts.length > 5 && <span className="text-xs text-muted-foreground self-center">+{previewContacts.length - 5} more</span>}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:bg-muted">Cancel</button>
              <button
                onClick={() => create.mutate(form)}
                disabled={!form.name.trim() || create.isPending}
                className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40"
              >
                {create.isPending ? "Saving..." : `Save Segment (${previewContacts.length} contacts)`}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
