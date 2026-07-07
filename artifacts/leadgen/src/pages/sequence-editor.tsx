import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useParams } from "wouter";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Mail,
  Clock,
  Users,
  Send,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { asArray } from "@/lib/data-shape";

type Step = {
  id: number;
  stepNumber: number;
  subject: string;
  body: string;
  delayDays: number;
};

type Sequence = {
  id: number;
  name: string;
  status: string;
  emailAccountId?: number | null;
  totalEnrolled: number;
  steps: Step[];
};

type Lead = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
};

type EmailAccount = {
  id: number;
  fromName: string;
  fromEmail: string;
  isDefault: boolean;
};

const VARIABLES = ["{{firstName}}", "{{lastName}}", "{{company}}", "{{title}}", "{{email}}"];

function StepCard({
  step,
  index,
  onUpdate,
  onDelete,
}: {
  step: Step;
  index: number;
  onUpdate: (id: number, data: Partial<Step>) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary">
            {index + 1}
          </div>
          <div className="text-left">
            <div className="font-medium text-foreground text-sm">
              {step.subject || "No subject yet"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {index === 0
                ? "Sends immediately on enrollment"
                : `Wait ${step.delayDays} day${step.delayDays !== 1 ? "s" : ""} after step ${index}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(step.id); }}
            className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-4">
          {index > 0 && (
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Wait days</Label>
              <Input
                type="number"
                min={1}
                className="bg-background border-border text-foreground w-20"
                value={step.delayDays}
                onChange={(e) => onUpdate(step.id, { delayDays: Number(e.target.value) })}
              />
              <span className="text-xs text-muted-foreground">days before sending</span>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Subject line</Label>
            <Input
              className="bg-background border-border text-foreground"
              placeholder="Quick question about {{company}}"
              value={step.subject}
              onChange={(e) => onUpdate(step.id, { subject: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Email body</Label>
              <div className="flex gap-1 flex-wrap justify-end">
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      const ta = document.getElementById(`body-${step.id}`) as HTMLTextAreaElement;
                      if (ta) {
                        const start = ta.selectionStart;
                        const newBody = step.body.slice(0, start) + v + step.body.slice(start);
                        onUpdate(step.id, { body: newBody });
                      }
                    }}
                    className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded hover:bg-primary/20 transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id={`body-${step.id}`}
              className="w-full bg-background border border-border rounded-md text-foreground text-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[140px] font-mono"
              placeholder={`Hi {{firstName}},\n\nI noticed that {{company}} is...`}
              value={step.body}
              onChange={(e) => onUpdate(step.id, { body: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function SequenceEditorPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { toast } = useToast();

  const [seq, setSeq] = useState<Sequence | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());
  const [enrolling, setEnrolling] = useState(false);
  const [savingStep, setSavingStep] = useState<number | null>(null);

  const loadSeq = useCallback(async () => {
    const result = await apiFetch(`/api/sequences/${id}`) as Sequence;
    setSeq({ ...result, steps: asArray<Step>(result.steps) });
  }, [id]);

  useEffect(() => {
    loadSeq();
    apiFetch("/api/leads").then((d) => {
      const response = d as { leads?: Lead[] } | Lead[];
      setLeads(Array.isArray(response) ? response : asArray<Lead>(response.leads));
    });
    apiFetch("/api/email-accounts").then((d) => setAccounts(asArray<EmailAccount>(d)));
  }, [loadSeq]);

  async function addStep() {
    if (!seq) return;
    const nextNum = asArray<Step>(seq.steps).length + 1;
    await apiFetch(`/api/sequences/${id}/steps`, {
      method: "POST",
      body: JSON.stringify({
        sequenceId: id,
        stepNumber: nextNum,
        subject: "",
        body: "",
        delayDays: nextNum === 1 ? 0 : 3,
      }),
    });
    loadSeq();
  }

  async function updateStep(stepId: number, data: Partial<Step>) {
    setSavingStep(stepId);
    await apiFetch(`/api/sequences/${id}/steps/${stepId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    setSavingStep(null);
    loadSeq();
  }

  async function deleteStep(stepId: number) {
    await apiFetch(`/api/sequences/${id}/steps/${stepId}`, { method: "DELETE" });
    loadSeq();
  }

  async function updateName(newName: string) {
    await apiFetch(`/api/sequences/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name: newName }),
    });
    loadSeq();
  }

  async function updateAccount(emailAccountId: number) {
    await apiFetch(`/api/sequences/${id}`, {
      method: "PUT",
      body: JSON.stringify({ emailAccountId }),
    });
    loadSeq();
  }

  async function handleEnroll() {
    if (!selectedLeads.size) return;
    setEnrolling(true);
    try {
      const data = await apiFetch(`/api/sequences/${id}/enroll`, {
        method: "POST",
        body: JSON.stringify({ leadIds: Array.from(selectedLeads) }),
      }) as { enrolled: number };
      toast({ title: `${data.enrolled} lead${data.enrolled !== 1 ? "s" : ""} enrolled` });
      setEnrollOpen(false);
      setSelectedLeads(new Set());
      loadSeq();
    } finally {
      setEnrolling(false);
    }
  }

  if (!seq) {
    return (

        <div className="p-6 text-muted-foreground">Loading…</div>

    );
  }
  const steps = asArray<Step>(seq.steps);

  return (

      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Back + Header */}
        <div className="flex items-center gap-3">
            <Link href="/sequences">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4 mr-1" /> Sequences
            </Button>
          </Link>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <input
              className="text-2xl font-bold text-foreground bg-transparent border-none outline-none w-full focus:ring-0 placeholder:text-muted-foreground"
              value={seq.name}
              onChange={(e) => setSeq((s) => s ? { ...s, name: e.target.value } : s)}
              onBlur={(e) => updateName(e.target.value)}
            />
            <div className="flex items-center gap-3 mt-2">
              <Badge
                className={
                  seq.status === "active"
                    ? "bg-green-500/20 text-green-400 border-green-500/30"
                    : seq.status === "paused"
                    ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                    : "bg-muted text-muted-foreground"
                }
              >
                {seq.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {steps.length} step{steps.length !== 1 ? "s" : ""} · {seq.totalEnrolled} enrolled
              </span>
            </div>
          </div>
          <Button
            onClick={() => setEnrollOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0"
            disabled={steps.length === 0}
          >
            <Users className="w-4 h-4 mr-2" /> Enroll Leads
          </Button>
        </div>

        {/* Email account selector */}
        <div className="rounded-xl border border-border bg-card p-4">
          <Label className="text-xs text-muted-foreground mb-2 block">Sending account</Label>
          {accounts.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No email accounts connected.{" "}
                <Link href="/email-accounts" className="text-primary hover:underline">
                Connect one →
              </Link>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {accounts.map((acct) => (
                <button
                  key={acct.id}
                  onClick={() => updateAccount(acct.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    seq.emailAccountId === acct.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {seq.emailAccountId === acct.id && <Check className="w-3 h-3" />}
                  <Mail className="w-3 h-3" />
                  {acct.fromEmail}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Steps */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Email Steps</h2>
            {savingStep && <span className="text-xs text-muted-foreground">Saving…</span>}
          </div>

          {steps.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Mail className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <div className="text-sm text-muted-foreground">
                No steps yet. Add your first email to get started.
              </div>
            </div>
          )}

          {steps.map((step, i) => (
            <div key={step.id} className="relative">
              {i > 0 && (
                <div className="flex items-center gap-2 py-1 pl-6 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>Wait {step.delayDays} day{step.delayDays !== 1 ? "s" : ""}</span>
                </div>
              )}
              <StepCard
                step={step}
                index={i}
                onUpdate={updateStep}
                onDelete={deleteStep}
              />
            </div>
          ))}

          <Button
            variant="outline"
            onClick={addStep}
            className="w-full border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
          >
            <Plus className="w-4 h-4 mr-2" /> Add Step
          </Button>
        </div>

        {/* Enroll dialog */}
        <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-foreground">Enroll Leads</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Select leads to enroll into <strong className="text-foreground">{seq.name}</strong>
            </p>
            <div className="max-h-72 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
              {leads.map((lead) => (
                <label
                  key={lead.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/20 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={selectedLeads.has(lead.id)}
                    onChange={(e) => {
                      const s = new Set(selectedLeads);
                      e.target.checked ? s.add(lead.id) : s.delete(lead.id);
                      setSelectedLeads(s);
                    }}
                  />
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {lead.firstName} {lead.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">{lead.email} · {lead.company}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">{selectedLeads.size} selected</div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEnrollOpen(false)} className="border-border text-foreground">
                Cancel
              </Button>
              <Button
                onClick={handleEnroll}
                disabled={enrolling || !selectedLeads.size}
                className="bg-primary text-primary-foreground"
              >
                <Send className="w-4 h-4 mr-2" />
                {enrolling ? "Enrolling…" : `Enroll ${selectedLeads.size || ""}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

  );
}
