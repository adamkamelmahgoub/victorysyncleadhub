import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Building2, Plus, Search, TrendingUp, TrendingDown, Minus, MoreHorizontal, Settings, ExternalLink, Users, Activity, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { asArray } from "@/lib/data-shape";

interface SubAccount { id: number; name: string; slug: string; ownerEmail: string; ownerName: string; phone?: string; industry?: string; status: string; plan: string; leadsCount: number; campaignsCount: number; healthScore: number; onboardingCompleted: boolean; lastActiveAt?: string; notes?: string; createdAt: string; }

function HealthBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-green-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-medium w-7 text-right">{score}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge className="bg-green-100 text-green-700 border-green-200">Active</Badge>;
  if (status === "suspended") return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Suspended</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200">Cancelled</Badge>;
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = { starter: "bg-blue-100 text-blue-700", pro: "bg-purple-100 text-purple-700", agency: "bg-orange-100 text-orange-700", enterprise: "bg-gray-800 text-white" };
  return <Badge className={`capitalize ${colors[plan] || "bg-gray-100 text-gray-700"}`}>{plan}</Badge>;
}

const PLANS = ["starter", "pro", "agency", "enterprise"];
const INDUSTRIES = ["SaaS", "E-Commerce", "Real Estate", "Marketing Agency", "Consulting", "Finance", "Healthcare", "Retail", "Other"];

export default function SubAccounts() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<SubAccount | null>(null);
  const [form, setForm] = useState({ name: "", ownerName: "", ownerEmail: "", phone: "", industry: "", plan: "starter", notes: "" });

  const { data: accountsResponse = [], isLoading } = useQuery<SubAccount[]>({ queryKey: ["sub-accounts"], queryFn: () => apiFetch("/sub-accounts") });
  const { data: stats } = useQuery({ queryKey: ["sub-accounts-stats"], queryFn: () => apiFetch("/sub-accounts-stats") });
  const accounts = asArray<SubAccount>(accountsResponse);

  const addMutation = useMutation({
    mutationFn: (data: typeof form) => apiFetch("/sub-accounts", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sub-accounts"] }); qc.invalidateQueries({ queryKey: ["sub-accounts-stats"] }); setShowAdd(false); setForm({ name: "", ownerName: "", ownerEmail: "", phone: "", industry: "", plan: "starter", notes: "" }); toast({ title: "Account created" }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiFetch(`/sub-accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sub-accounts"] }); qc.invalidateQueries({ queryKey: ["sub-accounts-stats"] }); },
  });

  const filtered = accounts.filter(a => {
    if (filterStatus !== "all" && a.status !== filterStatus) return false;
    if (search && !`${a.name} ${a.ownerEmail} ${a.ownerName}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const atRisk = filtered.filter(a => a.healthScore < 50);

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sub-Accounts</h1>
          <p className="text-muted-foreground text-sm">Manage all client accounts in one place</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="bg-primary text-white">
          <Plus className="w-4 h-4 mr-2" /> Add Account
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Accounts", value: stats.total, icon: Building2, color: "text-blue-600" },
            { label: "Active", value: stats.active, icon: CheckCircle, color: "text-green-600" },
            { label: "At Risk", value: stats.atRisk, icon: AlertTriangle, color: "text-amber-600" },
            { label: "Inactive", value: stats.inactive, icon: XCircle, color: "text-red-600" },
          ].map(s => (
            <div key={s.label} className="bg-card border rounded-xl p-4 flex items-center gap-4">
              <div className={`p-2 rounded-lg bg-muted ${s.color}`}><s.icon className="w-5 h-5" /></div>
              <div><div className="text-2xl font-bold">{s.value}</div><div className="text-xs text-muted-foreground">{s.label}</div></div>
            </div>
          ))}
        </div>
      )}

      {atRisk.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-amber-600" /><span className="font-semibold text-amber-800 text-sm">{atRisk.length} account{atRisk.length > 1 ? "s" : ""} at risk</span></div>
          <div className="flex flex-wrap gap-2">{atRisk.map(a => <span key={a.id} className="text-xs bg-amber-100 text-amber-700 rounded px-2 py-0.5">{a.name} — score {a.healthScore}</span>)}</div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search accounts..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              {["Account", "Owner", "Plan", "Status", "Health", "Leads", "Campaigns", "Last Active", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No accounts found</td></tr>
            ) : filtered.map(account => (
              <tr key={account.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">{account.name.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <div className="font-semibold">{account.name}</div>
                      <div className="text-xs text-muted-foreground">{account.slug}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{account.ownerName}</div>
                  <div className="text-xs text-muted-foreground">{account.ownerEmail}</div>
                </td>
                <td className="px-4 py-3"><PlanBadge plan={account.plan} /></td>
                <td className="px-4 py-3"><StatusBadge status={account.status} /></td>
                <td className="px-4 py-3 min-w-[120px]"><HealthBar score={account.healthScore} /></td>
                <td className="px-4 py-3 font-medium">{account.leadsCount.toLocaleString()}</td>
                <td className="px-4 py-3 font-medium">{account.campaignsCount}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{account.lastActiveAt ? new Date(account.lastActiveAt).toLocaleDateString() : "Never"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSelected(account)}><Settings className="w-3.5 h-3.5" /></Button>
                    <Select value={account.status} onValueChange={v => updateMutation.mutate({ id: account.id, data: { status: v } })}>
                      <SelectTrigger className="h-7 w-7 p-0 border-0 bg-transparent"><MoreHorizontal className="w-3.5 h-3.5" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Set Active</SelectItem>
                        <SelectItem value="suspended">Suspend</SelectItem>
                        <SelectItem value="cancelled">Cancel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Sub-Account</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1"><Label>Agency / Business Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Agency" /></div>
              <div className="space-y-1"><Label>Owner Name *</Label><Input value={form.ownerName} onChange={e => setForm(f => ({ ...f, ownerName: e.target.value }))} placeholder="John Doe" /></div>
              <div className="space-y-1"><Label>Owner Email *</Label><Input value={form.ownerEmail} onChange={e => setForm(f => ({ ...f, ownerEmail: e.target.value }))} placeholder="john@acme.com" /></div>
              <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" /></div>
              <div className="space-y-1"><Label>Industry</Label>
                <Select value={form.industry} onValueChange={v => setForm(f => ({ ...f, industry: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Plan</Label>
                <Select value={form.plan} onValueChange={v => setForm(f => ({ ...f, plan: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PLANS.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Internal notes…" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button className="bg-primary text-white" onClick={() => addMutation.mutate(form)} disabled={!form.name || !form.ownerEmail || !form.ownerName || addMutation.isPending}>{addMutation.isPending ? "Creating…" : "Create Account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
