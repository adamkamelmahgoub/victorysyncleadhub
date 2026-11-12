import { PageTitle, PageDescription } from "@/components/page-layout";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Users, Plus, DollarSign, TrendingUp, Copy, Check, MoreHorizontal, Gift, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { asArray } from "@/lib/data-shape";

interface Affiliate { id: number; name: string; email: string; phone?: string; company?: string; referralCode: string; commissionRate: string; status: string; totalReferrals: number; totalConverted: number; totalEarned: string; totalPaid: string; }
interface Referral { id: number; affiliateId: number; referredEmail: string; referredName?: string; referredCompany?: string; status: string; dealValue?: string; commission?: string; commissionPaid: boolean; createdAt: string; }

export default function Affiliates() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Affiliate | null>(null);
  const [showReferral, setShowReferral] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", commissionRate: "20.00", referralCode: "" });
  const [refForm, setRefForm] = useState({ referredEmail: "", referredName: "", referredCompany: "" });

  const { data: affiliatesResponse = [] } = useQuery<Affiliate[]>({ queryKey: ["affiliates"], queryFn: () => apiFetch("/affiliates") });
  const { data: stats } = useQuery({ queryKey: ["affiliates-stats"], queryFn: () => apiFetch("/affiliates-stats") });
  const { data: referralsResponse = [] } = useQuery<Referral[]>({
    queryKey: ["referrals", selected?.id],
    queryFn: () => apiFetch(`/affiliates/${selected!.id}/referrals`),
    enabled: !!selected,
  });
  const affiliates = asArray<Affiliate>(affiliatesResponse);
  const referrals = asArray<Referral>(referralsResponse);

  const addAffiliate = useMutation({
    mutationFn: (data: typeof form) => apiFetch("/affiliates", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["affiliates"] }); qc.invalidateQueries({ queryKey: ["affiliates-stats"] }); setShowAdd(false); setForm({ name: "", email: "", phone: "", company: "", commissionRate: "20.00", referralCode: "" }); toast({ title: "Affiliate added" }); },
  });

  const addReferral = useMutation({
    mutationFn: (data: typeof refForm) => apiFetch(`/affiliates/${selected!.id}/referrals`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["referrals", selected?.id] }); qc.invalidateQueries({ queryKey: ["affiliates-stats"] }); setShowReferral(false); setRefForm({ referredEmail: "", referredName: "", referredCompany: "" }); toast({ title: "Referral logged" }); },
  });

  const updateReferral = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiFetch(`/referrals/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["referrals", selected?.id] }),
  });

  const copyCode = (code: string) => { navigator.clipboard.writeText(`https://victorysync.com?ref=${code}`); setCopied(code); setTimeout(() => setCopied(null), 2000); };

  const statusColor: Record<string, string> = { pending: "bg-amber-100 text-amber-700", converted: "bg-green-100 text-green-700", lost: "bg-red-100 text-red-700" };

  return (
    <div className="page-stack">
      <div className="flex items-center justify-between flex-wrap gap-4 min-w-0">
        <div><PageTitle>Affiliate Program</PageTitle><PageDescription>Manage partners, referral links, and commission payouts</PageDescription></div>
        <Button className="bg-primary text-white" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-2" /> Add Affiliate</Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Affiliates", value: stats.totalAffiliates, sub: `${stats.activeAffiliates} active`, icon: Users },
            { label: "Total Referrals", value: stats.totalReferrals, sub: `${stats.converted} converted`, icon: TrendingUp },
            { label: "Earned", value: `$${stats.totalEarned}`, sub: `$${stats.outstanding} outstanding`, icon: DollarSign },
            { label: "Paid Out", value: `$${stats.totalPaid}`, sub: "all time", icon: Gift },
          ].map(s => (
            <div key={s.label} className="bg-card border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
                <s.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {selected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setSelected(null)}>← All Affiliates</Button>
            <h2 className="font-semibold text-lg">{selected.name}</h2>
            <Badge className="capitalize">{selected.status}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: "Referrals", value: selected.totalReferrals },
              { label: "Converted", value: selected.totalConverted },
              { label: "Total Earned", value: `$${selected.totalEarned}` },
              { label: "Commission Rate", value: `${selected.commissionRate}%` },
            ].map(s => (
              <div key={s.label} className="bg-card border rounded-xl p-4 text-center">
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="bg-card border rounded-xl p-4 flex items-center justify-between">
            <div><div className="text-sm font-medium mb-1">Referral Link</div><code className="text-xs text-muted-foreground">https://victorysync.com?ref={selected.referralCode}</code></div>
            <Button size="sm" variant="outline" onClick={() => copyCode(selected.referralCode)}>{copied === selected.referralCode ? <><Check className="w-3.5 h-3.5 mr-1.5 text-green-600" />Copied!</> : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</>}</Button>
          </div>
          <div className="flex items-center justify-between"><h3 className="font-semibold">Referrals</h3><Button size="sm" className="bg-primary text-white" onClick={() => setShowReferral(true)}><Plus className="w-3.5 h-3.5 mr-1.5" /> Log Referral</Button></div>
          <div className="bg-card border rounded-xl overflow-hidden">
            <table className="workspace-table w-full text-sm">
              <thead><tr className="border-b bg-muted/30"><th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Referred</th><th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Company</th><th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th><th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Deal Value</th><th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Commission</th><th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Date</th><th /></tr></thead>
              <tbody>
                {referrals.length === 0 ? <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No referrals yet</td></tr> : referrals.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3"><div className="font-medium">{r.referredName || "–"}</div><div className="text-xs text-muted-foreground">{r.referredEmail}</div></td>
                    <td className="px-4 py-3 text-muted-foreground">{r.referredCompany || "–"}</td>
                    <td className="px-4 py-3"><Badge className={`capitalize ${statusColor[r.status] || ""}`}>{r.status}</Badge></td>
                    <td className="px-4 py-3">{r.dealValue ? `$${r.dealValue}` : "–"}</td>
                    <td className="px-4 py-3">{r.commission ? <span className={r.commissionPaid ? "text-green-600" : ""}>${r.commission}{r.commissionPaid ? " ✓" : ""}</span> : "–"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      {r.status === "pending" && <Select onValueChange={v => updateReferral.mutate({ id: r.id, status: v })}><SelectTrigger className="h-7 w-28 text-xs"><SelectValue placeholder="Update" /></SelectTrigger><SelectContent><SelectItem value="converted">Converted</SelectItem><SelectItem value="lost">Lost</SelectItem></SelectContent></Select>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-card border rounded-xl overflow-hidden">
          <table className="workspace-table w-full text-sm">
            <thead><tr className="border-b bg-muted/30">{["Affiliate", "Code", "Commission", "Referrals", "Converted", "Earned", "Status", ""].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>)}</tr></thead>
            <tbody>
              {affiliates.length === 0 ? <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">No affiliates yet</td></tr> : affiliates.map(a => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/20 cursor-pointer" onClick={() => setSelected(a)}>
                  <td className="px-4 py-3"><div className="font-semibold">{a.name}</div><div className="text-xs text-muted-foreground">{a.email}</div></td>
                  <td className="px-4 py-3"><div className="flex items-center gap-1.5"><code className="text-xs bg-muted px-2 py-0.5 rounded">{a.referralCode}</code><button onClick={e => { e.stopPropagation(); copyCode(a.referralCode); }} className="text-muted-foreground hover:text-foreground">{copied === a.referralCode ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}</button></div></td>
                  <td className="px-4 py-3 font-medium">{a.commissionRate}%</td>
                  <td className="px-4 py-3">{a.totalReferrals}</td>
                  <td className="px-4 py-3">{a.totalConverted}</td>
                  <td className="px-4 py-3 font-medium">${a.totalEarned}</td>
                  <td className="px-4 py-3"><Badge className={a.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"} >{a.status}</Badge></td>
                  <td className="px-4 py-3"><Button size="sm" variant="ghost" className="h-7">View →</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Affiliate</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1"><Label>Full Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Enter full name" /></div>
              <div className="space-y-1"><Label>Email *</Label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Enter email address" /></div>
              <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Company</Label><Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Commission %</Label><Input type="number" value={form.commissionRate} onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))} /></div>
              <div className="col-span-2 space-y-1"><Label>Custom Code (optional)</Label><Input value={form.referralCode} onChange={e => setForm(f => ({ ...f, referralCode: e.target.value.toUpperCase() }))} placeholder="Auto-generated if blank" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button className="bg-primary text-white" onClick={() => addAffiliate.mutate(form)} disabled={!form.name || !form.email || addAffiliate.isPending}>{addAffiliate.isPending ? "Adding…" : "Add Affiliate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReferral} onOpenChange={setShowReferral}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Log Referral for {selected?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Referred Email *</Label><Input value={refForm.referredEmail} onChange={e => setRefForm(f => ({ ...f, referredEmail: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Referred Name</Label><Input value={refForm.referredName} onChange={e => setRefForm(f => ({ ...f, referredName: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Company</Label><Input value={refForm.referredCompany} onChange={e => setRefForm(f => ({ ...f, referredCompany: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReferral(false)}>Cancel</Button>
            <Button className="bg-primary text-white" onClick={() => addReferral.mutate(refForm)} disabled={!refForm.referredEmail || addReferral.isPending}>{addReferral.isPending ? "Logging…" : "Log Referral"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
