import { useState } from "react";
import { useListLeads, useDeleteLead, useListCampaigns, getListLeadsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Trash2, ExternalLink, Upload } from "lucide-react";
import { Link } from "wouter";
import { useCreateLead } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_COLORS: Record<string, string> = {
  new: "hsl(185 100% 50%)",
  contacted: "hsl(280 85% 60%)",
  qualified: "hsl(40 90% 60%)",
  proposal: "hsl(140 70% 50%)",
  converted: "hsl(140 70% 45%)",
  lost: "hsl(350 85% 60%)",
};

const STATUSES = ["new", "contacted", "qualified", "proposal", "converted", "lost"];

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "hsl(185 100% 50%)" : score >= 40 ? "hsl(40 90% 60%)" : "hsl(215 20% 65%)";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

export default function Leads() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "", title: "", source: "", campaignId: "" });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const params = {
    ...(search ? { search } : {}),
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    limit: 100,
  };

  const { data, isLoading } = useListLeads(params);
  const { data: campaigns } = useListCampaigns();
  const createLead = useCreateLead();
  const deleteLead = useDeleteLead();

  function handleCreate() {
    if (!form.firstName || !form.lastName || !form.email) {
      toast({ title: "Required fields missing", variant: "destructive" });
      return;
    }
    createLead.mutate(
      { data: { ...form, campaignId: form.campaignId ? parseInt(form.campaignId) : undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
          setShowCreate(false);
          setForm({ firstName: "", lastName: "", email: "", phone: "", company: "", title: "", source: "", campaignId: "" });
          toast({ title: "Lead created" });
        },
      }
    );
  }

  function handleDelete(id: number) {
    deleteLead.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        toast({ title: "Lead deleted" });
      },
    });
  }

  const leads = data?.leads ?? [];

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Leads</h1>
            <p className="text-sm text-muted-foreground mt-1">{data?.total ?? 0} total leads</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-1.5">
              <Upload className="w-4 h-4" /> Import
            </Button>
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> Add Lead
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, company..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card className="border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lead</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campaign</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-3"><Skeleton className="h-9 w-48" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3"></td>
                  </tr>
                ))}
                {!isLoading && leads.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">No leads found</td>
                  </tr>
                )}
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {lead.firstName[0]}{lead.lastName[0]}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{lead.firstName} {lead.lastName}</p>
                          <p className="text-xs text-muted-foreground">{lead.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.company ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs capitalize" style={{ borderColor: (STATUS_COLORS[lead.status] ?? "hsl(215 20% 65%)") + "60", color: STATUS_COLORS[lead.status] ?? "hsl(215 20% 65%)" }}>
                        {lead.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBadge score={lead.score} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{lead.source ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{lead.campaignName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
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
        </Card>
      </div>

      {/* Create lead modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Lead</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">First Name *</Label>
              <Input className="mt-1" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Last Name *</Label>
              <Input className="mt-1" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Email *</Label>
              <Input className="mt-1" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <Input className="mt-1" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Company</Label>
              <Input className="mt-1" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input className="mt-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Source</Label>
              <Input className="mt-1" placeholder="email, linkedin..." value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Campaign</Label>
              <Select value={form.campaignId} onValueChange={(v) => setForm((f) => ({ ...f, campaignId: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="No campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No campaign</SelectItem>
                  {(campaigns ?? []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createLead.isPending}>
              {createLead.isPending ? "Creating..." : "Create Lead"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import modal */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Leads via CSV</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">Paste CSV data with columns: firstName, lastName, email, phone, company, title, source</p>
            <Textarea
              className="font-mono text-xs h-48"
              placeholder={`firstName,lastName,email,phone,company,title,source\nJohn,Doe,john@example.com,+1-555-0101,Acme Inc,CEO,linkedin`}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowImport(false)}>Cancel</Button>
            <Button onClick={() => {
              const lines = importText.trim().split("\n");
              const headers = lines[0].split(",").map((h) => h.trim());
              const leads = lines.slice(1).map((line) => {
                const vals = line.split(",").map((v) => v.trim());
                const obj: Record<string, string> = {};
                headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
                return obj;
              }).filter((l) => l.email);
              if (leads.length === 0) {
                toast({ title: "No valid leads found", variant: "destructive" });
                return;
              }
              // Create each lead
              Promise.all(leads.map((l) => new Promise((resolve) => {
                createLead.mutate({ data: { firstName: l.firstName || "Unknown", lastName: l.lastName || "", email: l.email, phone: l.phone, company: l.company, title: l.title, source: l.source } }, { onSuccess: resolve, onError: resolve });
              }))).then(() => {
                queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
                toast({ title: `${leads.length} leads imported` });
                setShowImport(false);
                setImportText("");
              });
            }}>
              Import {importText.trim().split("\n").length - 1} Leads
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}
