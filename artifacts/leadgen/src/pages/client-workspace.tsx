import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Building2, CalendarClock, FileUp, MessageSquareText, PhoneCall, Plus, Search, ShieldCheck, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { asArray } from "@/lib/data-shape";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ClientAccount = {
  id: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  status: string;
  plan: string;
  industry?: string | null;
};

type ClientStats = {
  total: number;
  statuses: Record<string, number>;
  dispositions: Record<string, number>;
  notes: number;
  lastUpdatedAt: string | null;
};

type ClientLead = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  status: string;
  disposition?: string | null;
  contactAttempts: number;
  nextActionAt?: string | null;
  updatedAt: string;
};

type LeadsResponse = { leads: ClientLead[]; total: number; page: number; limit: number };

const STATUSES = ["new", "contacted", "qualified", "proposal", "converted", "lost"];
const PAGE_SIZE = 50;

function readable(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function ClientWorkspace() {
  const [, params] = useRoute("/sub-accounts/:id");
  const clientId = params?.id ?? "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [disposition, setDisposition] = useState("all");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "", title: "", source: "client_workspace" });

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data: account, isLoading: accountLoading } = useQuery<ClientAccount>({
    queryKey: ["sub-account", clientId],
    queryFn: () => apiFetch(`/sub-accounts/${clientId}`),
    enabled: !!clientId,
  });
  const { data: stats } = useQuery<ClientStats>({
    queryKey: ["sub-account-workspace-stats", clientId],
    queryFn: () => apiFetch(`/sub-accounts/${clientId}/workspace-stats`),
    enabled: !!clientId,
  });
  const { data: dispositionsResponse = [] } = useQuery<Array<{ id: number; name: string; color: string }>>({
    queryKey: ["dispositions"],
    queryFn: () => apiFetch("/dispositions"),
  });
  const queryKey = ["client-leads", clientId, page, debouncedSearch, status, disposition];
  const { data, isLoading: leadsLoading } = useQuery<LeadsResponse>({
    queryKey,
    queryFn: () => {
      const query = new URLSearchParams({ clientAccountId: clientId, page: String(page), limit: String(PAGE_SIZE) });
      if (debouncedSearch) query.set("search", debouncedSearch);
      if (status !== "all") query.set("status", status);
      if (disposition !== "all") query.set("disposition", disposition);
      return apiFetch(`/api/leads?${query}`);
    },
    enabled: !!clientId,
  });

  const createLead = useMutation({
    mutationFn: () => apiFetch("/api/leads", { method: "POST", body: JSON.stringify({ ...form, clientAccountId: clientId }) }),
    onSuccess: async () => {
      setShowCreate(false);
      setForm({ firstName: "", lastName: "", email: "", phone: "", company: "", title: "", source: "client_workspace" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-leads", clientId] }),
        queryClient.invalidateQueries({ queryKey: ["sub-account-workspace-stats", clientId] }),
      ]);
      toast({ title: "Client contact created" });
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ leadId, nextStatus }: { leadId: number; nextStatus: string }) => apiFetch(`/api/leads/${leadId}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["client-leads", clientId] }),
        queryClient.invalidateQueries({ queryKey: ["sub-account-workspace-stats", clientId] }),
      ]);
      toast({ title: "Status updated" });
    },
  });

  const leads = asArray<ClientLead>(data?.leads);
  const total = data?.total ?? stats?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const dispositionOptions = useMemo(() => dispositionsResponse.map((item) => item.name), [dispositionsResponse]);

  if (accountLoading) return <div className="py-16 text-center text-sm text-muted-foreground">Loading client workspace...</div>;
  if (!account) return <div className="py-16 text-center text-sm text-muted-foreground">Client account not found.</div>;

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/sub-accounts" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to client accounts
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{account.name}</h1>
            <Badge variant="outline" className="capitalize">{account.status}</Badge>
            <Badge className="gap-1 bg-slate-100 text-slate-700 hover:bg-slate-100"><ShieldCheck className="h-3 w-3" /> Internal workspace</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Private lead operations for this client. Client users cannot open this page.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/lead-import?clientAccountId=${encodeURIComponent(clientId)}&clientName=${encodeURIComponent(account.name)}`}><FileUp className="mr-2 h-4 w-4" /> Upload leads</Link>
          </Button>
          <Button onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" /> Add contact</Button>
        </div>
      </div>

      <Card className="grid gap-px overflow-hidden border bg-border sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Total leads", value: total, icon: Users },
          { label: "New", value: stats?.statuses.new ?? 0, icon: Building2 },
          { label: "Contacted", value: stats?.statuses.contacted ?? 0, icon: PhoneCall },
          { label: "Converted", value: stats?.statuses.converted ?? 0, icon: CalendarClock },
          { label: "Notes logged", value: stats?.notes ?? 0, icon: MessageSquareText },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4" /></div>
            <div className="mt-2 text-2xl font-bold">{value.toLocaleString()}</div>
          </div>
        ))}
      </Card>

      <Card className="overflow-hidden border">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this client's leads..." className="pl-9" />
          </div>
          <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUSES.map((value) => <SelectItem key={value} value={value}>{readable(value)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={disposition} onValueChange={(value) => { setDisposition(value); setPage(1); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All dispositions" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All dispositions</SelectItem>{dispositionOptions.map((value) => <SelectItem key={value} value={value}>{readable(value)}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="workspace-table w-full min-w-[980px] text-sm">
            <thead><tr className="border-b bg-muted/30">
              {['Contact', 'Company', 'Status', 'Disposition', 'Attempts', 'Next action', 'Last updated'].map((heading) => <th key={heading} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</th>)}
            </tr></thead>
            <tbody>
              {leadsLoading ? <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">Loading leads...</td></tr> : leads.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-muted-foreground">No leads match these filters.</td></tr>
              ) : leads.map((lead) => (
                <tr key={lead.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3"><Link href={`/leads/${lead.id}?clientAccountId=${encodeURIComponent(clientId)}&clientName=${encodeURIComponent(account.name)}`} className="font-semibold text-primary hover:underline">{lead.firstName} {lead.lastName}</Link><div className="text-xs text-muted-foreground">{lead.email}</div></td>
                  <td className="px-4 py-3">{lead.company || <span className="text-muted-foreground">Not set</span>}</td>
                  <td className="px-4 py-3"><Select value={lead.status} onValueChange={(nextStatus) => updateStatus.mutate({ leadId: lead.id, nextStatus })}><SelectTrigger className="h-8 w-36 capitalize"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((value) => <SelectItem key={value} value={value}>{readable(value)}</SelectItem>)}</SelectContent></Select></td>
                  <td className="px-4 py-3 capitalize">{lead.disposition ? readable(lead.disposition) : <span className="text-muted-foreground">No attempt yet</span>}</td>
                  <td className="px-4 py-3">{lead.contactAttempts}</td>
                  <td className="px-4 py-3 text-xs">{formatDate(lead.nextActionAt)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(lead.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>{total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}</span>
          <div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span>Page {page} of {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
        </div>
      </Card>

      <div className="text-xs text-muted-foreground">Owner: {account.ownerName} ({account.ownerEmail}){stats?.lastUpdatedAt ? ` • Last lead update ${formatDate(stats.lastUpdatedAt)}` : ""}</div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add a lead for {account.name}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-1"><Label>First name</Label><Input value={form.firstName} onChange={(event) => setForm((value) => ({ ...value, firstName: event.target.value }))} /></div>
            <div className="space-y-1"><Label>Last name</Label><Input value={form.lastName} onChange={(event) => setForm((value) => ({ ...value, lastName: event.target.value }))} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))} /></div>
            <div className="space-y-1"><Label>Company</Label><Input value={form.company} onChange={(event) => setForm((value) => ({ ...value, company: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button><Button disabled={!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || createLead.isPending} onClick={() => createLead.mutate()}>{createLead.isPending ? "Creating..." : "Create lead"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
