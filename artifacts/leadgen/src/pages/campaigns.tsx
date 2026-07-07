import { useState, useMemo } from "react";
import { useListCampaigns, useCreateCampaign, useDeleteCampaign, useListLeads, getListCampaignsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Trash2, ArrowRight, Megaphone, ChevronRight, ChevronLeft,
  Mail, Users, Settings, Rocket, Search, Check
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, parseISO } from "date-fns";
import { apiFetch } from "@/lib/api";

const SOURCE_TYPES = ["email", "linkedin", "paid_search", "organic", "referral", "event", "social", "other"];
const STATUS_COLORS: Record<string, string> = {
  active: "hsl(140 70% 50%)",
  draft: "hsl(215 20% 65%)",
  paused: "hsl(40 90% 60%)",
  archived: "hsl(215 20% 65%)",
};

const STEPS = [
  { id: 1, label: "Details", icon: Megaphone },
  { id: 2, label: "Compose", icon: Mail },
  { id: 3, label: "Leads", icon: Users },
  { id: 4, label: "Send Settings", icon: Settings },
];

const BLANK_FORM = {
  name: "", description: "", sourceType: "email",
  fromName: "", fromEmail: "",
  subject: "", body: "",
  sendRatePerHour: 20, dailyLimit: 100,
  sendWindowStart: "09:00", sendWindowEnd: "17:00",
};

export default function Campaigns() {
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(BLANK_FORM);
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [launching, setLaunching] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: campaigns, isLoading } = useListCampaigns();
  const createCampaign = useCreateCampaign();
  const deleteCampaign = useDeleteCampaign();
  const { data: leadsData } = useListLeads();

  const filteredLeads = useMemo(() => {
    const all = leadsData?.leads ?? [];
    if (!leadSearch.trim()) return all;
    const q = leadSearch.toLowerCase();
    return all.filter(
      (l) =>
        `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.company ?? "").toLowerCase().includes(q)
    );
  }, [leadsData, leadSearch]);

  function openWizard() {
    setForm(BLANK_FORM);
    setSelectedLeadIds([]);
    setLeadSearch("");
    setStep(1);
    setShowWizard(true);
  }

  function nextStep() { setStep((s) => Math.min(s + 1, 4)); }
  function prevStep() { setStep((s) => Math.max(s - 1, 1)); }

  function toggleLead(id: number) {
    setSelectedLeadIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    );
  }

  function toggleAll() {
    const ids = filteredLeads.map((l) => l.id);
    const allSelected = ids.every((id) => selectedLeadIds.includes(id));
    if (allSelected) {
      setSelectedLeadIds((prev) => prev.filter((id) => !ids.includes(id)));
    } else {
      setSelectedLeadIds((prev) => [...new Set([...prev, ...ids])]);
    }
  }

  async function handleLaunch(asDraft = false) {
    if (!form.name.trim()) { toast({ title: "Campaign name is required", variant: "destructive" }); setStep(1); return; }
    setLaunching(true);
    try {
      const campaign = await new Promise<{ id: number }>((resolve, reject) => {
        createCampaign.mutate(
          {
            data: {
              name: form.name,
              description: form.description || undefined,
              sourceType: form.sourceType || undefined,
              fromName: form.fromName || undefined,
              fromEmail: form.fromEmail || undefined,
              subject: form.subject || undefined,
              body: form.body || undefined,
              sendRatePerHour: form.sendRatePerHour,
              dailyLimit: form.dailyLimit,
              sendWindowStart: form.sendWindowStart,
              sendWindowEnd: form.sendWindowEnd,
              status: "draft",
            },
          },
          { onSuccess: resolve, onError: reject }
        );
      });

      if (selectedLeadIds.length > 0) {
        await apiFetch(`/campaigns/${campaign.id}/leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadIds: selectedLeadIds }),
        });
      }

      if (!asDraft) {
        await apiFetch(`/campaigns/${campaign.id}/launch`, { method: "POST" });
      }

      queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
      setShowWizard(false);
      toast({ title: asDraft ? "Campaign saved as draft" : `Campaign launched! Sending to ${selectedLeadIds.length} leads.` });
    } catch {
      toast({ title: "Failed to create campaign", variant: "destructive" });
    } finally {
      setLaunching(false);
    }
  }

  function handleDelete(id: number) {
    deleteCampaign.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
        toast({ title: "Campaign deleted" });
      },
    });
  }

  const canAdvance = () => {
    if (step === 1) return form.name.trim().length > 0;
    if (step === 2) return form.subject.trim().length > 0 && form.body.trim().length > 0;
    return true;
  };

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Campaigns</h1>
            <p className="text-sm text-muted-foreground mt-1">{campaigns?.length ?? 0} campaigns</p>
          </div>
          <Button size="sm" onClick={openWizard} className="gap-1.5">
            <Plus className="w-4 h-4" /> New Campaign
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44" />)}
          </div>
        ) : !campaigns?.length ? (
          <Card className="p-12 border border-border bg-card text-center">
            <Megaphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">No campaigns yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first campaign to start sending emails</p>
            <Button size="sm" className="mt-4" onClick={openWizard}>New Campaign</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {campaigns.map((c) => {
              const convRate = c.leadCount > 0 ? Math.round(((c.convertedCount ?? 0) / c.leadCount) * 100) : 0;
              return (
                <Card key={c.id} className="p-5 border border-border bg-card hover:border-primary/40 transition-colors group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs capitalize" style={{ borderColor: (STATUS_COLORS[c.status] ?? "hsl(215 20% 65%)") + "60", color: STATUS_COLORS[c.status] }}>
                          {c.status}
                        </Badge>
                        {c.sourceType && <span className="text-xs text-muted-foreground capitalize">{c.sourceType.replace("_", " ")}</span>}
                      </div>
                      <h3 className="font-semibold text-foreground text-sm truncate">{c.name}</h3>
                      {c.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      className="w-7 h-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive flex-shrink-0 ml-2"
                      onClick={() => handleDelete(c.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 py-3 border-y border-border my-3">
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{c.leadCount}</p>
                      <p className="text-xs text-muted-foreground">Leads</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{c.convertedCount ?? 0}</p>
                      <p className="text-xs text-muted-foreground">Converted</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-primary">{convRate}%</p>
                      <p className="text-xs text-muted-foreground">Rate</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{formatDistanceToNow(parseISO(c.createdAt), { addSuffix: true })}</span>
                    <Link href={`/leadgen/campaigns/${c.id}`}>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary">
                        View leads <ArrowRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Campaign Wizard */}
      <Dialog open={showWizard} onOpenChange={(o) => { if (!launching) setShowWizard(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle className="text-base">New Email Campaign</DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-0 mt-3">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const done = step > s.id;
                const active = step === s.id;
                return (
                  <div key={s.id} className="flex items-center flex-1">
                    <div className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${active ? "text-primary" : done ? "text-primary/70" : "text-muted-foreground"}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs border transition-colors ${active ? "bg-primary border-primary text-white" : done ? "bg-primary/20 border-primary/40 text-primary" : "bg-muted border-border text-muted-foreground"}`}>
                        {done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                      </div>
                      <span className="hidden sm:block">{s.label}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`flex-1 h-px mx-2 ${step > s.id ? "bg-primary/40" : "bg-border"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">

            {/* Step 1: Details */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Campaign Name *</Label>
                  <Input className="mt-1" placeholder="Q3 Outbound — SaaS Founders" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Description</Label>
                  <Textarea className="mt-1 resize-none" rows={2} placeholder="Internal notes about this campaign..." value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">From Name</Label>
                    <Input className="mt-1" placeholder="John at VictorySync" value={form.fromName} onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">From Email</Label>
                    <Input className="mt-1" type="email" placeholder="john@agency.com" value={form.fromEmail} onChange={(e) => setForm((f) => ({ ...f, fromEmail: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Source Type</Label>
                  <Select value={form.sourceType} onValueChange={(v) => setForm((f) => ({ ...f, sourceType: v }))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_TYPES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Step 2: Compose */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Subject Line *</Label>
                  <Input
                    className="mt-1 font-medium"
                    placeholder="Quick question about your growth strategy..."
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Tip: keep under 60 chars and avoid spam words</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs font-medium text-muted-foreground">Email Body *</Label>
                    <span className={`text-xs ${form.body.length > 1200 ? "text-destructive" : "text-muted-foreground"}`}>{form.body.length} chars</span>
                  </div>
                  <Textarea
                    className="mt-1 resize-none font-mono text-sm leading-relaxed"
                    rows={14}
                    placeholder={`Hi {{firstName}},\n\nI noticed that {{company}} is scaling fast and wanted to reach out...\n\nBest,\n${form.fromName || "Your Name"}`}
                    value={form.body}
                    onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Use <code className="bg-muted px-1 rounded text-xs">{"{{firstName}}"}</code>, <code className="bg-muted px-1 rounded text-xs">{"{{company}}"}</code>, <code className="bg-muted px-1 rounded text-xs">{"{{title}}"}</code> as merge tags</p>
                </div>
              </div>
            )}

            {/* Step 3: Lead Selection */}
            {step === 3 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {selectedLeadIds.length > 0
                      ? <span className="text-foreground font-medium">{selectedLeadIds.length} selected</span>
                      : "Select which leads to send this campaign to"}
                  </p>
                  {filteredLeads.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAll}>
                      {filteredLeads.every((l) => selectedLeadIds.includes(l.id)) ? "Deselect all" : `Select all ${filteredLeads.length}`}
                    </Button>
                  )}
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search leads..."
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                  />
                </div>

                <div className="border border-border rounded-lg overflow-hidden max-h-[320px] overflow-y-auto">
                  {filteredLeads.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      {leadsData?.leads?.length === 0 ? "No leads yet — import or add leads first" : "No leads match your search"}
                    </div>
                  ) : (
                    filteredLeads.map((lead) => {
                      const checked = selectedLeadIds.includes(lead.id);
                      return (
                        <div
                          key={lead.id}
                          className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors ${checked ? "bg-primary/5" : ""}`}
                          onClick={() => toggleLead(lead.id)}
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleLead(lead.id)} />
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-primary">
                            {lead.firstName[0]}{lead.lastName[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{lead.firstName} {lead.lastName}</p>
                            <p className="text-xs text-muted-foreground truncate">{lead.email}{lead.company ? ` · ${lead.company}` : ""}</p>
                          </div>
                          <Badge variant="outline" className="text-xs capitalize flex-shrink-0">{lead.status}</Badge>
                        </div>
                      );
                    })
                  )}
                </div>

                {selectedLeadIds.length === 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    No leads selected — you can still save as draft and add leads later
                  </p>
                )}
              </div>
            )}

            {/* Step 4: Sending Settings */}
            {step === 4 && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-medium text-muted-foreground">Emails per Hour</Label>
                    <span className="text-sm font-bold text-foreground">{form.sendRatePerHour}/hr</span>
                  </div>
                  <Slider
                    min={1} max={200} step={1}
                    value={[form.sendRatePerHour]}
                    onValueChange={([v]) => setForm((f) => ({ ...f, sendRatePerHour: v }))}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>1 (safest)</span><span>50 (standard)</span><span>200 (aggressive)</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    At {form.sendRatePerHour}/hr you'll reach {selectedLeadIds.length} leads in ~{selectedLeadIds.length > 0 ? Math.ceil(selectedLeadIds.length / form.sendRatePerHour) : "?"} hours
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-medium text-muted-foreground">Daily Limit</Label>
                    <span className="text-sm font-bold text-foreground">{form.dailyLimit}/day</span>
                  </div>
                  <Slider
                    min={10} max={500} step={10}
                    value={[form.dailyLimit]}
                    onValueChange={([v]) => setForm((f) => ({ ...f, dailyLimit: v }))}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>10</span><span>250</span><span>500</span>
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Sending Window</Label>
                  <p className="text-xs text-muted-foreground mb-2">Only send emails during these hours (in your account timezone)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Start time</Label>
                      <Input
                        type="time"
                        className="mt-1"
                        value={form.sendWindowStart}
                        onChange={(e) => setForm((f) => ({ ...f, sendWindowStart: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">End time</Label>
                      <Input
                        type="time"
                        className="mt-1"
                        value={form.sendWindowEnd}
                        onChange={(e) => setForm((f) => ({ ...f, sendWindowEnd: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2 text-sm">
                  <p className="font-medium text-foreground">Campaign Summary</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Campaign</span><span className="font-medium truncate">{form.name}</span>
                    <span className="text-muted-foreground">Subject</span><span className="font-medium truncate">{form.subject || "—"}</span>
                    <span className="text-muted-foreground">Recipients</span><span className="font-medium">{selectedLeadIds.length} leads</span>
                    <span className="text-muted-foreground">Send rate</span><span className="font-medium">{form.sendRatePerHour}/hr · max {form.dailyLimit}/day</span>
                    <span className="text-muted-foreground">Window</span><span className="font-medium">{form.sendWindowStart} – {form.sendWindowEnd}</span>
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-card">
            <Button variant="ghost" size="sm" onClick={() => { if (step === 1) setShowWizard(false); else prevStep(); }} disabled={launching}>
              {step === 1 ? "Cancel" : <><ChevronLeft className="w-4 h-4 mr-1" /> Back</>}
            </Button>

            <div className="flex gap-2">
              {step === 4 && (
                <Button variant="outline" size="sm" onClick={() => handleLaunch(true)} disabled={launching}>
                  Save as Draft
                </Button>
              )}
              {step < 4 ? (
                <Button size="sm" onClick={nextStep} disabled={!canAdvance()}>
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button size="sm" onClick={() => handleLaunch(false)} disabled={launching} className="gap-1.5">
                  <Rocket className="w-4 h-4" />
                  {launching ? "Launching..." : "Launch Campaign"}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}
