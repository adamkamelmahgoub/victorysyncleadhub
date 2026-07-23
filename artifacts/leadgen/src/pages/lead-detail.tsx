import { useState, useEffect, useRef } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetLead, getGetLeadQueryKey,
  useUpdateLead, useUpdateLeadScore,
  useListLeadActivities, useCreateLeadActivity, getListLeadActivitiesQueryKey,
  useListLeadNotes, useCreateLeadNote, useDeleteLeadNote, getListLeadNotesQueryKey,
  useListCampaigns,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { formatDistanceToNow, parseISO, format, isToday, isYesterday } from "date-fns";
import {
  ArrowLeft, Mail, Phone, Building2, Briefcase, Globe, Linkedin,
  Twitter, MapPin, Clock, Tag, CheckCircle2, Circle, Trash2, Edit3,
  Send, Plus, ChevronDown, ChevronRight, Activity, MessageSquare, Check,
  X, Zap, User, Calendar, Star, AlertTriangle, TrendingUp, ExternalLink,
  MoreHorizontal, Target, PhoneCall, AtSign, Layers, FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { asArray, type ArrayElement } from "@/lib/data-shape";

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = ["new", "contacted", "qualified", "proposal", "converted", "lost"] as const;
const ACTIVITY_TYPES = ["call", "email", "meeting", "demo", "follow_up", "text", "linkedin", "other"] as const;
const PRIORITY_OPTIONS = ["low", "medium", "high"] as const;

const STATUS_STYLES: Record<string, string> = {
  new: "bg-sky-100 text-sky-700 border-sky-200",
  contacted: "bg-violet-100 text-violet-700 border-violet-200",
  qualified: "bg-amber-100 text-amber-700 border-amber-200",
  proposal: "bg-blue-100 text-blue-700 border-blue-200",
  converted: "bg-green-100 text-green-700 border-green-200",
  lost: "bg-red-100 text-red-700 border-red-200",
};

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  call: PhoneCall,
  email: Mail,
  meeting: Calendar,
  demo: Layers,
  follow_up: TrendingUp,
  text: MessageSquare,
  linkedin: Linkedin,
  note: MessageSquare,
  other: Activity,
  status_changed: Target,
  score_updated: Star,
};

const ACTIVITY_COLORS: Record<string, string> = {
  call: "bg-blue-100 text-blue-600",
  email: "bg-purple-100 text-purple-600",
  meeting: "bg-green-100 text-green-600",
  demo: "bg-orange-100 text-orange-600",
  follow_up: "bg-amber-100 text-amber-600",
  text: "bg-sky-100 text-sky-600",
  linkedin: "bg-blue-100 text-blue-700",
  note: "bg-gray-100 text-gray-600",
  other: "bg-gray-100 text-gray-500",
  status_changed: "bg-indigo-100 text-indigo-600",
  score_updated: "bg-yellow-100 text-yellow-600",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "text-gray-500 bg-gray-100 border-gray-200",
  medium: "text-amber-600 bg-amber-50 border-amber-200",
  high: "text-red-600 bg-red-50 border-red-200",
};

interface PipelineStage { id: number; name: string; color: string; position: number; }
interface ContactTask {
  id: number; leadId: number; title: string; description?: string;
  dueDate?: string; isCompleted: boolean; completedAt?: string; priority: string; createdAt: string;
}

// ── Avatar ────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-indigo-500", "bg-cyan-500", "bg-fuchsia-500",
];
function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

// ── Score Ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 28, c = 2 * Math.PI * r;
  const pct = score / 100;
  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#64748b";
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="rotate-[-90deg]">
      <circle cx="36" cy="36" r={r} strokeWidth="6" className="fill-none stroke-muted/30" />
      <circle cx="36" cy="36" r={r} strokeWidth="6" fill="none" stroke={color} strokeLinecap="round"
        strokeDasharray={`${c} ${c}`} strokeDashoffset={c - pct * c} style={{ transition: "stroke-dashoffset 0.5s" }} />
      <text x="36" y="36" textAnchor="middle" dominantBaseline="central" className="rotate-90" fill={color}
        fontSize="15" fontWeight="700" style={{ transform: "rotate(90deg)", transformOrigin: "36px 36px" }}>
        {score}
      </text>
    </svg>
  );
}

// ── Date grouping ─────────────────────────────────────────────────────────────
function friendlyDate(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMMM d, yyyy");
}

function groupByDate<T extends { createdAt: string }>(items: T[]) {
  const groups: Record<string, T[]> = {};
  for (const item of [...items].sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime())) {
    const day = format(parseISO(item.createdAt), "yyyy-MM-dd");
    groups[day] ??= [];
    groups[day]!.push(item);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

// ── Collapsible sidebar section ───────────────────────────────────────────────
function SideSection({ title, icon: Icon, children, defaultOpen = true }: {
  title: string; icon: React.ElementType; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-0 pb-4 last:pb-0">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full py-2 group">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground">{title}</span>
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="pt-1 space-y-2">{children}</div>}
    </div>
  );
}

// ── Editable field ────────────────────────────────────────────────────────────
function EditableField({ label, value, placeholder, onSave, type = "text", icon: Icon }: {
  label: string; value: string; placeholder?: string; onSave: (v: string) => void;
  type?: string; icon?: React.ElementType;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  function save() { onSave(draft); setEditing(false); }
  function cancel() { setDraft(value); setEditing(false); }

  return (
    <div className="group">
      {!editing ? (
        <div
          className="flex items-center gap-2 py-1 px-2 rounded-lg -mx-2 hover:bg-muted/60 cursor-pointer transition-colors"
          onClick={() => { setDraft(value); setEditing(true); }}
        >
          {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted-foreground">{label}</div>
            <div className="text-sm text-foreground truncate">{value || <span className="text-muted-foreground/50 italic">{placeholder ?? "Not set"}</span>}</div>
          </div>
          <Edit3 className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0" />
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-[10px] text-muted-foreground">{label}</div>
          <div className="flex items-center gap-1">
            <input
              ref={ref}
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
              className="flex-1 px-2 py-1 text-sm border border-primary/50 rounded outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button onClick={save} className="p-1 rounded bg-primary text-white hover:bg-primary/90"><Check className="w-3 h-3" /></button>
            <button onClick={cancel} className="p-1 rounded border border-border text-muted-foreground hover:bg-muted"><X className="w-3 h-3" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
type Tab = "timeline" | "notes" | "tasks" | "details";

export default function LeadDetail() {
  const [, params] = useRoute("/leads/:id");
  const id = params?.id ?? "";
  const apiId = id as unknown as number;
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>("timeline");
  const [newNote, setNewNote] = useState("");
  const [newActivityType, setNewActivityType] = useState<typeof ACTIVITY_TYPES[number]>("call");
  const [newActivityDesc, setNewActivityDesc] = useState("");
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", dueDate: "", priority: "medium" as typeof PRIORITY_OPTIONS[number] });
  const [editingStatus, setEditingStatus] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [localScore, setLocalScore] = useState<number | null>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const { data: lead, isLoading } = useGetLead(apiId, { query: { enabled: !!id, queryKey: getGetLeadQueryKey(apiId) } });
  const { data: activitiesResponse = [] } = useListLeadActivities(apiId, { query: { enabled: !!id, queryKey: getListLeadActivitiesQueryKey(apiId) } });
  const { data: notesResponse = [] } = useListLeadNotes(apiId, { query: { enabled: !!id, queryKey: getListLeadNotesQueryKey(apiId) } });
  const { data: campaignsResponse = [] } = useListCampaigns();
  const { data: stagesResponse = [] } = useQuery<PipelineStage[]>({ queryKey: ["pipeline-stages"], queryFn: () => apiFetch("/api/pipeline/stages") });
  const { data: dispositionsResponse = [] } = useQuery<{ id: number; name: string; color: string }[]>({ queryKey: ["dispositions"], queryFn: () => apiFetch("/dispositions") });
  const { data: tasksResponse = [], refetch: refetchTasks } = useQuery<ContactTask[]>({
    queryKey: ["contact-tasks", id],
    queryFn: () => apiFetch(`/api/leads/${id}/tasks`),
    enabled: !!id,
  });
  const stages = asArray<PipelineStage>(stagesResponse);
  const tasks = asArray<ContactTask>(tasksResponse);
  const activities = asArray<ArrayElement<NonNullable<typeof activitiesResponse>>>(activitiesResponse);
  const notes = asArray<ArrayElement<NonNullable<typeof notesResponse>>>(notesResponse);
  const campaigns = asArray<ArrayElement<NonNullable<typeof campaignsResponse>>>(campaignsResponse);
  const dispositions = asArray<{ id: number; name: string; color: string }>(dispositionsResponse);

  const updateLead = useUpdateLead();
  const updateScore = useUpdateLeadScore();
  const createActivity = useCreateLeadActivity();
  const createNote = useCreateLeadNote();
  const deleteNote = useDeleteLeadNote();

  const createTask = useMutation({
    mutationFn: (body: object) => apiFetch(`/api/leads/${id}/tasks`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { refetchTasks(); setShowAddTask(false); setNewTask({ title: "", description: "", dueDate: "", priority: "medium" }); toast({ title: "Task added" }); },
  });

  const updateTask = useMutation({
    mutationFn: ({ taskId, ...body }: { taskId: number } & Record<string, unknown>) => apiFetch(`/api/leads/${id}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => refetchTasks(),
  });

  const deleteTask = useMutation({
    mutationFn: (taskId: number) => apiFetch(`/api/leads/${id}/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: () => refetchTasks(),
  });

  const score = localScore ?? lead?.score ?? 0;
  const customFields = (lead?.customFields ?? {}) as Record<string, string | boolean>;

  function saveField(key: string, value: string) {
    if (["firstName", "lastName", "email", "phone", "company", "title", "source"].includes(key)) {
      updateLead.mutate({ id: apiId, data: { [key]: value } as Parameters<typeof updateLead.mutate>[0]["data"] }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getGetLeadQueryKey(apiId) }); toast({ title: "Saved" }); },
      });
    } else {
      updateLead.mutate({ id: apiId, data: { customFields: { ...customFields, [key]: value } } as Parameters<typeof updateLead.mutate>[0]["data"] }, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: getGetLeadQueryKey(apiId) }); toast({ title: "Saved" }); },
      });
    }
  }

  function saveStatus(status: string) {
    updateLead.mutate({ id: apiId, data: { status } as Parameters<typeof updateLead.mutate>[0]["data"] }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetLeadQueryKey(apiId) }); setEditingStatus(false); },
    });
  }

  function saveScore() {
    if (localScore === null) return;
    updateScore.mutate({ id: apiId, data: { score: localScore } }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetLeadQueryKey(apiId) }); setLocalScore(null); toast({ title: "Score updated" }); },
    });
  }

  function addTag() {
    const tag = newTag.trim().toLowerCase();
    if (!tag || !lead) return;
    const tags = [...asArray<string>(lead.tags), tag];
    updateLead.mutate({ id: apiId, data: { tags } as Parameters<typeof updateLead.mutate>[0]["data"] }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getGetLeadQueryKey(apiId) }); setNewTag(""); setAddingTag(false); },
    });
  }

  function removeTag(tag: string) {
    if (!lead) return;
    const tags = asArray<string>(lead.tags).filter((t) => t !== tag);
    updateLead.mutate({ id: apiId, data: { tags } as Parameters<typeof updateLead.mutate>[0]["data"] }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetLeadQueryKey(apiId) }),
    });
  }

  function addActivity() {
    if (!newActivityDesc.trim()) return;
    createActivity.mutate({ id: apiId, data: { type: newActivityType, description: newActivityDesc } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListLeadActivitiesQueryKey(apiId) });
        if (newActivityType === "call") {
          updateLead.mutate({ id: apiId, data: { contactAttempts: (lead?.contactAttempts ?? 0) + 1 } });
          qc.invalidateQueries({ queryKey: getGetLeadQueryKey(apiId) });
        }
        setNewActivityDesc("");
        toast({ title: "Activity logged" });
      },
    });
  }

  function addNote() {
    if (!newNote.trim()) return;
    createNote.mutate({ id: apiId, data: { content: newNote } }, {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListLeadNotesQueryKey(apiId) }); setNewNote(""); toast({ title: "Note added" }); },
    });
  }

  // Build merged timeline
  const timelineItems = [
    ...activities.map((a) => ({ ...a, _type: "activity" as const })),
    ...notes.map((n) => ({ id: n.id, type: "note", description: n.content, createdAt: n.createdAt, _type: "note" as const })),
  ];

  const currentStage = stages.find((s) => s.id === lead?.pipelineStageId);

  if (isLoading) {
    return (

        <div className="space-y-4">
          <Skeleton className="h-32 rounded-2xl" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-96 rounded-xl" />
            <Skeleton className="col-span-2 h-96 rounded-xl" />
          </div>
        </div>

    );
  }

  if (!lead) {
    return (

        <div className="text-center py-20 text-muted-foreground">Contact not found.</div>

    );
  }

  const fullName = `${lead.firstName} ${lead.lastName}`;
  const avatarColor = getAvatarColor(fullName);
  const initials = `${lead.firstName[0] ?? ""}${lead.lastName[0] ?? ""}`.toUpperCase();
  const cf = customFields;
  const importedCustomFields = Object.entries(cf).filter(([key]) => ![
    "industry", "annualRevenue", "employeeCount", "city", "state", "country", "timezone",
    "website", "linkedinUrl", "twitterUrl", "assignedTo", "doNotEmail", "doNotSms",
  ].includes(key));

  return (

      <div className="space-y-4">
        {/* ── Back nav ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
            <Link href="/leads">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" /> Contacts
            </button>
          </Link>
          <span className="text-muted-foreground/40">›</span>
          <span className="text-sm text-foreground">{fullName}</span>
        </div>

        {/* ── Hero header ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          {/* Color accent bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-primary via-primary/60 to-primary/20" />
          <div className="p-6">
            <div className="flex items-start gap-5">
              {/* Avatar */}
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0 ${avatarColor} shadow-sm`}>
                {initials}
              </div>

              {/* Identity */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3 flex-wrap">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground leading-tight">{fullName}</h1>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5 flex-wrap">
                      {lead.title && <span>{lead.title}</span>}
                      {lead.title && lead.company && <span className="text-muted-foreground/40">·</span>}
                      {lead.company && <span className="font-medium text-foreground">{lead.company}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {/* Status badge (editable) */}
                      {editingStatus ? (
                        <div className="flex gap-1 flex-wrap">
                          {STATUS_OPTIONS.map((s) => (
                            <button key={s} onClick={() => saveStatus(s)} className={`px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize transition-all ${STATUS_STYLES[s]} ${lead.status === s ? "ring-2 ring-offset-1 ring-primary" : "hover:opacity-80"}`}>{s}</button>
                          ))}
                          <button onClick={() => setEditingStatus(false)} className="p-0.5 rounded text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                        </div>
                      ) : (
                        <button onClick={() => setEditingStatus(true)} className={`px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize hover:opacity-80 transition-opacity ${STATUS_STYLES[lead.status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                          {lead.status}
                        </button>
                      )}
                      {lead.source && <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{lead.source}</span>}
                      {(cf.doNotEmail === true || cf.doNotEmail === "true") && (
                        <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Do Not Email</span>
                      )}
                      {(cf.doNotSms === true || cf.doNotSms === "true") && (
                        <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Do Not SMS</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Score ring */}
              <div className="flex-shrink-0 text-center">
                <div className="relative inline-block">
                  <ScoreRing score={score} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Lead Score</div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 mt-5 flex-wrap">
              <a href={`mailto:${lead.email}`} className="flex items-center gap-2 px-3.5 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary/90 transition-colors">
                <Mail className="w-3.5 h-3.5" /> Send Email
              </a>
              {lead.phone && (
                <a href={`tel:${lead.phone}`} className="flex items-center gap-2 px-3.5 py-2 border border-border text-sm font-medium rounded-xl hover:bg-muted transition-colors text-foreground">
                  <Phone className="w-3.5 h-3.5" /> Call
                </a>
              )}
              {cf.linkedinUrl && (
                <a href={String(cf.linkedinUrl)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3.5 py-2 border border-border text-sm font-medium rounded-xl hover:bg-muted transition-colors text-foreground">
                  <Linkedin className="w-3.5 h-3.5" /> LinkedIn
                </a>
              )}
              <button onClick={() => { setTab("tasks"); setShowAddTask(true); }} className="flex items-center gap-2 px-3.5 py-2 border border-border text-sm font-medium rounded-xl hover:bg-muted transition-colors text-foreground">
                <CheckCircle2 className="w-3.5 h-3.5" /> Add Task
              </button>
              <button onClick={() => setTab("timeline")} className="flex items-center gap-2 px-3.5 py-2 border border-border text-sm font-medium rounded-xl hover:bg-muted transition-colors text-foreground">
                <Activity className="w-3.5 h-3.5" /> Log Activity
              </button>
              <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                Added {formatDistanceToNow(parseISO(lead.createdAt), { addSuffix: true })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Body: sidebar + content ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 items-start">
          {/* ── Left sidebar ─────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-border shadow-sm p-5 space-y-4">

            {/* Contact Details */}
            <SideSection title="Contact" icon={User}>
              <EditableField label="First Name" value={lead.firstName} onSave={(v) => saveField("firstName", v)} />
              <EditableField label="Last Name" value={lead.lastName} onSave={(v) => saveField("lastName", v)} />
              <EditableField label="Email" value={lead.email} icon={Mail} type="email" onSave={(v) => saveField("email", v)} />
              <EditableField label="Phone" value={lead.phone ?? ""} icon={Phone} placeholder="Add phone" type="tel" onSave={(v) => saveField("phone", v)} />
              <EditableField label="Title" value={lead.title ?? ""} icon={Briefcase} placeholder="Job title" onSave={(v) => saveField("title", v)} />
              <div className="px-2 py-1">
                <div className="text-[10px] text-muted-foreground mb-1">Disposition</div>
                <select value={lead.disposition ?? ""} onChange={(event) => updateLead.mutate({ id: apiId, data: { disposition: event.target.value } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetLeadQueryKey(apiId) }) })} className="w-full rounded-lg border border-border px-2 py-1.5 text-sm">
                  <option value="">No disposition</option>
                  {dispositions.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                </select>
              </div>
              <EditableField label="Times Contacted" value={String(lead.contactAttempts)} icon={PhoneCall} type="number" onSave={(value) => updateLead.mutate({ id: apiId, data: { contactAttempts: Math.max(0, Number.parseInt(value, 10) || 0) } }, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetLeadQueryKey(apiId) }) })} />
            </SideSection>

            {/* Company */}
            <SideSection title="Company" icon={Building2}>
              <EditableField label="Company" value={lead.company ?? ""} icon={Building2} placeholder="Company name" onSave={(v) => saveField("company", v)} />
              <EditableField label="Industry" value={String(cf.industry ?? "")} placeholder="e.g. SaaS, Healthcare" onSave={(v) => saveField("industry", v)} />
              <EditableField label="Annual Revenue" value={String(cf.annualRevenue ?? "")} icon={TrendingUp} placeholder="e.g. $1M–$5M" onSave={(v) => saveField("annualRevenue", v)} />
              <EditableField label="Employees" value={String(cf.employeeCount ?? "")} icon={User} placeholder="e.g. 50–200" onSave={(v) => saveField("employeeCount", v)} />
              {lead.campaignName && (
                <div className="flex items-center gap-2 py-1 px-2 -mx-2">
                  <Zap className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="text-[10px] text-muted-foreground">Campaign</div>
                    <div className="text-sm text-primary">{lead.campaignName}</div>
                  </div>
                </div>
              )}
            </SideSection>

            {/* Location */}
            <SideSection title="Location" icon={MapPin} defaultOpen={false}>
              <EditableField label="City" value={String(cf.city ?? "")} icon={MapPin} placeholder="City" onSave={(v) => saveField("city", v)} />
              <EditableField label="State / Region" value={String(cf.state ?? "")} placeholder="State" onSave={(v) => saveField("state", v)} />
              <EditableField label="Country" value={String(cf.country ?? "")} placeholder="Country" onSave={(v) => saveField("country", v)} />
              <EditableField label="Timezone" value={String(cf.timezone ?? "")} icon={Clock} placeholder="e.g. America/New_York" onSave={(v) => saveField("timezone", v)} />
            </SideSection>

            {/* Online */}
            <SideSection title="Online & Social" icon={Globe} defaultOpen={false}>
              <EditableField label="Website" value={String(cf.website ?? "")} icon={Globe} placeholder="https://..." onSave={(v) => saveField("website", v)} />
              <EditableField label="LinkedIn" value={String(cf.linkedinUrl ?? "")} icon={Linkedin} placeholder="linkedin.com/in/..." onSave={(v) => saveField("linkedinUrl", v)} />
              <EditableField label="Twitter / X" value={String(cf.twitterUrl ?? "")} icon={Twitter} placeholder="x.com/..." onSave={(v) => saveField("twitterUrl", v)} />
            </SideSection>

            {importedCustomFields.length > 0 && (
              <SideSection title="Imported Custom Fields" icon={FileText}>
                {importedCustomFields.map(([key, value]) => (
                  <EditableField key={key} label={key} value={String(value ?? "")} placeholder="Not set" onSave={(nextValue) => saveField(key, nextValue)} />
                ))}
              </SideSection>
            )}

            {/* Tags */}
            <SideSection title="Tags" icon={Tag}>
              <div className="flex flex-wrap gap-1.5">
                {asArray<string>(lead.tags).map((tag) => (
                  <span key={tag} className="flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-red-500"><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
                {addingTag ? (
                  <div className="flex items-center gap-1">
                    <input
                      ref={tagInputRef}
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addTag(); if (e.key === "Escape") { setAddingTag(false); setNewTag(""); } }}
                      autoFocus
                      placeholder="tag name"
                      className="w-20 text-xs px-2 py-0.5 border border-primary/50 rounded-full outline-none"
                    />
                    <button onClick={addTag} className="text-primary"><Check className="w-3 h-3" /></button>
                    <button onClick={() => { setAddingTag(false); setNewTag(""); }} className="text-muted-foreground"><X className="w-3 h-3" /></button>
                  </div>
                ) : (
                  <button onClick={() => setAddingTag(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary border border-dashed border-muted-foreground/30 hover:border-primary/40 px-2 py-0.5 rounded-full transition-colors">
                    <Plus className="w-2.5 h-2.5" /> tag
                  </button>
                )}
              </div>
            </SideSection>

            {/* Pipeline stage */}
            {stages.length > 0 && (
              <SideSection title="Pipeline Stage" icon={Target}>
                <div className="space-y-2">
                  {stages.sort((a, b) => a.position - b.position).map((stage, i) => (
                    <button
                      key={stage.id}
                      onClick={() => updateLead.mutate({ id: apiId, data: { pipelineStageId: stage.id } as Parameters<typeof updateLead.mutate>[0]["data"] }, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetLeadQueryKey(apiId) }) })}
                      className={`flex items-center gap-2 w-full py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${lead.pipelineStageId === stage.id ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:bg-muted border border-transparent"}`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${lead.pipelineStageId === stage.id ? "ring-2 ring-primary/40" : ""}`} style={{ backgroundColor: stage.color }} />
                      {stage.name}
                      {lead.pipelineStageId === stage.id && <Check className="w-3 h-3 ml-auto" />}
                    </button>
                  ))}
                </div>
              </SideSection>
            )}

            {/* Lead score */}
            <SideSection title="Lead Score" icon={Star}>
              <div className="text-center py-1">
                <div className="flex justify-center mb-2"><ScoreRing score={score} /></div>
                <Slider min={0} max={100} step={1} value={[score]} onValueChange={([v]) => setLocalScore(v ?? 0)} className="mb-2" />
                <div className="flex justify-between text-[10px] text-muted-foreground mb-2"><span>Cold</span><span>Warm</span><span>Hot 🔥</span></div>
                {localScore !== null && localScore !== lead.score && (
                  <button onClick={saveScore} className="w-full py-1.5 text-xs bg-primary text-white rounded-lg font-medium hover:bg-primary/90">
                    Save Score ({localScore})
                  </button>
                )}
              </div>
            </SideSection>

            {/* Assigned + Source */}
            <SideSection title="Assignment" icon={User} defaultOpen={false}>
              <EditableField label="Assigned To" value={String(cf.assignedTo ?? "")} icon={User} placeholder="Unassigned" onSave={(v) => saveField("assignedTo", v)} />
              <EditableField label="Lead Source" value={lead.source ?? ""} placeholder="Website, LinkedIn, etc." onSave={(v) => saveField("source", v)} />
            </SideSection>
          </div>

          {/* ── Main content ──────────────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-border shadow-sm">
            {/* Tab bar */}
            <div className="flex border-b border-border px-5 gap-0">
              {([["timeline", "Timeline", Activity], ["notes", "Notes", MessageSquare], ["tasks", `Tasks (${tasks.filter((t) => !t.isCompleted).length})`, CheckCircle2], ["details", "Details", Edit3]] as const).map(([id, label, Icon]) => (
                <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 transition-colors ${tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {/* ── Timeline ─────────────────────────────────────────────── */}
              {tab === "timeline" && (
                <div className="space-y-5">
                  {/* Log activity */}
                  <div className="bg-muted/30 rounded-xl p-4 border border-border">
                    <div className="text-xs font-semibold text-muted-foreground mb-3">Log Activity</div>
                    <div className="flex gap-2">
                      <select value={newActivityType} onChange={(e) => setNewActivityType(e.target.value as typeof ACTIVITY_TYPES[number])} className="px-2 py-1.5 text-xs border border-border rounded-lg bg-white outline-none capitalize w-36">
                        {ACTIVITY_TYPES.map((t) => <option key={t} value={t} className="capitalize">{t.replace("_", " ")}</option>)}
                      </select>
                      <input
                        className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="Describe what happened..."
                        value={newActivityDesc}
                        onChange={(e) => setNewActivityDesc(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addActivity()}
                      />
                      <button onClick={addActivity} disabled={!newActivityDesc.trim()} className="px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40">
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Timeline feed */}
                  {timelineItems.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      <Activity className="w-10 h-10 mx-auto mb-2 text-muted-foreground/20" />
                      No activity yet. Log a call, email, or meeting to get started.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {groupByDate(timelineItems).map(([day, items]) => (
                        <div key={day}>
                          <div className="flex items-center gap-3 mb-3">
                            <div className="h-px flex-1 bg-border" />
                            <span className="text-xs font-semibold text-muted-foreground">{friendlyDate(items[0]!.createdAt)}</span>
                            <div className="h-px flex-1 bg-border" />
                          </div>
                          <div className="space-y-3 pl-2">
                            {items.map((item) => {
                              const Icon = ACTIVITY_ICONS[item.type] ?? Activity;
                              const colorClass = ACTIVITY_COLORS[item.type] ?? "bg-gray-100 text-gray-500";
                              return (
                                <div key={`${item._type}-${item.id}`} className="flex gap-3 group">
                                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                                    <Icon className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 min-w-0 pt-0.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold text-foreground capitalize">{item.type.replace("_", " ")}</span>
                                      <span className="text-xs text-muted-foreground">{format(parseISO(item.createdAt), "h:mm a")}</span>
                                    </div>
                                    <p className="text-sm text-foreground mt-0.5 leading-relaxed">{item.description}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Notes ──────────────────────────────────────────────── */}
              {tab === "notes" && (
                <div className="space-y-4">
                  <div className="bg-muted/30 rounded-xl p-4 border border-border">
                    <textarea
                      className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 resize-none bg-white min-h-[80px]"
                      placeholder="Write a note... (supports markdown)"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                    />
                    <div className="flex justify-end mt-2">
                      <button onClick={addNote} disabled={!newNote.trim()} className="flex items-center gap-2 px-4 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-40">
                        <Send className="w-3.5 h-3.5" /> Add Note
                      </button>
                    </div>
                  </div>
                  {notes.length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                      <MessageSquare className="w-10 h-10 mx-auto mb-2 text-muted-foreground/20" />No notes yet
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {[...notes].sort((a, b) => parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime()).map((n) => (
                        <div key={n.id} className="bg-amber-50/50 border border-amber-200/60 rounded-xl p-4 group relative">
                          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap pr-8">{n.content}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{formatDistanceToNow(parseISO(n.createdAt), { addSuffix: true })}</span>
                          </div>
                          <button
                            onClick={() => deleteNote.mutate({ leadId: apiId, noteId: n.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListLeadNotesQueryKey(apiId) }) })}
                            className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Tasks ──────────────────────────────────────────────── */}
              {tab === "tasks" && (
                <div className="space-y-4">
                  {/* Add task form */}
                  {showAddTask ? (
                    <div className="bg-muted/30 rounded-xl p-4 border border-border space-y-3">
                      <input
                        value={newTask.title}
                        onChange={(e) => setNewTask((t) => ({ ...t, title: e.target.value }))}
                        placeholder="Task title..."
                        autoFocus
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <textarea
                        value={newTask.description}
                        onChange={(e) => setNewTask((t) => ({ ...t, description: e.target.value }))}
                        placeholder="Description (optional)"
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Due Date</label>
                          <input
                            type="datetime-local"
                            value={newTask.dueDate}
                            onChange={(e) => setNewTask((t) => ({ ...t, dueDate: e.target.value }))}
                            className="w-full px-3 py-1.5 text-sm border border-border rounded-lg outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Priority</label>
                          <select value={newTask.priority} onChange={(e) => setNewTask((t) => ({ ...t, priority: e.target.value as typeof PRIORITY_OPTIONS[number] }))} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-white outline-none capitalize">
                            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowAddTask(false)} className="px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground">Cancel</button>
                        <button onClick={() => createTask.mutate({ ...newTask, dueDate: newTask.dueDate ? new Date(newTask.dueDate).toISOString() : undefined })} disabled={!newTask.title || createTask.isPending} className="px-4 py-1.5 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-40">
                          Add Task
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddTask(true)} className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium">
                      <Plus className="w-4 h-4" /> Add Task
                    </button>
                  )}

                  {/* Open tasks */}
                  {tasks.filter((t) => !t.isCompleted).length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-2">Open ({tasks.filter((t) => !t.isCompleted).length})</div>
                      <div className="space-y-2">
                        {tasks.filter((t) => !t.isCompleted).map((task) => (
                          <div key={task.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-white hover:border-primary/30 transition-colors group">
                            <button onClick={() => updateTask.mutate({ taskId: task.id, isCompleted: true })} className="mt-0.5 flex-shrink-0">
                              <Circle className="w-4.5 h-4.5 text-muted-foreground/50 hover:text-primary" />
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground">{task.title}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border capitalize font-medium ${PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.medium}`}>{task.priority}</span>
                              </div>
                              {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                              {task.dueDate && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                                  <Calendar className="w-3 h-3" />
                                  Due {format(parseISO(task.dueDate), "MMM d, yyyy 'at' h:mm a")}
                                </div>
                              )}
                            </div>
                            <button onClick={() => deleteTask.mutate(task.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-all flex-shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Completed tasks */}
                  {tasks.filter((t) => t.isCompleted).length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground mb-2">Completed ({tasks.filter((t) => t.isCompleted).length})</div>
                      <div className="space-y-2">
                        {tasks.filter((t) => t.isCompleted).map((task) => (
                          <div key={task.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/20 group opacity-60 hover:opacity-100 transition-opacity">
                            <button onClick={() => updateTask.mutate({ taskId: task.id, isCompleted: false })} className="mt-0.5 flex-shrink-0">
                              <CheckCircle2 className="w-4.5 h-4.5 text-green-500" />
                            </button>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm text-muted-foreground line-through">{task.title}</span>
                              {task.completedAt && <div className="text-xs text-muted-foreground mt-0.5">Completed {formatDistanceToNow(parseISO(task.completedAt), { addSuffix: true })}</div>}
                            </div>
                            <button onClick={() => deleteTask.mutate(task.id)} className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 flex-shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {tasks.length === 0 && !showAddTask && (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                      <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-muted-foreground/20" />
                      No tasks yet. Add a follow-up task to stay on top of this contact.
                    </div>
                  )}
                </div>
              )}

              {/* ── Details ────────────────────────────────────────────── */}
              {tab === "details" && (
                <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                  <div className="space-y-4">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-2">Contact Information</div>
                    <div className="space-y-3">
                      {[
                        { label: "First Name", key: "firstName", value: lead.firstName },
                        { label: "Last Name", key: "lastName", value: lead.lastName },
                        { label: "Email", key: "email", value: lead.email },
                        { label: "Phone", key: "phone", value: lead.phone ?? "" },
                        { label: "Title", key: "title", value: lead.title ?? "" },
                        { label: "Company", key: "company", value: lead.company ?? "" },
                        { label: "Source", key: "source", value: lead.source ?? "" },
                      ].map(({ label, key, value }) => (
                        <EditableField key={key} label={label} value={value} onSave={(v) => saveField(key, v)} />
                      ))}
                    </div>

                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-2 pt-2">Do Not Contact</div>
                    <div className="space-y-2">
                      {[
                        { label: "Do Not Email", key: "doNotEmail" },
                        { label: "Do Not SMS", key: "doNotSms" },
                      ].map(({ label, key }) => (
                        <label key={key} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={cf[key] === true || cf[key] === "true"}
                            onChange={(e) => saveField(key, String(e.target.checked))}
                            className="rounded"
                          />
                          <span className="text-sm text-foreground">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-2">Company & Online</div>
                    <div className="space-y-3">
                      {[
                        { label: "Industry", key: "industry", value: String(cf.industry ?? "") },
                        { label: "Annual Revenue", key: "annualRevenue", value: String(cf.annualRevenue ?? "") },
                        { label: "Employee Count", key: "employeeCount", value: String(cf.employeeCount ?? "") },
                        { label: "Website", key: "website", value: String(cf.website ?? "") },
                        { label: "LinkedIn URL", key: "linkedinUrl", value: String(cf.linkedinUrl ?? "") },
                        { label: "Twitter / X", key: "twitterUrl", value: String(cf.twitterUrl ?? "") },
                      ].map(({ label, key, value }) => (
                        <EditableField key={key} label={label} value={value} onSave={(v) => saveField(key, v)} />
                      ))}
                    </div>

                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border pb-2 pt-2">Location</div>
                    <div className="space-y-3">
                      {[
                        { label: "City", key: "city", value: String(cf.city ?? "") },
                        { label: "State / Region", key: "state", value: String(cf.state ?? "") },
                        { label: "Country", key: "country", value: String(cf.country ?? "") },
                        { label: "Timezone", key: "timezone", value: String(cf.timezone ?? "") },
                        { label: "Assigned To", key: "assignedTo", value: String(cf.assignedTo ?? "") },
                      ].map(({ label, key, value }) => (
                        <EditableField key={key} label={label} value={value} onSave={(v) => saveField(key, v)} />
                      ))}
                    </div>

                    <div className="bg-muted/30 rounded-xl p-4 border border-border text-xs space-y-1.5">
                      <div className="font-semibold text-muted-foreground mb-2">Record Info</div>
                      <div><span className="text-muted-foreground">ID: </span><span className="font-mono text-foreground">{lead.id}</span></div>
                      <div><span className="text-muted-foreground">Created: </span><span className="text-foreground">{format(parseISO(lead.createdAt), "MMM d, yyyy 'at' h:mm a")}</span></div>
                      <div><span className="text-muted-foreground">Updated: </span><span className="text-foreground">{format(parseISO(lead.updatedAt), "MMM d, yyyy 'at' h:mm a")}</span></div>
                      <div><span className="text-muted-foreground">Lead Score: </span><span className="font-semibold text-foreground">{lead.score}</span></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

  );
}
