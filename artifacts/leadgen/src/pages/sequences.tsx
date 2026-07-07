import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Plus, Mail, Users, BarChart3, PlayCircle, PauseCircle, Trash2, ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { asArray } from "@/lib/data-shape";

type Sequence = {
  id: number;
  name: string;
  status: string;
  totalEnrolled: number;
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  createdAt: string;
};

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    const result = await apiFetch("/api/sequences");
    setSequences(asArray<Sequence>(result));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await apiFetch("/api/sequences", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), status: "draft" }),
      });
      toast({ title: "Sequence created" });
      setOpen(false);
      setName("");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(seq: Sequence) {
    const newStatus = seq.status === "active" ? "paused" : "active";
    await apiFetch(`/api/sequences/${seq.id}`, {
      method: "PUT",
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this sequence and all its enrollments?")) return;
    await apiFetch(`/api/sequences/${id}`, { method: "DELETE" });
    load();
    toast({ title: "Sequence deleted" });
  }

  function openRate(seq: Sequence) {
    if (!seq.totalSent) return "—";
    return `${Math.round((seq.totalOpened / seq.totalSent) * 100)}%`;
  }
  function replyRate(seq: Sequence) {
    if (!seq.totalSent) return "—";
    return `${Math.round((seq.totalReplied / seq.totalSent) * 100)}%`;
  }

  return (

      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Sequences</h1>
            <p className="text-muted-foreground mt-1">Automated multi-step email outreach campaigns</p>
          </div>
          <Button onClick={() => setOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" /> New Sequence
          </Button>
        </div>

        {sequences.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="w-7 h-7 text-primary" />
            </div>
            <div>
              <div className="font-semibold text-foreground text-lg">No sequences yet</div>
              <div className="text-muted-foreground text-sm mt-1">
                Create a sequence to automate multi-step email outreach
              </div>
            </div>
            <Button onClick={() => setOpen(true)} className="bg-primary text-primary-foreground">
              <Plus className="w-4 h-4 mr-2" /> Create First Sequence
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {sequences.map((seq) => (
              <div key={seq.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-foreground">{seq.name}</span>
                        <Badge
                          className={
                            seq.status === "active"
                              ? "bg-green-500/20 text-green-400 border-green-500/30"
                              : seq.status === "paused"
                              ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                              : "bg-muted text-muted-foreground border-border"
                          }
                        >
                          {seq.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-5 mt-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          <span>{seq.totalEnrolled} enrolled</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" />
                          <span>{seq.totalSent} sent</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <BarChart3 className="w-3.5 h-3.5" />
                          <span>{openRate(seq)} open · {replyRate(seq)} reply</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleStatus(seq)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {seq.status === "active" ? (
                        <PauseCircle className="w-4 h-4" />
                      ) : (
                        <PlayCircle className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(seq.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Link href={`/sequences/${seq.id}`}>
                      <Button size="sm" variant="outline" className="border-border text-foreground gap-1.5">
                        Edit <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">New Sequence</DialogTitle>
            </DialogHeader>
            <Input
              className="bg-background border-border text-foreground"
              placeholder="e.g. Cold Outreach - SaaS Founders"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} className="border-border text-foreground">
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={saving || !name.trim()} className="bg-primary text-primary-foreground">
                {saving ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

  );
}
