import { useState } from "react";
import { useRoute } from "wouter";
import {
  useGetLead, getGetLeadQueryKey,
  useUpdateLead, useUpdateLeadScore,
  useListLeadActivities, useCreateLeadActivity, getListLeadActivitiesQueryKey,
  useListLeadNotes, useCreateLeadNote, useDeleteLeadNote, getListLeadNotesQueryKey,
  useListCampaigns,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Mail, Phone, Building2, Briefcase, Zap, Clock, MessageSquare, Activity, Send, Trash2, Edit2, Check, X } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, parseISO } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  new: "hsl(185 100% 50%)",
  contacted: "hsl(280 85% 60%)",
  qualified: "hsl(40 90% 60%)",
  proposal: "hsl(140 70% 50%)",
  converted: "hsl(140 70% 45%)",
  lost: "hsl(350 85% 60%)",
};
const STATUSES = ["new", "contacted", "qualified", "proposal", "converted", "lost"];
const ACTIVITY_TYPES = ["call", "email", "meeting", "note", "demo", "follow_up", "other"];

export default function LeadDetail() {
  const [, params] = useRoute("/leads/:id");
  const id = parseInt(params?.id ?? "0", 10);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [newNote, setNewNote] = useState("");
  const [newActivityType, setNewActivityType] = useState("call");
  const [newActivityDesc, setNewActivityDesc] = useState("");
  const [localScore, setLocalScore] = useState<number | null>(null);

  const { data: lead, isLoading } = useGetLead(id, { query: { enabled: !!id, queryKey: getGetLeadQueryKey(id) } });
  const { data: activities } = useListLeadActivities(id, { query: { enabled: !!id, queryKey: getListLeadActivitiesQueryKey(id) } });
  const { data: notes } = useListLeadNotes(id, { query: { enabled: !!id, queryKey: getListLeadNotesQueryKey(id) } });
  const { data: campaigns } = useListCampaigns();
  const updateLead = useUpdateLead();
  const updateScore = useUpdateLeadScore();
  const createActivity = useCreateLeadActivity();
  const createNote = useCreateLeadNote();
  const deleteNote = useDeleteLeadNote();

  const score = localScore ?? lead?.score ?? 0;
  const scoreColor = score >= 70 ? "hsl(185 100% 50%)" : score >= 40 ? "hsl(40 90% 60%)" : "hsl(215 20% 65%)";

  function startEdit() {
    if (!lead) return;
    setEditForm({
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone ?? "",
      company: lead.company ?? "",
      title: lead.title ?? "",
      source: lead.source ?? "",
      status: lead.status,
      campaignId: lead.campaignId ? String(lead.campaignId) : "",
    });
    setEditMode(true);
  }

  function saveEdit() {
    updateLead.mutate(
      { id, data: { ...editForm, campaignId: editForm.campaignId ? parseInt(editForm.campaignId) : undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
          setEditMode(false);
          toast({ title: "Lead updated" });
        },
      }
    );
  }

  function saveScore() {
    if (localScore === null) return;
    updateScore.mutate(
      { id, data: { score: localScore } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
          setLocalScore(null);
          toast({ title: "Score updated" });
        },
      }
    );
  }

  function addNote() {
    if (!newNote.trim()) return;
    createNote.mutate(
      { id, data: { content: newNote } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLeadNotesQueryKey(id) });
          setNewNote("");
          toast({ title: "Note added" });
        },
      }
    );
  }

  function addActivity() {
    if (!newActivityDesc.trim()) return;
    createActivity.mutate(
      { id, data: { type: newActivityType, description: newActivityDesc } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLeadActivitiesQueryKey(id) });
          setNewActivityDesc("");
          toast({ title: "Activity logged" });
        },
      }
    );
  }

  function removeNote(noteId: number) {
    deleteNote.mutate(
      { leadId: id, noteId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLeadNotesQueryKey(id) });
        },
      }
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="col-span-2 h-64" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!lead) {
    return (
      <Layout>
        <div className="text-center py-20 text-muted-foreground">Lead not found.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/leads">
            <Button variant="ghost" size="icon" className="w-8 h-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground">{lead.firstName} {lead.lastName}</h1>
            <p className="text-xs text-muted-foreground">{lead.title} {lead.company ? `at ${lead.company}` : ""}</p>
          </div>
          <Badge variant="outline" className="capitalize" style={{ borderColor: (STATUS_COLORS[lead.status] ?? "hsl(215 20% 65%)") + "80", color: STATUS_COLORS[lead.status] ?? "hsl(215 20% 65%)" }}>
            {lead.status}
          </Badge>
          {!editMode ? (
            <Button variant="outline" size="sm" onClick={startEdit} className="gap-1.5">
              <Edit2 className="w-3.5 h-3.5" /> Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit} disabled={updateLead.isPending} className="gap-1.5">
                <Check className="w-3.5 h-3.5" /> Save
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditMode(false)} className="gap-1.5">
                <X className="w-3.5 h-3.5" /> Cancel
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left column: info + score */}
          <div className="space-y-4">
            {/* Contact info */}
            <Card className="p-5 border border-border bg-card space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact Info</p>
              {editMode ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">First Name</Label>
                      <Input className="mt-1 h-8 text-sm" value={editForm.firstName} onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Last Name</Label>
                      <Input className="mt-1 h-8 text-sm" value={editForm.lastName} onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))} />
                    </div>
                  </div>
                  {[
                    { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
                    { key: "company", label: "Company" }, { key: "title", label: "Title" },
                    { key: "source", label: "Source" },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <Input className="mt-1 h-8 text-sm" value={editForm[key]} onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))} />
                    </div>
                  ))}
                  <div>
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                      <SelectTrigger className="mt-1 h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Campaign</Label>
                    <Select value={editForm.campaignId || ""} onValueChange={(v) => setEditForm((f) => ({ ...f, campaignId: v }))}>
                      <SelectTrigger className="mt-1 h-8 text-sm">
                        <SelectValue placeholder="No campaign" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">No campaign</SelectItem>
                        {(campaigns ?? []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {[
                    { icon: Mail, label: lead.email },
                    { icon: Phone, label: lead.phone ?? "No phone" },
                    { icon: Building2, label: lead.company ?? "No company" },
                    { icon: Briefcase, label: lead.title ?? "No title" },
                  ].map(({ icon: Icon, label }, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm text-foreground">{label}</span>
                    </div>
                  ))}
                  {lead.source && (
                    <div className="pt-1">
                      <span className="text-xs text-muted-foreground">Source: </span>
                      <span className="text-xs text-foreground capitalize">{lead.source}</span>
                    </div>
                  )}
                  {lead.campaignName && (
                    <div>
                      <span className="text-xs text-muted-foreground">Campaign: </span>
                      <span className="text-xs text-primary">{lead.campaignName}</span>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Score */}
            <Card className="p-5 border border-border bg-card">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lead Score</p>
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <div className="text-5xl font-bold mb-4 text-center" style={{ color: scoreColor }}>{score}</div>
              <Slider
                min={0} max={100} step={1}
                value={[score]}
                onValueChange={([v]) => setLocalScore(v)}
                className="mb-4"
              />
              <div className="flex justify-between text-xs text-muted-foreground mb-4">
                <span>Cold</span><span>Warm</span><span>Hot</span>
              </div>
              {localScore !== null && localScore !== lead.score && (
                <Button size="sm" className="w-full" onClick={saveScore} disabled={updateScore.isPending}>
                  Save Score
                </Button>
              )}
            </Card>
          </div>

          {/* Right column: activity + notes */}
          <div className="lg:col-span-2 space-y-4">
            {/* Log activity */}
            <Card className="p-5 border border-border bg-card">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Log Activity</p>
              <div className="flex gap-2">
                <Select value={newActivityType} onValueChange={setNewActivityType}>
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1 h-9"
                  placeholder="Describe the activity..."
                  value={newActivityDesc}
                  onChange={(e) => setNewActivityDesc(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addActivity()}
                />
                <Button size="sm" className="h-9 px-3" onClick={addActivity} disabled={createActivity.isPending}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </Card>

            {/* Activity timeline */}
            <Card className="p-5 border border-border bg-card">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity Timeline</p>
              </div>
              {(!activities || activities.length === 0) ? (
                <p className="text-xs text-muted-foreground text-center py-6">No activities yet</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {activities.map((a) => (
                    <div key={a.id} className="flex gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground capitalize">{a.type.replace("_", " ")}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(parseISO(a.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Notes */}
            <Card className="p-5 border border-border bg-card">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</p>
              </div>
              <div className="flex gap-2 mb-4">
                <Textarea
                  className="flex-1 text-sm min-h-[60px] resize-none"
                  placeholder="Add a note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                />
                <Button size="sm" className="self-end h-9 px-3" onClick={addNote} disabled={createNote.isPending}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              {(!notes || notes.length === 0) ? (
                <p className="text-xs text-muted-foreground text-center py-4">No notes yet</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {notes.map((n) => (
                    <div key={n.id} className="bg-muted/30 rounded-md p-3 group relative">
                      <p className="text-sm text-foreground pr-6">{n.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(parseISO(n.createdAt), { addSuffix: true })}</p>
                      <Button
                        variant="ghost" size="icon"
                        className="absolute top-2 right-2 w-6 h-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        onClick={() => removeNote(n.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
