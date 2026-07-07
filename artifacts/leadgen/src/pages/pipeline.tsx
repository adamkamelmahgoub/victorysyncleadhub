import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, User, Building2, Star, GripVertical } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { asArray } from "@/lib/data-shape";

type Lead = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  title?: string;
  score: number;
  status: string;
  pipelineStageId?: number | null;
};

type Stage = {
  id: number;
  name: string;
  color: string;
  position: number;
  leads: Lead[];
};

type PipelineData = {
  stages: Stage[];
  unassigned: Lead[];
};

function LeadCard({ lead, onDragStart }: { lead: Lead; onDragStart: (id: number) => void }) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(lead.id)}
      className="bg-background border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-foreground text-sm truncate">
            {lead.firstName} {lead.lastName}
          </div>
          {lead.title && (
            <div className="text-xs text-muted-foreground truncate mt-0.5">{lead.title}</div>
          )}
          {lead.company && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Building2 className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{lead.company}</span>
            </div>
          )}
        </div>
        {lead.score > 0 && (
          <div className="flex items-center gap-0.5 text-xs text-yellow-400 flex-shrink-0">
            <Star className="w-3 h-3 fill-current" />
            <span>{lead.score}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  onDrop,
  onDragStart,
}: {
  stage: Stage & { leads: Lead[] };
  onDrop: (stageId: number) => void;
  onDragStart: (id: number) => void;
}) {
  const [over, setOver] = useState(false);

  return (
    <div
      className="flex-shrink-0 w-64 flex flex-col"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(stage.id); }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
          <span className="font-semibold text-foreground text-sm">{stage.name}</span>
        </div>
        <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
          {stage.leads.length}
        </Badge>
      </div>
      <div
        className={`flex-1 rounded-xl border-2 border-dashed p-2 space-y-2 min-h-[120px] transition-colors ${
          over ? "border-primary/60 bg-primary/5" : "border-border/50 bg-card/30"
        }`}
      >
        {stage.leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onDragStart={onDragStart} />
        ))}
        {stage.leads.length === 0 && (
          <div className="h-20 flex items-center justify-center text-xs text-muted-foreground/50">
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    const result = await apiFetch("/api/pipeline/leads") as Partial<PipelineData>;
    setData({
      stages: asArray<Stage>(result.stages),
      unassigned: asArray<Lead>(result.unassigned),
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDrop(stageId: number) {
    if (!draggingId) return;
    setDraggingId(null);
    try {
      await apiFetch(`/api/pipeline/leads/${draggingId}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stageId }),
      });
    } catch {
      toast({ title: "Failed to move lead", variant: "destructive" });
    }
    load();
  }

  async function handleDropUnassigned() {
    if (!draggingId) return;
    setDraggingId(null);
    await apiFetch(`/api/pipeline/leads/${draggingId}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stageId: null }),
    });
    load();
  }

  if (!data) {
    return (

        <div className="p-6 flex items-center justify-center text-muted-foreground">Loading pipeline…</div>

    );
  }

  const totalLeads = data.stages.reduce((s, st) => s + st.leads.length, 0) + data.unassigned.length;

  return (

      <div className="p-6 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Pipeline</h1>
            <p className="text-muted-foreground mt-1">{totalLeads} leads across {data.stages.length} stages</p>
          </div>
        </div>

        {/* Board */}
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {/* Unassigned column */}
          <div
            className="flex-shrink-0 w-64 flex flex-col"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropUnassigned}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-muted flex-shrink-0" />
                <span className="font-semibold text-muted-foreground text-sm">Unassigned</span>
              </div>
              <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                {data.unassigned.length}
              </Badge>
            </div>
            <div className="flex-1 rounded-xl border-2 border-dashed border-border/30 bg-card/20 p-2 space-y-2 min-h-[120px]">
              {data.unassigned.map((lead) => (
                <LeadCard key={lead.id} lead={lead} onDragStart={setDraggingId} />
              ))}
              {data.unassigned.length === 0 && (
                <div className="h-20 flex items-center justify-center text-xs text-muted-foreground/40">
                  All leads assigned
                </div>
              )}
            </div>
          </div>

          {/* Stage columns */}
          {data.stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              onDrop={handleDrop}
              onDragStart={setDraggingId}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="flex-shrink-0 pt-3 border-t border-border mt-2">
          <p className="text-xs text-muted-foreground">
            <GripVertical className="w-3 h-3 inline mr-1" />
            Drag leads between columns to move them through your pipeline
          </p>
        </div>
      </div>

  );
}
