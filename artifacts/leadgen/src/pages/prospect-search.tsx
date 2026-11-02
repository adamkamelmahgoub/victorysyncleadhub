import { PageTitle, PageDescription } from "@/components/page-layout";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Search, Filter, Plus, UserPlus, Linkedin, Globe, MapPin, Building2, Users, Zap, ChevronDown, ChevronUp, X, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { asArray } from "@/lib/data-shape";
import { BusinessDiscovery } from "@/components/business-discovery";
import { CrmProspects } from "@/components/crm-prospects";

interface Prospect { id: string; firstName: string; lastName: string; email?: string; title?: string; seniority?: string; department?: string; company?: string; companySize?: string; industry?: string; city?: string; state?: string; country?: string; technologies?: string[]; intentScore: number; emailVerified: boolean; savedToLeads: boolean; }

const SEN_LABELS: Record<string, string> = { individual_contributor: "IC", manager: "Manager", director: "Director", vp: "VP", c_suite: "C-Suite", founder: "Founder" };

function IntentBadge({ score }: { score: number }) {
  if (score >= 80) return <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">🔥 {score}</span>;
  if (score >= 60) return <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">⚡ {score}</span>;
  return <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{score}</span>;
}

export default function ProspectSearch() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ search: "", title: "", industry: "", companySize: "", seniority: "", minIntent: "0" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(true);

  const { data: result, isLoading, error: searchError } = useQuery({
    queryKey: ["prospects", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v && v !== "0") params.set(k, v); });
      return apiFetch(`/prospects?${params}`);
    },
  });

  const { data: filterOptions } = useQuery({ queryKey: ["prospect-filters"], queryFn: () => apiFetch("/prospects/filters") });

  const saveMutation = useMutation({
    mutationFn: (prospects: Prospect[]) => apiFetch("/prospects/save-to-leads", { method: "POST", body: JSON.stringify({ ids: prospects.map((p) => p.id) }) }),
    onSuccess: (data) => { toast({ title: `${data.saved} prospects saved as leads`, description: data.skipped ? `${data.skipped} already saved or suppressed` : undefined }); setSelected(new Set()); qc.invalidateQueries({ queryKey: ["prospects"] }); },
    onError: (error) => toast({ title: "Could not save prospects", description: String(error), variant: "destructive" }),
  });

  const prospects = asArray<Prospect>(result?.prospects);
  const industries = asArray<string>(filterOptions?.industries);
  const companySizes = asArray<string>(filterOptions?.companySizes);
  const seniorities = asArray<string>(filterOptions?.seniorities);
  const toggleSelect = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(selected.size === prospects.filter((p) => !p.savedToLeads).length
    ? new Set() : new Set(prospects.filter((p) => !p.savedToLeads).map(p => p.id)));
  const selectedProspects = prospects.filter(p => selected.has(p.id));

  const setFilter = (k: string, v: string) => setFilters(f => ({ ...f, [k]: v }));
  const clearFilters = () => setFilters({ search: "", title: "", industry: "", companySize: "", seniority: "", minIntent: "0" });

  return (
    <div className="page-stack">
      <BusinessDiscovery />
      <CrmProspects />
      {prospects.length > 0 && <>
      <div className="flex items-center justify-between flex-wrap gap-4 min-w-0">
        <div>
          <PageTitle>Imported prospect records</PageTitle>
          <PageDescription>Prospects imported from another source that have not yet been saved as leads</PageDescription>
        </div>
        {selected.size > 0 && (
          <Button className="bg-primary text-white" onClick={() => saveMutation.mutate(selectedProspects)} disabled={saveMutation.isPending}>
            <UserPlus className="w-4 h-4 mr-2" /> Save {selected.size} to Contacts
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {showFilters && (
          <div className="w-full shrink-0 space-y-4 workspace-panel p-4 h-fit lg:sticky lg:top-4 lg:w-64">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Filters</span>
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground">Clear all</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Job Title</label>
                <Input className="mt-1" placeholder="e.g. VP of Sales" value={filters.title} onChange={e => setFilter("title", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Industry</label>
                <Select value={filters.industry} onValueChange={v => setFilter("industry", v === "all" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Any industry" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    {industries.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Company Size</label>
                <Select value={filters.companySize} onValueChange={v => setFilter("companySize", v === "all" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Any size" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    {companySizes.map((s) => <SelectItem key={s} value={s}>{s} employees</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Seniority</label>
                <Select value={filters.seniority} onValueChange={v => setFilter("seniority", v === "all" ? "" : v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Any level" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any</SelectItem>
                    {seniorities.map(s => <SelectItem key={s} value={s}>{SEN_LABELS[s] || s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Min Intent Score: {filters.minIntent}</label>
                <Slider className="mt-2" min={0} max={100} step={5} value={[parseInt(filters.minIntent)]} onValueChange={([v]) => setFilter("minIntent", String(v))} />
              </div>
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search name, company, email…" className="pl-9" value={filters.search} onChange={e => setFilter("search", e.target.value)} />
            </div>
            <Button variant="outline" onClick={() => setShowFilters(f => !f)}>
              <Filter className="w-4 h-4 mr-2" />{showFilters ? "Hide" : "Show"} Filters
            </Button>
          </div>

          {selected.size > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 flex items-center justify-between">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>Clear</Button>
                <Button size="sm" className="bg-primary text-white" onClick={() => saveMutation.mutate(selectedProspects)} disabled={saveMutation.isPending}><UserPlus className="w-3.5 h-3.5 mr-1.5" /> Save to Contacts</Button>
              </div>
            </div>
          )}

          <div className="workspace-panel overflow-x-auto">
            <div className="flex min-w-[720px] items-center gap-3 px-4 py-3 border-b bg-muted/30">
              <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground">
                {selected.size === prospects.length && prospects.length > 0 ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
              </button>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">Prospect</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Company</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Industry</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20 text-center">Intent</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16 text-center">Email</span>
              <span className="w-8" />
            </div>
            {searchError ? (
              <div className="text-center py-16 text-destructive">Could not load stored prospects: {String(searchError)}</div>
            ) : isLoading ? (
              <div className="text-center py-16 text-muted-foreground">Searching…</div>
            ) : prospects.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">No prospects found: try adjusting your filters</div>
            ) : prospects.map(p => (
              <div key={p.id} className={`flex min-w-[720px] items-center gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/20 transition-colors ${selected.has(p.id) ? "bg-primary/5" : ""}`}>
                <button onClick={() => toggleSelect(p.id)} disabled={p.savedToLeads} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                  {selected.has(p.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{p.firstName} {p.lastName}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{p.title}</span>
                    {p.seniority && <Badge variant="outline" className="text-[10px] h-4 px-1">{SEN_LABELS[p.seniority] || p.seniority}</Badge>}
                  </div>
                  {p.email && <div className="text-xs text-muted-foreground mt-0.5">{p.email}</div>}
                </div>
                <div className="w-32 min-w-0">
                  <div className="font-medium text-sm truncate">{p.company}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3" />{p.companySize}</div>
                </div>
                <div className="w-24 text-xs text-muted-foreground">{p.industry}</div>
                <div className="w-20 flex justify-center"><IntentBadge score={p.intentScore} /></div>
                <div className="w-16 flex justify-center">
                  {p.emailVerified ? <span className="text-green-600 text-xs font-medium">✓ Valid</span> : <span className="text-muted-foreground text-xs">Unverified</span>}
                </div>
                <div className="w-8">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={p.savedToLeads || saveMutation.isPending} onClick={() => saveMutation.mutate([p])} title={p.savedToLeads ? "Already saved" : "Save to contacts"}><UserPlus className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground text-center">{result?.total || 0} prospects found</div>
        </div>
      </div>
      </>}
    </div>
  );
}
