import { PageTitle, PageDescription } from "@/components/page-layout";
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Trash2, Upload, Users, Building2, Mail, ChevronLeft, ChevronRight, ScanSearch, FolderPlus } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { asArray } from "@/lib/data-shape";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkEnrichmentPanel } from "@/components/bulk-enrichment-panel";
import { ContactGrid } from "@/components/contact-grid";
import { ContactBulkActions } from "@/components/contact-bulk-actions";
import { clearApiCache } from "@/lib/api-cache";

type Lead = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
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
  tags?: string[] | null;
  state?: string | null;
  lastActivityAt?: string | null;
  socials?: Record<string,string|null>;
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

const STATUSES = ["new", "contacted", "qualified", "meeting_booked", "proposal", "converted", "lost"];
const PAGE_SIZE = 50;

export default function Leads() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [debouncedSource, setDebouncedSource] = useState("");
  const [debouncedState, setDebouncedState] = useState("");
  const [sort, setSort] = useState("created_at");
  const [direction, setDirection] = useState("desc");
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [activeViewId, setActiveViewId] = useState("");
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSource(sourceFilter);
      setDebouncedState(stateFilter);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [sourceFilter, stateFilter]);

  const queryKey = ["contacts", page, debouncedSearch, statusFilter, tagFilter, debouncedSource, debouncedState, sort, direction];
  const { data, isLoading, isFetching, error: contactsError } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), includeActivity: "false", includeSocials: "true" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (tagFilter !== "all") params.set("tag", tagFilter);
      if (debouncedSource.trim()) params.set("source", debouncedSource.trim());
      if (debouncedState.trim()) params.set("state", debouncedState.trim());
      params.set("sort", sort);
      params.set("direction", direction);
      return apiFetch(`/api/leads?${params}`) as Promise<LeadsResponse>;
    },
    placeholderData: keepPreviousData,
    staleTime: 2 * 60_000,
    refetchOnWindowFocus: false,
  });
  const activityIds = data?.leads.map((lead) => lead.id).join(",") ?? "";
  const { data: activityResponse = [] } = useQuery<Array<{leadId:string;lastActivityAt:string}>>({
    queryKey: ["contact-last-activity", activityIds],
    queryFn: () => apiFetch("/api/contacts/last-activity", { method: "POST", body: JSON.stringify({ ids: activityIds.split(",").filter(Boolean) }) }),
    enabled: !!activityIds,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const { data: savedViewsResponse = [] } = useQuery<Array<{id:string;name:string;filters:Record<string,unknown>}>>({
    queryKey: ["contact-views"], queryFn: () => apiFetch("/api/contact-views"), enabled: role !== "client",
  });
  const savedViews = asArray<{id:string;name:string;filters:Record<string,unknown>}>(savedViewsResponse);
  const { data: dispositionsResponse = [] } = useQuery<{ id: string; name: string; color: string }[]>({
    queryKey: ["dispositions"],
    queryFn: () => apiFetch("/dispositions"),
    enabled: role !== "client" && showDispositions,
  });
  const dispositions = asArray<{ id: string; name: string; color: string }>(dispositionsResponse);
  const { data: contactGroupsResponse = [] } = useQuery<ContactGroup[]>({
    queryKey: ["contact-groups"],
    queryFn: () => apiFetch("/api/contact-groups"),
    enabled: role !== "client" && showGroupAssignment,
  });
  const { data: clientAccountsResponse = [] } = useQuery<AssignmentOption[]>({
    queryKey: ["sub-accounts"],
    queryFn: () => apiFetch("/sub-accounts"),
    enabled: role !== "client" && showGroupAssignment,
  });
  const { data: teamResponse = [] } = useQuery<AssignmentOption[]>({
    queryKey: ["team"],
    queryFn: () => apiFetch("/team"),
    enabled: role !== "client" && showGroupAssignment,
  });
  const contactGroups = asArray<ContactGroup>(contactGroupsResponse);
  const clientAccounts = asArray<AssignmentOption>(clientAccountsResponse);
  const agents = asArray<AssignmentOption>(teamResponse).filter((member) => member.role === "agent" || member.role === "member");

  const activityById = new Map(activityResponse.map((event) => [event.leadId, event.lastActivityAt]));
  const leads = asArray<Lead>(data?.leads).map((lead) => ({ ...lead, lastActivityAt: activityById.get(lead.id) ?? lead.lastActivityAt }));
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const allSelected = leads.length > 0 && leads.every((lead) => selected.has(lead.id));
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
    clearApiCache();
    await queryClient.invalidateQueries({ queryKey: ["contacts"] });
  }

  async function saveView() {
    const name = window.prompt("Name this view")?.trim();
    if (!name) return;
    try {
      const created = await apiFetch("/api/contact-views", { method: "POST", body: JSON.stringify({ name, filters: currentViewFilters() }) }) as {id:string};
      await queryClient.invalidateQueries({ queryKey: ["contact-views"] });
      setActiveViewId(created.id);
      toast({ title: "View saved" });
    } catch (cause) { toast({ title: cause instanceof Error ? cause.message : "Could not save view", variant: "destructive" }); }
  }

  function currentViewFilters() { return { search, status: statusFilter, tag: tagFilter, source: sourceFilter, state: stateFilter, sort, direction, columns: JSON.parse(localStorage.getItem("crm-contact-columns") ?? "null") }; }

  async function updateView() {
    if (!activeViewId) return;
    try { await apiFetch(`/api/contact-views/${activeViewId}`, { method: "PATCH", body: JSON.stringify({ filters: currentViewFilters() }) }); await queryClient.invalidateQueries({ queryKey: ["contact-views"] }); toast({ title: "View updated" }); }
    catch (cause) { toast({ title: cause instanceof Error ? cause.message : "Could not update view", variant: "destructive" }); }
  }

  async function deleteView() {
    if (!activeViewId || !window.confirm("Delete this saved view?")) return;
    try { await apiFetch(`/api/contact-views/${activeViewId}`, { method: "DELETE" }); setActiveViewId(""); await queryClient.invalidateQueries({ queryKey: ["contact-views"] }); toast({ title: "View deleted" }); }
    catch (cause) { toast({ title: cause instanceof Error ? cause.message : "Could not delete view", variant: "destructive" }); }
  }

  function applyView(filters: Record<string,unknown>) {
    setSearch(String(filters.search ?? "")); setStatusFilter(String(filters.status ?? "all")); setTagFilter(String(filters.tag ?? "all"));
    setSourceFilter(String(filters.source ?? "")); setStateFilter(String(filters.state ?? ""));
    setSort(String(filters.sort ?? "created_at")); setDirection(String(filters.direction ?? "desc")); setPage(1);
    if (Array.isArray(filters.columns)) { localStorage.setItem("crm-contact-columns", JSON.stringify(filters.columns)); setLayoutVersion((version) => version + 1); }
  }

  async function handleCreate() {
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
    const headers = (lines[0] ?? "").split(",").map((header) => header.trim());
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
                placeholder="Search name, company, email, phone..."
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
            <Input className="w-32" placeholder="Source" aria-label="Filter source" value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setPage(1); }} />
            <Input className="w-24" placeholder="State" aria-label="Filter state" value={stateFilter} onChange={(event) => { setStateFilter(event.target.value); setPage(1); }} />
            <select className="workspace-control rounded border px-2 py-2 text-sm" aria-label="Sort contacts" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
              <option value="created_at">Created date</option><option value="name">Name</option><option value="company">Company</option><option value="status">Status</option><option value="source">Source</option>
            </select>
            <button className="rounded border px-3 py-2 text-sm" onClick={() => { setDirection(direction === "asc" ? "desc" : "asc"); setPage(1); }} aria-label="Reverse sort direction">{direction === "asc" ? "↑" : "↓"}</button>
            {role !== "client" && <><select className="workspace-control rounded border px-2 py-2 text-sm" aria-label="Saved views" value={activeViewId} onChange={(event) => { setActiveViewId(event.target.value); const view = savedViews.find((item) => item.id === event.target.value); if (view) applyView(view.filters); }}>
              <option value="">Saved views</option>{savedViews.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}
            </select><Button variant="outline" onClick={() => void saveView()}>Save view</Button>{activeViewId && <><Button variant="outline" onClick={() => void updateView()}>Update</Button><Button variant="outline" onClick={() => void deleteView()}>Delete view</Button></>}</>}
            {role !== "client" && <><Button variant="outline" onClick={() => setSelected(allSelected ? new Set() : new Set(leads.map((lead) => lead.id)))}>
              {allSelected ? "Clear all" : `Select all (${leads.length})`}
            </Button>
            {selected.size > 0 && (
              <Button variant="outline" onClick={() => setShowGroupAssignment(true)} className="gap-1.5">
                <FolderPlus className="h-4 w-4" /> Group & Assign ({selected.size})
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowDispositions(true)}>Dispositions</Button></>}
          </div>

          {contactsError && <p role="alert" className="p-4 text-destructive">{contactsError instanceof Error ? contactsError.message : "Could not load contacts"}</p>}
          {isFetching && !isLoading && <p role="status" className="px-4 py-2 text-xs text-muted-foreground">Updating contacts…</p>}
          {isLoading ? <div className="p-6"><Skeleton className="h-72 w-full" /></div> : !contactsError && <ContactGrid key={layoutVersion} contacts={leads} selected={selected} onSelect={(id) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; })} onDelete={role === "client" ? undefined : (id) => { if (window.confirm("Delete this contact?")) void handleDelete(id); }} canEdit={role !== "client"} />}
          {["owner", "admin", "member"].includes(role) && selected.size > 0 && <ContactBulkActions selected={selected} onDone={() => { setSelected(new Set()); void refresh(); }} />}
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
              <Label className="text-xs text-muted-foreground">First name</Label>
              <Input className="mt-1" value={form.firstName} onChange={(event) => setForm((f) => ({ ...f, firstName: event.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Last name</Label>
              <Input className="mt-1" value={form.lastName} onChange={(event) => setForm((f) => ({ ...f, lastName: event.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Email</Label>
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
