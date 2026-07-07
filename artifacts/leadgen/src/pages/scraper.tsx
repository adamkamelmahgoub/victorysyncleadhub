import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateLead, getListLeadsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Globe, Search, Download, Zap, AlertTriangle, CheckCircle2, Info } from "lucide-react";

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

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

const CONF_STYLES: Record<string, { label: string; color: string }> = {
  high: { label: "High", color: "hsl(140 70% 50%)" },
  medium: { label: "Medium", color: "hsl(40 90% 60%)" },
  low: { label: "Low", color: "hsl(215 20% 65%)" },
};

function LeadCard({
  lead,
  selected,
  onToggle,
}: {
  lead: ScrapedLead;
  selected: boolean;
  onToggle: () => void;
}) {
  const conf = CONF_STYLES[lead.confidence];
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
        selected ? "border-primary/60 bg-primary/5" : "border-border bg-muted/20 hover:bg-muted/30"
      }`}
      onClick={onToggle}
    >
      <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">
            {lead.firstName} {lead.lastName}
          </span>
          {lead.title && (
            <span className="text-xs text-muted-foreground truncate max-w-xs">{lead.title}</span>
          )}
          <Badge
            variant="outline"
            className="text-xs ml-auto flex-shrink-0"
            style={{ borderColor: conf.color + "60", color: conf.color }}
          >
            {conf.label}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-xs text-primary">{lead.email}</span>
          {lead.phone && <span className="text-xs text-muted-foreground">{lead.phone}</span>}
          {lead.company && <span className="text-xs text-muted-foreground">{lead.company}</span>}
        </div>
      </div>
    </div>
  );
}

export default function Scraper() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createLead = useCreateLead();

  // URL scraper state
  const [urlInput, setUrlInput] = useState("");
  const [urlResults, setUrlResults] = useState<ScrapedLead[]>([]);
  const [urlPageTitle, setUrlPageTitle] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [urlSelected, setUrlSelected] = useState<Set<string>>(new Set());

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ScrapedLead[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchSelected, setSearchSelected] = useState<Set<string>>(new Set());
  const [pagesScraped, setPagesScraped] = useState(0);

  // Import state
  const [importing, setImporting] = useState(false);

  async function scrapeUrl() {
    if (!urlInput.trim()) return;
    setUrlLoading(true);
    setUrlError("");
    setUrlResults([]);
    setUrlSelected(new Set());
    try {
      const res = await fetch(`${BASE}/api/scraper/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scraping failed");
      setUrlResults(data.leads ?? []);
      setUrlPageTitle(data.pageTitle ?? urlInput);
      if ((data.leads ?? []).length === 0) {
        setUrlError("No leads found on this page. Try a team page, contact page, or directory.");
      }
    } catch (err) {
      setUrlError(String(err instanceof Error ? err.message : err));
    } finally {
      setUrlLoading(false);
    }
  }

  async function searchWeb() {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchError("");
    setSearchResults([]);
    setSearchSelected(new Set());
    setPagesScraped(0);
    try {
      const res = await fetch(`${BASE}/api/scraper/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed");
      setSearchResults(data.leads ?? []);
      setPagesScraped(data.pagesScraped ?? 0);
      if ((data.leads ?? []).length === 0) {
        setSearchError("No leads found. Try a more specific query like 'Acme Inc San Francisco CEO'.");
      }
    } catch (err) {
      setSearchError(String(err instanceof Error ? err.message : err));
    } finally {
      setSearchLoading(false);
    }
  }

  async function importLeads(leads: ScrapedLead[], selected: Set<string>) {
    const toImport = leads.filter((l) => selected.has(l.email));
    if (toImport.length === 0) {
      toast({ title: "Select at least one lead to import", variant: "destructive" });
      return;
    }
    setImporting(true);
    let success = 0;
    let failed = 0;
    for (const l of toImport) {
      await new Promise<void>((resolve) => {
        createLead.mutate(
          {
            data: {
              firstName: l.firstName,
              lastName: l.lastName,
              email: l.email,
              phone: l.phone ?? undefined,
              company: l.company ?? undefined,
              title: l.title ?? undefined,
              source: "web_scrape",
            },
          },
          {
            onSuccess: () => { success++; resolve(); },
            onError: () => { failed++; resolve(); },
          }
        );
      });
    }
    queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
    setImporting(false);
    toast({
      title: `Imported ${success} lead${success !== 1 ? "s" : ""}${failed ? ` (${failed} failed)` : ""}`,
    });
  }

  function toggleUrl(email: string) {
    setUrlSelected((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  }

  function toggleSearch(email: string) {
    setSearchSelected((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  }

  function selectAll(leads: ScrapedLead[], setter: (s: Set<string>) => void) {
    setter(new Set(leads.map((l) => l.email)));
  }

  function clearAll(setter: (s: Set<string>) => void) {
    setter(new Set());
  }

  return (
    <Layout>
      <div className="space-y-5 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Find Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Scrape contact info from any webpage or search the web for leads
          </p>
        </div>

        {/* Tips banner */}
        <Card className="p-4 border border-border bg-card flex gap-3">
          <Info className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <span className="text-foreground font-medium">Best sources:</span> Company team
              pages, contact directories, speaker lists, GitHub organization pages, and industry
              listings. Email addresses and names are extracted automatically.
            </p>
            <p className="text-muted-foreground/70">
              Note: JavaScript-heavy pages (LinkedIn, most social networks) won't return results
              — use their CSV export features instead and import via the Leads page.
            </p>
          </div>
        </Card>

        <Tabs defaultValue="url">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="url" className="gap-1.5">
              <Globe className="w-4 h-4" /> Scrape URL
            </TabsTrigger>
            <TabsTrigger value="search" className="gap-1.5">
              <Search className="w-4 h-4" /> Web Search
            </TabsTrigger>
          </TabsList>

          {/* ─── URL Scraper ─── */}
          <TabsContent value="url" className="space-y-4 mt-4">
            <Card className="p-5 border border-border bg-card">
              <Label className="text-xs text-muted-foreground mb-2 block">
                Paste a URL (contact page, team page, directory, about page…)
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://company.com/team"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && scrapeUrl()}
                  className="font-mono text-sm"
                />
                <Button
                  onClick={scrapeUrl}
                  disabled={urlLoading || !urlInput.trim()}
                  className="flex-shrink-0 gap-1.5"
                >
                  {urlLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Scraping...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" /> Scrape
                    </>
                  )}
                </Button>
              </div>
            </Card>

            {urlLoading && (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            )}

            {urlError && !urlLoading && (
              <Card className="p-4 border border-destructive/30 bg-card flex gap-3">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">{urlError}</p>
              </Card>
            )}

            {urlResults.length > 0 && !urlLoading && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {urlResults.length} lead{urlResults.length !== 1 ? "s" : ""} found
                    </p>
                    <p className="text-xs text-muted-foreground truncate max-w-xs">{urlPageTitle}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => selectAll(urlResults, setUrlSelected)}
                    >
                      Select all
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => clearAll(setUrlSelected)}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {urlResults.map((lead) => (
                    <LeadCard
                      key={lead.email}
                      lead={lead}
                      selected={urlSelected.has(lead.email)}
                      onToggle={() => toggleUrl(lead.email)}
                    />
                  ))}
                </div>

                <Button
                  className="w-full gap-1.5"
                  disabled={urlSelected.size === 0 || importing}
                  onClick={() => importLeads(urlResults, urlSelected)}
                >
                  {importing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Import {urlSelected.size > 0 ? `${urlSelected.size} selected` : "selected"}
                    </>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ─── Web Search ─── */}
          <TabsContent value="search" className="space-y-4 mt-4">
            <Card className="p-5 border border-border bg-card">
              <Label className="text-xs text-muted-foreground mb-2 block">
                Describe the leads you want (company, role, location, industry…)
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. fintech startup founders London"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchWeb()}
                />
                <Button
                  onClick={searchWeb}
                  disabled={searchLoading || !searchQuery.trim()}
                  className="flex-shrink-0 gap-1.5"
                >
                  {searchLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" /> Search
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Searches the web, finds contact pages, and extracts leads automatically.
              </p>
            </Card>

            {searchLoading && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground animate-pulse px-1">
                  Searching and scraping pages — this takes 10–20 seconds...
                </p>
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            )}

            {searchError && !searchLoading && (
              <Card className="p-4 border border-destructive/30 bg-card flex gap-3">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-muted-foreground">{searchError}</p>
              </Card>
            )}

            {searchResults.length > 0 && !searchLoading && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {searchResults.length} lead{searchResults.length !== 1 ? "s" : ""} found
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Scraped from {pagesScraped} page{pagesScraped !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => selectAll(searchResults, setSearchSelected)}
                    >
                      Select all
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => clearAll(setSearchSelected)}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {searchResults.map((lead) => (
                    <LeadCard
                      key={lead.email}
                      lead={lead}
                      selected={searchSelected.has(lead.email)}
                      onToggle={() => toggleSearch(lead.email)}
                    />
                  ))}
                </div>

                <Button
                  className="w-full gap-1.5"
                  disabled={searchSelected.size === 0 || importing}
                  onClick={() => importLeads(searchResults, searchSelected)}
                >
                  {importing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Import {searchSelected.size > 0 ? `${searchSelected.size} selected` : "selected"}
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Examples */}
            {searchResults.length === 0 && !searchLoading && !searchError && (
              <Card className="p-4 border border-border bg-card">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Example queries
                </p>
                <div className="space-y-2">
                  {[
                    "SaaS startup CTOs New York",
                    "open source project maintainers Python",
                    "venture capital partners San Francisco",
                    "e-commerce founders Australia",
                    "AI startup founders Europe 2024",
                  ].map((ex) => (
                    <button
                      key={ex}
                      className="block text-xs text-primary hover:underline text-left"
                      onClick={() => setSearchQuery(ex)}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
