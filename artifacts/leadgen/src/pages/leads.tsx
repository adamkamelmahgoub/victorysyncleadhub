import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Trash2, ExternalLink, Upload, Users, Building2, Mail, Phone, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { asArray } from "@/lib/data-shape";

type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  source?: string | null;
  status: string;
  score: number;
  campaignName?: string | null;
  createdAt?: string;
};

type LeadsResponse = {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
};

const STATUS_COLORS: Record<string, string> = {
  new: "hsl(199 89% 48%)",
  contacted: "hsl(262 83% 58%)",
  qualified: "hsl(38 92% 50%)",
  proposal: "hsl(221 83% 53%)",
  converted: "hsl(142 71% 45%)",
  lost: "hsl(0 72% 51%)",
};

const STATUSES = ["new", "contacted", "qualified", "proposal", "converted", "lost"];
const PAGE_SIZE = 50;

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "hsl(142 71% 45%)" : score >= 40 ? "hsl(38 92% 50%)" : "hsl(215 16% 47%)";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(score, 100)}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{score}</span>
    </div>
  );
}

function sourceLabel(source?: string | null) {
  if (!source) return "Not set";
  return source.replace(/_/g, " ");
}

export default function Leads() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "", title: "", source: "" });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const queryKey = ["contacts", page, debouncedSearch, statusFilter];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      return apiFetch(`/api/leads?${params}`) as Promise<LeadsResponse>;
    },
  });

  const leads = asArray<Lead>(data?.leads);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const stats = useMemo(() => {
    const companies = new Set(leads.map((lead) => lead.company).filter(Boolean));
    return {
      visible: leads.length,
      companies: companies.size,
      withEmail: leads.filter((lead) => lead.email).length,
      withPhone: leads.filter((lead) => lead.phone).length,
    };
  }, [leads]);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["contacts"] });
  }

  async function handleCreate() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      toast({ title: "First name, last name, and email are required", variant: "destructive" });
      return;
    }
    await apiFetch("/api/leads", { method: "POST", body: JSON.stringify(form) });
    setShowCreate(false);
    setForm({ firstName: "", lastName: "", email: "", phone: "", company: "", title: "", source: "" });
    toast({ title: "Contact created" });
    refresh();
  }

  async function handleDelete(id: string) {
    await apiFetch(`/api/leads/${id}`, { method: "DELETE" });
    toast({ title: "Contact deleted" });
    refresh();
  }

  async function handleImport() {
    const lines = importText.trim().split("\n").filter(Boolean);
    if (lines.length < 2) {
      toast({ title: "Paste a header row and at least one contact", variant: "destructive" });
      return;
    }
    const headers = lines[0].split(",").map((header) => header.trim());
    const leadsToImport = lines.slice(1).map((line) => {
      const values = line.split(",").map((value) => value.trim());
      const row: Record<string, string> = {};
      headers.forEach((header, index) => { row[header] = values[index] ?? ""; });
      return row;
    }).filter((row) => row.email);
    if (leadsToImport.length === 0) {
      toast({ title: "No valid contacts found", variant: "destructive" });
      return;
    }
    await apiFetch("/api/leads/import", { method: "POST", body: JSON.stringify({ leads: leadsToImport }) });
    setShowImport(false);
    setImportText("");
    toast({ title: `${leadsToImport.length} contacts imported` });
    refresh();
  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage people, companies, activity, source, and pipeline context.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-1.5">
              <Upload className="w-4 h-4" /> Import
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Contact
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total contacts", value: total.toLocaleString(), icon: Users },
            { label: "This page", value: stats.visible.toLocaleString(), icon: Users },
            { label: "Companies", value: stats.companies.toLocaleString(), icon: Building2 },
            { label: "Email coverage", value: `${stats.visible ? Math.round((stats.withEmail / stats.visible) * 100) : 0}%`, icon: Mail },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="p-4 border border-border bg-card">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{label}</span>
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold mt-2">{value}</div>
            </Card>
          ))}
        </div>

        <Card className="border border-border bg-card">
          <div className="p-4 border-b border-border flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts, email, company..."
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((status) => <SelectItem key={status} value={status} className="capitalize">{status}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Company</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Source</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && [...Array(8)].map((_, index) => (
                  <tr key={index}>
                    <td className="px-5 py-3"><Skeleton className="h-10 w-56" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"></td>
                  </tr>
                ))}
                {!isLoading && leads.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-14 text-muted-foreground text-sm">No contacts found</td>
                  </tr>
                )}
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/leads/${lead.id}`} className="flex items-center gap-3 group">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {(lead.firstName[0] ?? "").toUpperCase()}{(lead.lastName[0] ?? "").toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground group-hover:text-primary">{lead.firstName} {lead.lastName}</p>
                          <p className="text-xs text-muted-foreground">{lead.email}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-foreground">{lead.company || "Not set"}</div>
                      <div className="text-xs text-muted-foreground">{lead.title || ""}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {lead.phone ? <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span> : "Not set"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs capitalize" style={{ borderColor: `${STATUS_COLORS[lead.status] ?? "hsl(215 16% 47%)"}60`, color: STATUS_COLORS[lead.status] ?? "hsl(215 16% 47%)" }}>
                        {lead.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3"><ScoreBadge score={lead.score} /></td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{sourceLabel(lead.source)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/leads/${lead.id}`}>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(lead.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-border flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              Showing {from}-{to} of {total.toLocaleString()} contacts
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="w-4 h-4 mr-1" /> Previous
              </Button>
              <span className="text-xs text-muted-foreground px-2">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add contact</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">First name *</Label>
              <Input className="mt-1" value={form.firstName} onChange={(event) => setForm((f) => ({ ...f, firstName: event.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Last name *</Label>
              <Input className="mt-1" value={form.lastName} onChange={(event) => setForm((f) => ({ ...f, lastName: event.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Email *</Label>
              <Input className="mt-1" type="email" value={form.email} onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <Input className="mt-1" value={form.phone} onChange={(event) => setForm((f) => ({ ...f, phone: event.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Company</Label>
              <Input className="mt-1" value={form.company} onChange={(event) => setForm((f) => ({ ...f, company: event.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input className="mt-1" value={form.title} onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Source</Label>
              <Input className="mt-1" placeholder="Website, LinkedIn, referral..." value={form.source} onChange={(event) => setForm((f) => ({ ...f, source: event.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create contact</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Import contacts via CSV</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">Paste CSV data with columns: firstName, lastName, email, phone, company, title, source</p>
            <Textarea
              className="font-mono text-xs h-48"
              placeholder={`firstName,lastName,email,phone,company,title,source\nJane,Doe,jane@example.com,+1-555-0101,Acme Inc,CEO,LinkedIn`}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowImport(false)}>Cancel</Button>
            <Button onClick={handleImport}>Import contacts</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
