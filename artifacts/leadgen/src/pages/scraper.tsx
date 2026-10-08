import { PageTitle, PageDescription } from "@/components/page-layout";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { useQueryClient } from "@tanstack/react-query";
import { getListLeadsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { asArray } from "@/lib/data-shape";
import {
  Globe,
  Search,
  Download,
  Zap,
  AlertTriangle,
  Info,
  Building2,
  Mail,
  Phone,
  User,
  ChevronRight,
  Copy,
  CheckCheck,
} from "lucide-react";

interface ScrapedLead {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string | null;
  title: string | null;
  sourceUrl: string;
  confidence: "high" | "medium" | "low";
}

const CONF_COLOR: Record<string, string> = {
  high: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  medium: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  low: "text-slate-400 bg-slate-400/10 border-slate-400/30",
};

type Tab = "url" | "domain" | "search";

function LeadRow({ lead, selected, onToggle }: { lead: ScrapedLead; selected: boolean; onToggle: () => void }) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
        selected ? "border-primary/50 bg-primary/8" : "border-border bg-card hover:border-border/80 hover:bg-muted/30"
      }`}
    >
      <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">
            {lead.firstName} {lead.lastName}
          </span>
          {lead.title && (
            <span className="text-xs text-muted-foreground">· {lead.title}</span>
          )}
          <Badge className={`text-[10px] px-1.5 py-0 ml-auto border ${CONF_COLOR[lead.confidence]}`}>
            {lead.confidence}
          </Badge>
        </div>
        <div className="flex items-center gap-4 flex-wrap text-xs">
          <span className="flex items-center gap-1 text-primary font-mono">
            <Mail className="w-3 h-3" /> {lead.email}
          </span>
          {lead.company && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Building2 className="w-3 h-3" /> {lead.company}
            </span>
          )}
          {lead.phone && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Phone className="w-3 h-3" /> {lead.phone}
            </span>
          )}
        </div>
      </div>
    </label>
  );
}

function ResultsPanel({
  leads,
  selected,
  onToggle,
  onSelectAll,
  onClearAll,
  onImport,
  importing,
  subtitle,
}: {
  leads: ScrapedLead[];
  selected: Set<string>;
  onToggle: (email: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onImport: () => void;
  importing: boolean;
  subtitle?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {leads.length} contact{leads.length !== 1 ? "s" : ""} found
          </p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={onSelectAll}>
            Select all
          </Button>
          <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={onClearAll}>
            Clear
          </Button>
        </div>
      </div>
      <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
        {leads.map((lead) => (
          <LeadRow key={lead.email} lead={lead} selected={selected.has(lead.email)} onToggle={() => onToggle(lead.email)} />
        ))}
      </div>
      <Button
        className="w-full gap-2 bg-primary hover:bg-primary/90 text-white"
        disabled={selected.size === 0 || importing}
        onClick={onImport}
      >
        {importing ? (
          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Importing…</>
        ) : (
          <><Download className="w-4 h-4" /> Import {selected.size > 0 ? `${selected.size} contact${selected.size !== 1 ? "s" : ""}` : "selected"}</>
        )}
      </Button>
    </div>
  );
}

export default function ScraperPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("domain");
  const [importing, setImporting] = useState(false);

  // URL tab
  const [urlInput, setUrlInput] = useState("");
  const [urlResults, setUrlResults] = useState<ScrapedLead[]>([]);
  const [urlTitle, setUrlTitle] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [urlSelected, setUrlSelected] = useState<Set<string>>(new Set());

  // Domain tab
  const [domainInput, setDomainInput] = useState("");
  const [domainResults, setDomainResults] = useState<ScrapedLead[]>([]);
  const [domainPatterns, setDomainPatterns] = useState<string[]>([]);
  const [domainLoading, setDomainLoading] = useState(false);
  const [domainError, setDomainError] = useState("");
  const [domainSelected, setDomainSelected] = useState<Set<string>>(new Set());
  const [domainChecked, setDomainChecked] = useState(0);
  const [copiedPattern, setCopiedPattern] = useState("");

  // Search tab
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ScrapedLead[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchSelected, setSearchSelected] = useState<Set<string>>(new Set());
  const [pagesScraped, setPagesScraped] = useState(0);

  async function scrapeUrl() {
    if (!urlInput.trim()) return;
    setUrlLoading(true); setUrlError(""); setUrlResults([]); setUrlSelected(new Set());
    try {
      const data = await apiFetch("/api/scraper/url", { method: "POST", body: JSON.stringify({ url: urlInput.trim() }) }) as { leads?: ScrapedLead[]; pageTitle?: string };
      const leads = asArray<ScrapedLead>(data.leads);
      setUrlResults(leads); setUrlTitle(data.pageTitle ?? urlInput);
      if (!leads.length) setUrlError("No contacts found. Try a /team, /about, or /people page with email addresses visible.");
    } catch (err) { setUrlError(String(err instanceof Error ? err.message : err)); }
    finally { setUrlLoading(false); }
  }

  async function searchDomain() {
    if (!domainInput.trim()) return;
    setDomainLoading(true); setDomainError(""); setDomainResults([]); setDomainSelected(new Set()); setDomainPatterns([]);
    try {
      const data = await apiFetch("/api/scraper/domain", { method: "POST", body: JSON.stringify({ domain: domainInput.trim() }) }) as { leads?: ScrapedLead[]; emailPatterns?: string[]; pagesChecked?: number };
      const leads = asArray<ScrapedLead>(data.leads);
      setDomainResults(leads);
      setDomainPatterns(asArray<string>(data.emailPatterns));
      setDomainChecked(data.pagesChecked ?? 0);
      if (!leads.length) setDomainError("No contacts found on this domain's team/about pages. They may use a JS-rendered site. Try pasting a specific URL instead.");
    } catch (err) { setDomainError(String(err instanceof Error ? err.message : err)); }
    finally { setDomainLoading(false); }
  }

  async function searchWeb() {
    if (!searchQuery.trim()) return;
    setSearchLoading(true); setSearchError(""); setSearchResults([]); setSearchSelected(new Set()); setPagesScraped(0);
    try {
      const data = await apiFetch("/api/scraper/search", { method: "POST", body: JSON.stringify({ query: searchQuery.trim() }) }) as { leads?: ScrapedLead[]; pagesScraped?: number; message?: string };
      const leads = asArray<ScrapedLead>(data.leads);
      setSearchResults(leads); setPagesScraped(data.pagesScraped ?? 0);
      if (!leads.length) setSearchError(data.message ?? "No contacts found. Try using Company Domain for specific companies, or paste a direct URL.");
    } catch (err) { setSearchError(String(err instanceof Error ? err.message : err)); }
    finally { setSearchLoading(false); }
  }

  async function importLeads(leads: ScrapedLead[], selected: Set<string>) {
    const toImport = leads.filter((l) => selected.has(l.email));
    if (!toImport.length) { toast({ title: "Select at least one contact", variant: "destructive" }); return; }
    setImporting(true);
    try {
      const result = await apiFetch("/api/scraper/import", { method: "POST",
        body: JSON.stringify({ contacts: toImport }) }) as { imported: number; skipped: number };
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
      toast({ title: `Imported ${result.imported} contact${result.imported !== 1 ? "s" : ""}`,
        description: result.skipped ? `${result.skipped} duplicates, suppressed, or invalid contacts skipped` : undefined });
    } catch (error) {
      toast({ title: "Import failed", description: String(error), variant: "destructive" });
    } finally { setImporting(false); }
  }

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, email: string) {
    const next = new Set(set); next.has(email) ? next.delete(email) : next.add(email); setter(next);
  }

  function copyPattern(p: string) {
    navigator.clipboard.writeText(p);
    setCopiedPattern(p);
    setTimeout(() => setCopiedPattern(""), 2000);
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "domain", label: "Company Domain", icon: <Building2 className="w-3.5 h-3.5" /> },
    { id: "url", label: "Scrape URL", icon: <Globe className="w-3.5 h-3.5" /> },
  ];

  return (

      <div className="page-stack">
        {/* Header */}
        <div>
          <PageTitle>Lead Finder</PageTitle>
          <PageDescription>Find public business emails on company websites. For local business discovery, use <a className="underline" href="/prospect-search">Prospecting</a>.</PageDescription>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-muted/50 border border-border rounded-xl p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? "bg-card border border-border text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ─── Company Domain tab ─── */}
        {tab === "domain" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Company domain</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="stripe.com"
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchDomain()}
                    className="bg-background border-border font-mono text-sm"
                  />
                  <Button onClick={searchDomain} disabled={domainLoading || !domainInput.trim()} className="bg-primary text-white gap-1.5 flex-shrink-0">
                    {domainLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-4 h-4" />}
                    {domainLoading ? "Scanning…" : "Find Contacts"}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                Automatically checks /team, /about, /people, /contact and extracts email addresses
              </p>
            </div>

            {domainLoading && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground animate-pulse">Scanning {domainChecked} pages…</p>
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            )}

            {domainError && !domainLoading && (
              <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 flex gap-3">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">{domainError}</p>
              </div>
            )}

            {/* Email patterns */}
            {domainPatterns.length > 0 && !domainLoading && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Mail className="w-4 h-4 text-primary" />
                  Detected email patterns
                </div>
                <div className="space-y-1.5">
                  {domainPatterns.map((p) => (
                    <div key={p} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                      <code className="text-xs text-primary font-mono">{p}</code>
                      <button onClick={() => copyPattern(p)} className="text-muted-foreground hover:text-foreground transition-colors">
                        {copiedPattern === p ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {domainResults.length > 0 && !domainLoading && (
              <ResultsPanel
                leads={domainResults}
                selected={domainSelected}
                onToggle={(e) => toggle(domainSelected, setDomainSelected, e)}
                onSelectAll={() => setDomainSelected(new Set(domainResults.map((l) => l.email)))}
                onClearAll={() => setDomainSelected(new Set())}
                onImport={() => importLeads(domainResults, domainSelected)}
                importing={importing}
                subtitle={`Checked ${domainChecked} pages on ${domainInput}`}
              />
            )}

            {/* Examples */}
            {!domainResults.length && !domainLoading && !domainError && (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground font-medium mb-3">Try these examples:</p>
                <div className="flex flex-wrap gap-2">
                  {["stripe.com","notion.so","linear.app","vercel.com","github.com"].map((d) => (
                    <button key={d} onClick={() => setDomainInput(d)} className="text-xs bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-lg transition-colors font-mono">
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── URL Scraper tab ─── */}
        {tab === "url" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Page URL to scrape</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://company.com/team"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && scrapeUrl()}
                    className="bg-background border-border font-mono text-sm"
                  />
                  <Button onClick={scrapeUrl} disabled={urlLoading || !urlInput.trim()} className="bg-primary text-white gap-1.5 flex-shrink-0">
                    {urlLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Globe className="w-4 h-4" />}
                    {urlLoading ? "Scraping…" : "Scrape"}
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Best for: team pages, directories, speaker lists, GitHub org pages. Works on any static page with visible email addresses.</span>
              </div>
            </div>

            {urlLoading && <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}

            {urlError && !urlLoading && (
              <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 flex gap-3">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">{urlError}</p>
              </div>
            )}

            {urlResults.length > 0 && !urlLoading && (
              <ResultsPanel
                leads={urlResults}
                selected={urlSelected}
                onToggle={(e) => toggle(urlSelected, setUrlSelected, e)}
                onSelectAll={() => setUrlSelected(new Set(urlResults.map((l) => l.email)))}
                onClearAll={() => setUrlSelected(new Set())}
                onImport={() => importLeads(urlResults, urlSelected)}
                importing={importing}
                subtitle={urlTitle}
              />
            )}
          </div>
        )}

        {/* ─── Web Search tab ─── */}
        {tab === "search" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Describe the leads you want</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="fintech startup founders London"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchWeb()}
                    className="bg-background border-border text-sm"
                  />
                  <Button onClick={searchWeb} disabled={searchLoading || !searchQuery.trim()} className="bg-primary text-white gap-1.5 flex-shrink-0">
                    {searchLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Search className="w-4 h-4" />}
                    {searchLoading ? "Searching…" : "Search"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Searches Bing, finds contact pages, and extracts leads. Takes 15–25 seconds.
                </p>
              </div>
            </div>

            {searchLoading && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground animate-pulse">Searching the web and scanning pages…</p>
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            )}

            {searchError && !searchLoading && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 flex gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">{searchError}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1.5">
                    <strong className="text-foreground">Tip:</strong> Use <button onClick={() => setTab("domain")} className="text-primary hover:underline">Company Domain</button> to target specific companies, or <button onClick={() => setTab("url")} className="text-primary hover:underline">Scrape URL</button> to extract from a specific page.
                  </p>
                </div>
              </div>
            )}

            {searchResults.length > 0 && !searchLoading && (
              <ResultsPanel
                leads={searchResults}
                selected={searchSelected}
                onToggle={(e) => toggle(searchSelected, setSearchSelected, e)}
                onSelectAll={() => setSearchSelected(new Set(searchResults.map((l) => l.email)))}
                onClearAll={() => setSearchSelected(new Set())}
                onImport={() => importLeads(searchResults, searchSelected)}
                importing={importing}
                subtitle={`Scraped from ${pagesScraped} pages`}
              />
            )}

            {!searchResults.length && !searchLoading && !searchError && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <p className="text-xs text-muted-foreground font-medium">Example queries:</p>
                <div className="space-y-1.5">
                  {["SaaS startup CTOs New York","venture capital partners San Francisco","AI startup founders Europe","e-commerce founders Australia","open source Python maintainers"].map((ex) => (
                    <button key={ex} onClick={() => setSearchQuery(ex)} className="flex items-center gap-2 w-full text-xs text-muted-foreground hover:text-foreground py-1 transition-colors group">
                      <ChevronRight className="w-3 h-3 group-hover:text-primary" /> {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

  );
}
