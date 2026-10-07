import { PageTitle, PageDescription } from "@/components/page-layout";
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
import { Search, Plus, Trash2, ExternalLink, Upload, Users, Building2, Mail, Phone, ChevronLeft, ChevronRight, ScanSearch, FolderPlus } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { asArray } from "@/lib/data-shape";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkEnrichmentPanel } from "@/components/bulk-enrichment-panel";

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
  disposition?: string | null;
  contactAttempts: number;
  customFields?: Record<string, unknown>;
};

type LeadsResponse = {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
};

type DuplicateScan = {
  groupCount: number;
  duplicateCount: number;
  groups: Array<{
    keep: Lead;
    duplicates: Lead[];
    matchedBy: string[];
  }>;
};

type ContactGroup = {
  id: string | number;
  name: string;
  description?: string | null;
  contactCount: number;
  filters?: {
    clientAccountId?: string | null;
    agentId?: string | null;
    agentName?: string | null;
  };
};

type AssignmentOption = { id: string; name: string; email?: string; role?: string };

const STATUS_COLORS: Record<string, string> = {
  new: "hsl(199 89% 48%)",
  contacted: "hsl(262 83% 58%)",
  qualified: "hsl(38 92% 50%)",
  meeting_booked: "hsl(142 71% 45%)",
  proposal: "hsl(221 83% 53%)",
  converted: "hsl(142 71% 45%)",
  lost: "hsl(0 72% 51%)",
};

const STATUSES = ["new", "contacted", "qualified", "meeting_booked", "proposal", "converted", "lost"];
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
  const [tagFilter, setTagFilter] = useState("all");
  const [showBulkEnrich, setShowBulkEnrich] = useState(false);
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDispositions, setShowDispositions] = useState(false);
  const [newDisposition, setNewDisposition] = useState("");
  const [duplicateScan, setDuplicateScan] = useState<DuplicateScan | null>(null);
  const [scanningDuplicates, setScanningDuplicates] = useState(false);
  const [removingDuplicates, setRemovingDuplicates] = useState(false);
  const [showGroupAssignment, setShowGroupAssignment] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupForm, setGroupForm] = useState({ groupId: "", name: "", description: "", clientAccountId: "", agentId: "" });
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "", title: "", source: "" });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { role } = useAuth();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const queryKey = ["contacts", page, debouncedSearch, statusFilter, tagFilter];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (tagFilter !== "all") params.set("tag", tagFilter);
      return apiFetch(`/api/leads?${params}`) as Promise<LeadsResponse>;
    },
  });
  const { data: dispositionsResponse = [] } = useQuery<{ id: string; name: string; color: string }[]>({
    queryKey: ["dispositions"],
    queryFn: () => apiFetch("/dispositions"),
    enabled: role !== "client",
  });
  const dispositions = asArray<{ id: string; name: string; color: string }>(dispositionsResponse);
  const { data: contactGroupsResponse = [] } = useQuery<ContactGroup[]>({
    queryKey: ["contact-groups"],
    queryFn: () => apiFetch("/api/contact-groups"),
    enabled: role !== "client",
  });
  const { data: clientAccountsResponse = [] } = useQuery<AssignmentOption[]>({
    queryKey: ["sub-accounts"],
    queryFn: () => apiFetch("/sub-accounts"),
    enabled: role !== "client",
  });
  const { data: teamResponse = [] } = useQuery<AssignmentOption[]>({
    queryKey: ["team"],
    queryFn: () => apiFetch("/team"),
    enabled: role !== "client",
  });
  const contactGroups = asArray<ContactGroup>(contactGroupsResponse);
  const clientAccounts = asArray<AssignmentOption>(clientAccountsResponse);
  const agents = asArray<AssignmentOption>(teamResponse).filter((member) => member.role === "agent" || member.role === "member");

  const leads = asArray<Lead>(data?.leads);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const allSelected = leads.length > 0 && leads.every((lead) => selected.has(lead.id));
  const customFieldNames = useMemo(
    () => Array.from(new Set(
      leads.flatMap((lead) => Object.keys(lead.customFields ?? {}))
        .filter((name) => !["contact_group_ids", "assigned_agent_id"].includes(name)),
    )),
    [leads],
  );

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

  async function deleteSelected() {
    await apiFetch("/api/leads", { method: "DELETE", body: JSON.stringify({ ids: [...selected] }) });
    setSelected(new Set());
    toast({ title: "Selected contacts deleted" });
    await refresh();
  }

  async function scanDuplicates() {
    setScanningDuplicates(true);
    try {
      const result = await apiFetch("/api/leads/duplicates") as DuplicateScan;
      setDuplicateScan(result);
      if (result.duplicateCount === 0) toast({ title: "No duplicate contacts found" });
    } catch (error) {
      toast({ title: "Duplicate scan failed", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setScanningDuplicates(false);
    }
  }

  async function removeDuplicates() {
    setRemovingDuplicates(true);
    try {
      const result = await apiFetch("/api/leads/duplicates", {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      }) as { deleted: number };
      setDuplicateScan(null);
      setSelected(new Set());
      await refresh();
      toast({ title: `${result.deleted} duplicate contact${result.deleted === 1 ? "" : "s"} removed` });
    } catch (error) {
      toast({ title: "Duplicate removal failed", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setRemovingDuplicates(false);
    }
  }

  async function saveGroupAssignment() {
    if (!groupForm.groupId && !groupForm.name.trim()) {
      toast({ title: "Enter a group name or select an existing group", variant: "destructive" });
      return;
    }
    const agent = agents.find((member) => String(member.id) === groupForm.agentId);
    const client = clientAccounts.find((account) => String(account.id) === groupForm.clientAccountId);
    setSavingGroup(true);
    try {
      await apiFetch("/api/contact-groups", {
        method: "POST",
        body: JSON.stringify({
          groupId: groupForm.groupId || undefined,
          name: groupForm.name.trim() || undefined,
          description: groupForm.description.trim() || undefined,
          leadIds: [...selected],
          clientAccountId: groupForm.clientAccountId || null,
          clientName: client?.name ?? null,
          agentId: groupForm.agentId || null,
          agentName: agent?.name ?? null,
        }),
      });
      const assignedCount = selected.size;
      setShowGroupAssignment(false);
      setGroupForm({ groupId: "", name: "", description: "", clientAccountId: "", agentId: "" });
      setSelected(new Set());
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["contact-groups"] }),
      ]);
      toast({ title: `${assignedCount} contact${assignedCount === 1 ? "" : "s"} assigned to group` });
    } catch (error) {
      toast({ title: "Group assignment failed", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      setSavingGroup(false);
    }
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
      <div className="page-stack ">
        <div className="flex flex-wrap items-center justify-between gap-3 flex-wrap gap-4 min-w-0">
          <div>
            <PageTitle>Contacts</PageTitle>
            <PageDescription>Manage people, companies, activity, source, and pipeline context.</PageDescription>
          </div>
          <div className="flex gap-2">
            {import.meta.env.VITE_ENRICHMENT_ENABLED === "true" && (role === "owner" || role === "admin") && <Button variant="outline" size="sm" onClick={() => setShowBulkEnrich(true)}>Enrich all</Button>}
            {role !== "client" && <><Button variant="outline" size="sm" onClick={() => void scanDuplicates()} disabled={scanningDuplicates} className="gap-1.5">
              <ScanSearch className="w-4 h-4" /> {scanningDuplicates ? "Scanning..." : "Find Duplicates"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-1.5">
              <Upload className="w-4 h-4" /> Import
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Contact
            </Button></>}
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
            <Select value={tagFilter} onValueChange={(value) => { setTagFilter(value); setPage(1); }}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Any tag" /></SelectTrigger>
              <SelectContent><SelectItem value="all">Any tag</SelectItem>{["top3-prospect", "region-tristate", "top3-fit", "top3-reviews-first", "top3-already", "review-leadgen", "franchise", "enrich-not-found"].map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((status) => <SelectItem key={status} value={status} className="capitalize">{status === "meeting_booked" ? "Meeting Booked" : status}</SelectItem>)}
              </SelectContent>
            </Select>
            {role !== "client" && <><Button variant="outline" onClick={() => setSelected(allSelected ? new Set() : new Set(leads.map((lead) => lead.id)))}>
              {allSelected ? "Clear all" : `Select all (${leads.length})`}
            </Button>
            {selected.size > 0 && (
              <Button variant="outline" onClick={() => setShowGroupAssignment(true)} className="gap-1.5">
                <FolderPlus className="h-4 w-4" /> Group & Assign ({selected.size})
              </Button>
            )}
            {selected.size > 0 && <Button variant="destructive" onClick={() => void deleteSelected()}>Delete {selected.size}</Button>}
            <Button variant="outline" onClick={() => setShowDispositions(true)}>Dispositions</Button></>}
          </div>

          <div className="overflow-x-auto">
            <table className="workspace-table w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3">{role !== "client" && <Checkbox checked={allSelected} onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(leads.map((lead) => lead.id)))} aria-label="Select all contacts" />}</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Company</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Disposition</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contacted</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Source</th>
                  {customFieldNames.map((name) => (
                    <th key={name} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{name.replace(/_/g, " ")}</th>
                  ))}
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && [...Array(8)].map((_, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-4" /></td>
                    <td className="px-5 py-3"><Skeleton className="h-10 w-56" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"></td>
                  </tr>
                ))}
                {!isLoading && leads.length === 0 && (
                  <tr>
                    <td colSpan={10 + customFieldNames.length} className="text-center py-14 text-muted-foreground text-sm">No contacts found</td>
                  </tr>
                )}
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">{role !== "client" && <Checkbox checked={selected.has(lead.id)} onCheckedChange={() => setSelected((current) => { const next = new Set(current); next.has(lead.id) ? next.delete(lead.id) : next.add(lead.id); return next; })} aria-label={`Select ${lead.firstName} ${lead.lastName}`} />}</td>
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
                        {lead.status === "meeting_booked" ? "Meeting Booked" : lead.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.disposition || "Not set"}</td>
                    <td className="px-4 py-3 text-center font-medium">{lead.contactAttempts ?? 0}</td>
                    <td className="px-4 py-3"><ScoreBadge score={lead.score} /></td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{sourceLabel(lead.source)}</td>
                    {customFieldNames.map((name) => {
                      const value = lead.customFields?.[name];
                      return <td key={name} className="px-4 py-3 text-muted-foreground whitespace-nowrap">{value === null || value === undefined || value === "" ? "Not set" : String(value)}</td>;
                    })}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/leads/${lead.id}`}>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-foreground">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                        {role !== "client" && <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(lead.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>}
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

      <Dialog open={showDispositions} onOpenChange={setShowDispositions}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Custom dispositions</DialogTitle></DialogHeader>
          <div className="flex flex-wrap gap-2">{dispositions.map((item) => <Badge key={item.id} variant="outline" style={{ borderColor: item.color, color: item.color }}>{item.name}</Badge>)}</div>
          <div className="flex gap-2">
            <Input value={newDisposition} onChange={(event) => setNewDisposition(event.target.value)} placeholder="Appointment booked" />
            <Button onClick={async () => {
              if (!newDisposition.trim()) return;
              await apiFetch("/dispositions", { method: "POST", body: JSON.stringify({ name: newDisposition.trim(), color: "#f97316" }) });
              setNewDisposition("");
              await queryClient.invalidateQueries({ queryKey: ["dispositions"] });
            }}>Add</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateScan !== null} onOpenChange={(open) => { if (!open && !removingDuplicates) setDuplicateScan(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Duplicate contact scan</DialogTitle></DialogHeader>
          {duplicateScan && (
            <div className="space-y-4">
              <div className={`rounded-lg border p-4 ${duplicateScan.duplicateCount ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`}>
                <p className="font-semibold">
                  {duplicateScan.duplicateCount
                    ? `${duplicateScan.duplicateCount} duplicate contact${duplicateScan.duplicateCount === 1 ? "" : "s"} found in ${duplicateScan.groupCount} group${duplicateScan.groupCount === 1 ? "" : "s"}.`
                    : "No duplicate contacts found."}
                </p>
                {duplicateScan.duplicateCount > 0 && <p className="mt-1 text-sm text-muted-foreground">The oldest contact in each group will be kept. Newer records with the same normalized email or phone number will be removed.</p>}
              </div>
              {duplicateScan.groups.length > 0 && (
                <div className="max-h-80 space-y-2 overflow-y-auto">
                  {duplicateScan.groups.map((group, index) => (
                    <div key={`${group.keep.id}-${index}`} className="rounded-lg border border-border p-3 text-sm">
                      <div className="font-medium">{group.keep.firstName} {group.keep.lastName}</div>
                      <div className="text-xs text-muted-foreground">{group.keep.email || group.keep.phone || "No contact detail"} · keep this record</div>
                      <div className="mt-2 text-xs text-amber-700">
                        Remove {group.duplicates.length} duplicate{group.duplicates.length === 1 ? "" : "s"} · matched by {group.matchedBy.join(" and ") || "email or phone"}
                      </div>
                    </div>
                  ))}
                  {duplicateScan.groupCount > duplicateScan.groups.length && <p className="text-xs text-muted-foreground">Showing the first {duplicateScan.groups.length} groups.</p>}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDuplicateScan(null)} disabled={removingDuplicates}>Close</Button>
                {duplicateScan.duplicateCount > 0 && (
                  <Button variant="destructive" onClick={() => void removeDuplicates()} disabled={removingDuplicates}>
                    <Trash2 className="mr-1.5 h-4 w-4" /> {removingDuplicates ? "Removing..." : `Remove ${duplicateScan.duplicateCount} Duplicates`}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showGroupAssignment} onOpenChange={(open) => { if (!savingGroup) setShowGroupAssignment(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Group and assign contacts</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{selected.size} selected contact{selected.size === 1 ? "" : "s"} will be added to this group.</p>
            <div>
              <Label className="text-xs text-muted-foreground">Existing group</Label>
              <Select value={groupForm.groupId || "new"} onValueChange={(value) => setGroupForm((form) => ({ ...form, groupId: value === "new" ? "" : value }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Create a new group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Create a new group</SelectItem>
                  {contactGroups.map((group) => <SelectItem key={group.id} value={String(group.id)}>{group.name} ({group.contactCount ?? 0})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!groupForm.groupId && (
              <>
                <div>
                  <Label className="text-xs text-muted-foreground">Group name *</Label>
                  <Input className="mt-1" value={groupForm.name} onChange={(event) => setGroupForm((form) => ({ ...form, name: event.target.value }))} placeholder="July insurance leads" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <Input className="mt-1" value={groupForm.description} onChange={(event) => setGroupForm((form) => ({ ...form, description: event.target.value }))} placeholder="Optional notes about this group" />
                </div>
              </>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Assign to client</Label>
                <Select value={groupForm.clientAccountId || "none"} onValueChange={(value) => setGroupForm((form) => ({ ...form, clientAccountId: value === "none" ? "" : value }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="No client" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No client</SelectItem>
                    {clientAccounts.map((client) => <SelectItem key={client.id} value={String(client.id)}>{client.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Assign to agent</Label>
                <Select value={groupForm.agentId || "none"} onValueChange={(value) => setGroupForm((form) => ({ ...form, agentId: value === "none" ? "" : value }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="No agent" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No agent</SelectItem>
                    {agents.map((agent) => <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}{agent.email ? ` · ${agent.email}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowGroupAssignment(false)} disabled={savingGroup}>Cancel</Button>
              <Button onClick={() => void saveGroupAssignment()} disabled={savingGroup || (!groupForm.groupId && !groupForm.name.trim())}>
                {savingGroup ? "Assigning..." : "Save Group Assignment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add contact</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
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

      {showBulkEnrich && <BulkEnrichmentPanel initialTags={tagFilter === "all" ? "" : tagFilter} onClose={() => setShowBulkEnrich(false)} />}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Import contacts via CSV</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">Paste CSV data with columns: firstName, lastName, email, phone, company, title, source</p>
            <Textarea
              className="font-mono text-xs h-48"
              placeholder="firstName,lastName,email,phone,company,title,source"
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
