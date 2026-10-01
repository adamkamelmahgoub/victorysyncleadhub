import { PageTitle, PageDescription } from "@/components/page-layout";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, Star, GripVertical, LayoutDashboard, Columns3, Trash2, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { asArray } from "@/lib/data-shape";
import { Link } from "wouter";
import {allCampaignContacts,type CampaignContact} from '@/lib/campaign-membership';
import {useQuery} from '@tanstack/react-query';

type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  title?: string;
  score: number;
  status: string;
  pipelineStageId?: string | null;
};

type Pipeline = {
  id: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
};

type Stage = {
  id: string;
  key?: string | null;
  name: string;
  color: string;
  position: number;
  leads: Lead[];
};

type PipelineData = {
  stages: Stage[];
  unassigned: Lead[];
};

const STAGE_COLORS = ["#f97316", "#2563eb", "#16a34a", "#9333ea", "#dc2626", "#0891b2"];

function LeadCard({ lead, onDragStart }: { lead: Lead; onDragStart: (id: string) => void }) {
  return (
    <Link href={`/leads/${lead.id}`}>
      <div
        draggable
        onDragStart={(event) => {
          event.stopPropagation();
          onDragStart(lead.id);
        }}
        className="bg-background border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow-sm transition-all group"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-foreground text-sm truncate">
              {lead.firstName} {lead.lastName}
            </div>
            {lead.title && <div className="text-xs text-muted-foreground truncate mt-0.5">{lead.title}</div>}
            {lead.company && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                <Building2 className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{lead.company}</span>
              </div>
            )}
          </div>
          {lead.score > 0 && (
            <div className="flex items-center gap-0.5 text-xs text-amber-600 flex-shrink-0">
              <Star className="w-3 h-3 fill-current" />
              <span>{lead.score}</span>
            </div>
          )}
        </div>
        <Badge variant="outline" className="mt-3 text-[10px] h-5 capitalize">
          {lead.status}
        </Badge>
      </div>
    </Link>
  );
}

function StageColumn({
  stage,
  onDrop,
  onDragStart,
}: {
  stage: Stage;
  onDrop: (stageId: string) => void;
  onDragStart: (id: string) => void;
}) {
  const [over, setOver] = useState(false);
  const stageLeads = asArray<Lead>(stage.leads);

  return (
    <div
      className="flex-shrink-0 w-72 flex flex-col"
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={() => {
        setOver(false);
        onDrop(stage.id);
      }}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
          <span className="font-semibold text-foreground text-sm truncate">{stage.name}</span>
        </div>
        <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
          {stageLeads.length}
        </Badge>
      </div>
      <div
        className={`flex-1 rounded-lg border p-2 space-y-2 min-h-[360px] transition-colors ${
          over ? "border-primary/60 bg-primary/5" : "border-border bg-card"
        }`}
      >
        {stageLeads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onDragStart={onDragStart} />
        ))}
        {stageLeads.length === 0 && (
          <div className="h-28 flex items-center justify-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
            Drop contacts here
          </div>
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [data, setData] = useState<PipelineData>({ stages: [], unassigned: [] });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pendingMeetingDrop, setPendingMeetingDrop] = useState<{ leadId: string; stageId: string } | null>(null);
  const [meetingLocal, setMeetingLocal] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPipelineDialog, setShowPipelineDialog] = useState(false);
  const [showStageDialog, setShowStageDialog] = useState(false);
  const [showContactsDialog,setShowContactsDialog]=useState(false);
  const [newPipeline, setNewPipeline] = useState({ name: "", description: "",initialStage:"New opportunity" });
  const [newStage, setNewStage] = useState({ name: "", color: STAGE_COLORS[0] });
  const [pipelineError, setPipelineError] = useState("");
  const [stageError, setStageError] = useState("");
  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const [creatingStage, setCreatingStage] = useState(false);
  const [deletingPipeline, setDeletingPipeline] = useState(false);
  const [contactSearch,setContactSearch]=useState('');const [selectedLeadIds,setSelectedLeadIds]=useState<string[]>([]);const [targetStageId,setTargetStageId]=useState('');const [assigning,setAssigning]=useState(false);
  const { toast } = useToast();
  const { role } = useAuth();
  const {data:contactData,isFetching:contactsLoading,error:contactsError}=useQuery({queryKey:['pipeline-all-contacts'],enabled:showContactsDialog||showPipelineDialog,queryFn:({signal})=>allCampaignContacts(apiFetch,signal)});
  const selectableContacts=useMemo(()=>asArray<CampaignContact>(contactData?.leads).filter(l=>[l.firstName,l.lastName,l.email,l.company].join(' ').toLowerCase().includes(contactSearch.toLowerCase())),[contactData,contactSearch]);

  const selectedPipeline = useMemo(
    () => pipelines.find((pipeline) => pipeline.id === selectedPipelineId),
    [pipelines, selectedPipelineId],
  );

  const loadPipelines = useCallback(async () => {
    const rows = asArray<Pipeline>(await apiFetch("/api/pipelines"));
    setPipelines(rows);
    setSelectedPipelineId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id || "");
    return rows;
  }, []);

  const loadBoard = useCallback(async (pipelineId: string) => {
    setLoading(true);
    try {
      const result = await apiFetch(`/api/pipeline/leads${pipelineId ? `?pipelineId=${pipelineId}` : ""}`) as Partial<PipelineData>;
      setData({
        stages: asArray<Stage>(result.stages).map((stage) => ({ ...stage, leads: asArray<Lead>(stage.leads) })),
        unassigned: asArray<Lead>(result.unassigned),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPipelines();
  }, [loadPipelines]);

  useEffect(() => {
    loadBoard(selectedPipelineId);
  }, [loadBoard, selectedPipelineId]);

  async function deletePipeline() {
    if (!selectedPipeline || !window.confirm(`Delete "${selectedPipeline.name}" and its stages? Contacts will be preserved and become unassigned.`)) return;
    setDeletingPipeline(true);
    try {
      await apiFetch(`/api/pipelines/${selectedPipeline.id}`, { method: "DELETE" });
      const remaining = await loadPipelines();
      setSelectedPipelineId(remaining[0]?.id || "");
      await loadBoard(remaining[0]?.id || "");
      toast({ title: "Pipeline deleted", description: "Contacts were preserved." });
    } catch (error) {
      toast({ title: "Could not delete pipeline", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally { setDeletingPipeline(false); }
  }

  async function createPipeline() {
    if (!newPipeline.name.trim()) return;
    setPipelineError("");
    setCreatingPipeline(true);
    try {
      const pipeline = await apiFetch("/api/pipelines", {
        method: "POST",
        body: JSON.stringify({ name: newPipeline.name.trim(), description: newPipeline.description.trim() || null }),
      }) as Pipeline;
      const stage=await apiFetch('/api/pipeline/stages',{method:'POST',body:JSON.stringify({name:newPipeline.initialStage.trim()||'New opportunity',color:STAGE_COLORS[0],pipelineId:pipeline.id,position:0})}) as Stage;
      if(selectedLeadIds.length)await apiFetch('/api/pipeline/leads/stage',{method:'PATCH',body:JSON.stringify({leadIds:selectedLeadIds,stageId:stage.id,pipelineId:pipeline.id})});
      setShowPipelineDialog(false);
      setNewPipeline({ name: "", description: "",initialStage:"New opportunity" });setSelectedLeadIds([]);setContactSearch('');
      await loadPipelines();
      setSelectedPipelineId(pipeline.id);
      toast({ title: "Pipeline created" });
    } catch (error) {
      setPipelineError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreatingPipeline(false);
    }
  }

  async function assignSelected(){if(!selectedLeadIds.length||!targetStageId)return;const meeting=data.stages.some(stage=>stage.id===targetStageId&&stage.key==='meeting_booked');if(meeting&&!meetingLocal)return;setAssigning(true);try{const result=await apiFetch('/api/pipeline/leads/stage',{method:'PATCH',body:JSON.stringify({leadIds:selectedLeadIds,stageId:targetStageId,pipelineId:selectedPipelineId,...(meeting?{meetingAt:new Date(meetingLocal).toISOString(),meetingTimezone:Intl.DateTimeFormat().resolvedOptions().timeZone}:{})})}) as {updated:number};setShowContactsDialog(false);setSelectedLeadIds([]);setContactSearch('');setMeetingLocal('');await loadBoard(selectedPipelineId);toast({title:`${result.updated} contacts added to the pipeline`});}finally{setAssigning(false);}}

  async function createStage() {
    if (!newStage.name.trim() || !selectedPipelineId) return;
    if (newStage.name.trim().toLowerCase() === "meeting booked") { setStageError("Meeting Booked already exists in this pipeline"); return; }
    setStageError("");
    setCreatingStage(true);
    try {
      await apiFetch("/api/pipeline/stages", {
        method: "POST",
        body: JSON.stringify({
          name: newStage.name.trim(),
          color: newStage.color,
          pipelineId: selectedPipelineId,
          position: data.stages.length,
        }),
      });
      setShowStageDialog(false);
      setNewStage({ name: "", color: STAGE_COLORS[0] });
      await loadBoard(selectedPipelineId);
      toast({ title: "Stage added" });
    } catch (error) {
      setStageError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreatingStage(false);
    }
  }

  async function handleDrop(stageId: string | null) {
    if (!draggingId) return;
    const leadId = draggingId;
    setDraggingId(null);
    if (data.stages.some(stage => stage.id === stageId && stage.key === "meeting_booked")) {
      setPendingMeetingDrop({ leadId, stageId: stageId! }); return;
    }
    try {
      await apiFetch(`/api/pipeline/leads/${leadId}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stageId }),
      });
      loadBoard(selectedPipelineId);
    } catch {
      toast({ title: "Failed to move contact", variant: "destructive" });
    }
  }

  async function saveMeetingDrop() {
    if (!pendingMeetingDrop || !meetingLocal) return;
    try {
      await apiFetch(`/api/pipeline/leads/${pendingMeetingDrop.leadId}/stage`, { method: "PATCH", body: JSON.stringify({
        stageId: pendingMeetingDrop.stageId, meetingAt: new Date(meetingLocal).toISOString(),
        meetingTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }) });
      setPendingMeetingDrop(null); setMeetingLocal(""); await loadBoard(selectedPipelineId);
      toast({ title: "Meeting booked" });
    } catch (error) { toast({ title: "Could not book meeting", description: String(error), variant: "destructive" }); }
  }

  const totalLeads = data.stages.reduce((sum, stage) => sum + stage.leads.length, 0) + data.unassigned.length;

  if (role === "client") return <div className="page-stack"><PageTitle>Pipeline</PageTitle><div className="flex gap-4 overflow-x-auto">{data.stages.map(stage => <section key={stage.id} className="min-w-64 rounded-lg border bg-white p-4"><h2 className="font-semibold">{stage.name}</h2><div className="mt-3 space-y-2">{stage.leads.map(lead => <Link key={lead.id} href={`/leadgen/leads/${lead.id}`}><div className="rounded border p-3 text-sm">{lead.firstName} {lead.lastName}<span className="block text-xs text-muted-foreground">{lead.company || "N/A"}</span></div></Link>)}</div></section>)}</div></div>;

  return (
    <div className="page-stack h-full flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap min-w-0">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <LayoutDashboard className="w-4 h-4" />
            CRM
          </div>
          <PageTitle>Deals / Pipeline</PageTitle>
          <PageDescription>
            {totalLeads} contacts across {data.stages.length} stages{selectedPipeline ? ` in ${selectedPipeline.name}` : ""}
          </PageDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={deletePipeline} disabled={!selectedPipelineId || deletingPipeline}>
            <Trash2 className="w-4 h-4 mr-1.5" />{deletingPipeline ? "Deleting..." : "Delete pipeline"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPipelineDialog(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Pipeline
          </Button>
          <Button variant="outline" size="sm" onClick={()=>{setTargetStageId(data.stages[0]?.id??'');setSelectedLeadIds([]);setShowContactsDialog(true);}} disabled={!selectedPipelineId||!data.stages.length}><Users className="w-4 h-4 mr-1.5"/>Choose contacts</Button>
          <Button size="sm" onClick={() => setShowStageDialog(true)} disabled={!selectedPipelineId}>
            <Plus className="w-4 h-4 mr-1.5" /> Stage
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 workspace-panel px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Columns3 className="w-4 h-4 text-muted-foreground" />
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">Pipeline</Label>
          <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
            <SelectTrigger className="w-full min-w-0 sm:w-64 h-10">
              <SelectValue placeholder="Create your first pipeline" />
            </SelectTrigger>
            <SelectContent>
              {pipelines.map((pipeline) => (
                <SelectItem key={pipeline.id} value={pipeline.id}>{pipeline.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground">
          <GripVertical className="w-3 h-3 inline mr-1" />
          Drag contacts between stages
        </div>
      </div>

      {pipelines.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <h2 className="font-semibold text-foreground">Create your first pipeline</h2>
          <p className="text-sm text-muted-foreground mt-1">Build separate sales processes for different teams, services, or client types.</p>
          <Button className="mt-4" onClick={() => setShowPipelineDialog(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Create pipeline
          </Button>
        </div>
      ) : loading ? (
        <div className="p-8 text-sm text-muted-foreground">Loading pipeline...</div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          <div
            className="flex-shrink-0 w-72 flex flex-col"
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => handleDrop(null)}
          >
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="font-semibold text-muted-foreground text-sm">Unassigned</span>
              <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">{data.unassigned.length}</Badge>
            </div>
            <div className="flex-1 workspace-panel p-2 space-y-2 min-h-[360px]">
              {data.unassigned.map((lead) => (
                <LeadCard key={lead.id} lead={lead} onDragStart={setDraggingId} />
              ))}
              {data.unassigned.length === 0 && (
                <div className="h-28 flex items-center justify-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                  No unassigned contacts
                </div>
              )}
            </div>
          </div>

          {data.stages.map((stage) => (
            <StageColumn key={stage.id} stage={stage} onDrop={handleDrop} onDragStart={setDraggingId} />
          ))}

          {data.stages.length === 0 && (
            <button
              onClick={() => setShowStageDialog(true)}
              className="w-72 min-h-[360px] rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
            >
              Add the first stage
            </button>
          )}
        </div>
      )}

      <Dialog open={showPipelineDialog} onOpenChange={setShowPipelineDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create pipeline</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Pipeline name</Label>
              <Input className="mt-1" value={newPipeline.name} onChange={(e) => setNewPipeline((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input className="mt-1" value={newPipeline.description} onChange={(e) => setNewPipeline((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowPipelineDialog(false)}>Cancel</Button>
              <Button onClick={createPipeline} disabled={!newPipeline.name.trim() || creatingPipeline}>{creatingPipeline ? "Creating..." : "Create"}</Button>
            </div>
            <div><Label className="text-xs text-muted-foreground">First stage</Label><Input className="mt-1" value={newPipeline.initialStage} onChange={e=>setNewPipeline(p=>({...p,initialStage:e.target.value}))}/></div>
            <ContactPicker contacts={selectableContacts} loading={contactsLoading} error={contactsError instanceof Error?contactsError.message:''} search={contactSearch} setSearch={setContactSearch} selected={selectedLeadIds} setSelected={setSelectedLeadIds}/>
            {pipelineError && <p className="text-sm text-red-600">{pipelineError}</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showContactsDialog} onOpenChange={setShowContactsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Choose contacts for {selectedPipeline?.name}</DialogTitle></DialogHeader>
          <div><Label>Add selected contacts to</Label><Select value={targetStageId} onValueChange={setTargetStageId}><SelectTrigger><SelectValue placeholder="Choose a stage" /></SelectTrigger><SelectContent>{data.stages.map(stage => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectContent></Select></div>
          {data.stages.some(stage => stage.id === targetStageId && stage.key === "meeting_booked") && <label className="text-sm font-medium">Meeting date and time<input type="datetime-local" required className="mt-1 block rounded border p-2" value={meetingLocal} onChange={event => setMeetingLocal(event.target.value)} /></label>}
          <ContactPicker contacts={selectableContacts} loading={contactsLoading} error={contactsError instanceof Error ? contactsError.message : ""} search={contactSearch} setSearch={setContactSearch} selected={selectedLeadIds} setSelected={setSelectedLeadIds} />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowContactsDialog(false)}>Cancel</Button><Button onClick={assignSelected} disabled={!selectedLeadIds.length || !targetStageId || assigning || (data.stages.some(stage => stage.id === targetStageId && stage.key === "meeting_booked") && !meetingLocal)}>{assigning ? "Adding..." : `Add ${selectedLeadIds.length} contacts`}</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingMeetingDrop} onOpenChange={open => { if (!open) setPendingMeetingDrop(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Book meeting</DialogTitle></DialogHeader>
          <label className="text-sm font-medium">Meeting date and time<input type="datetime-local" required className="mt-1 block rounded border p-2" value={meetingLocal} onChange={event => setMeetingLocal(event.target.value)} /></label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPendingMeetingDrop(null)}>Cancel</Button><Button disabled={!meetingLocal} onClick={() => void saveMeetingDrop()}>Book meeting</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={showStageDialog} onOpenChange={setShowStageDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add stage</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Stage name</Label>
              <Input className="mt-1" value={newStage.name} onChange={(e) => setNewStage((s) => ({ ...s, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Color</Label>
              <div className="flex gap-2 mt-2">
                {STAGE_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewStage((s) => ({ ...s, color }))}
                    className={`w-8 h-8 rounded-full border ${newStage.color === color ? "ring-2 ring-offset-2 ring-primary" : "border-border"}`}
                    style={{ backgroundColor: color }}
                    aria-label={color}
                  />
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowStageDialog(false)}>Cancel</Button>
              <Button onClick={createStage} disabled={!newStage.name.trim() || !selectedPipelineId || creatingStage}>{creatingStage ? "Adding..." : "Add stage"}</Button>
            </div>
            {stageError && <p className="text-sm text-red-600">{stageError}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContactPicker({contacts,loading,error,search,setSearch,selected,setSelected}:{contacts:CampaignContact[];loading:boolean;error:string;search:string;setSearch:(v:string)=>void;selected:string[];setSelected:(v:string[])=>void}){const visible=contacts.slice(0,500);const allSelected=visible.length>0&&visible.every(l=>selected.includes(String(l.id)));return <div className="space-y-2"><div className="flex flex-wrap gap-2"><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search contacts by name, email, or company"/><Button type="button" variant="outline" onClick={()=>setSelected(allSelected?selected.filter(id=>!visible.some(l=>String(l.id)===id)):[...new Set([...selected,...visible.map(l=>String(l.id))])])}>{allSelected?'Clear shown':`Select shown (${visible.length})`}</Button></div><p className="text-xs text-muted-foreground">{selected.length} selected. Selecting a contact already in another pipeline moves it to this pipeline.</p>{loading&&<p className="text-sm">Loading all contacts...</p>}{error&&<p className="text-sm text-red-600">{error}</p>}<div className="max-h-64 overflow-y-auto rounded border p-2">{visible.map(l=>{const id=String(l.id);return <label key={id} className="flex items-center gap-3 border-b px-2 py-2 text-sm last:border-0"><input type="checkbox" checked={selected.includes(id)} onChange={e=>setSelected(e.target.checked?[...selected,id]:selected.filter(x=>x!==id))}/><span className="min-w-0"><span className="font-medium">{l.firstName} {l.lastName}</span><span className="block truncate text-xs text-muted-foreground">{l.email}{l.company?` · ${l.company}`:''}</span></span></label>;})}{!loading&&!visible.length&&<p className="p-4 text-center text-sm text-muted-foreground">No matching contacts.</p>}</div>{contacts.length>500&&<p className="text-xs text-muted-foreground">Refine your search to narrow the {contacts.length} matching contacts.</p>}</div>;}
