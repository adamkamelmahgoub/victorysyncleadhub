import { useState } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, Plus, Play, Pause, Trash2, ChevronRight,
  Mail, Clock, Tag, User, GitBranch, MessageSquare,
  TrendingUp, Edit3, Copy, Search,
} from "lucide-react";

type TriggerType = "contact_created" | "tag_added" | "form_submitted" | "appointment_scheduled" | "opportunity_stage_changed" | "email_opened";
type ActionType = "send_email" | "wait" | "add_tag" | "update_status" | "enroll_sequence" | "send_sms" | "assign_user";

interface WorkflowAction {
  type: ActionType;
  config: Record<string, string>;
}

interface Automation {
  id: number;
  name: string;
  triggerType: TriggerType;
  triggerConfig: Record<string, unknown>;
  actions: WorkflowAction[];
  isActive: boolean;
  enrolledCount: number;
  completedCount: number;
  createdAt: string;
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  contact_created: "Contact Created",
  tag_added: "Tag Added",
  form_submitted: "Form Submitted",
  appointment_scheduled: "Appointment Scheduled",
  opportunity_stage_changed: "Opportunity Stage Changed",
  email_opened: "Email Opened",
};

const ACTION_ICONS: Record<ActionType, React.ElementType> = {
  send_email: Mail,
  wait: Clock,
  add_tag: Tag,
  update_status: TrendingUp,
  enroll_sequence: GitBranch,
  send_sms: MessageSquare,
  assign_user: User,
};

const ACTION_LABELS: Record<ActionType, string> = {
  send_email: "Send Email",
  wait: "Wait",
  add_tag: "Add Tag",
  update_status: "Update Status",
  enroll_sequence: "Enroll in Sequence",
  send_sms: "Send SMS",
  assign_user: "Assign User",
};

const STATUS_STYLES = {
  active: "bg-green-100 text-green-700 border-green-200",
  paused: "bg-amber-100 text-amber-700 border-amber-200",
  draft: "bg-gray-100 text-gray-600 border-gray-200",
};

const TEMPLATES = [
  {
    name: "New Lead Welcome",
    triggerType: "contact_created" as TriggerType,
    actions: [
      { type: "send_email" as ActionType, config: { subject: "Welcome!", delay: "0" } },
      { type: "wait" as ActionType, config: { days: "1" } },
      { type: "add_tag" as ActionType, config: { tag: "welcomed" } },
    ],
  },
  {
    name: "Post-Form Follow-up",
    triggerType: "form_submitted" as TriggerType,
    actions: [
      { type: "send_email" as ActionType, config: { subject: "Got your info!" } },
      { type: "wait" as ActionType, config: { days: "2" } },
      { type: "update_status" as ActionType, config: { status: "contacted" } },
    ],
  },
  {
    name: "Deal Won Celebration",
    triggerType: "opportunity_stage_changed" as TriggerType,
    actions: [
      { type: "send_email" as ActionType, config: { subject: "Welcome aboard!" } },
      { type: "add_tag" as ActionType, config: { tag: "customer" } },
    ],
  },
  { name: "Blank Workflow", triggerType: "contact_created" as TriggerType, actions: [] },
];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

export default function Automation() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Automation | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(0);

  const { data: automations = [], isLoading } = useQuery<Automation[]>({
    queryKey: ["automations"],
    queryFn: () => apiFetch("/api/automations"),
  });

  const create = useMutation({
    mutationFn: (body: object) => apiFetch("/api/automations", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      setShowNew(false);
      setNewName("");
      setSelectedTemplate(0);
      setSelected(data);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Automation>) =>
      apiFetch(`/api/automations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      if (selected?.id === data.id) setSelected(data);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/automations/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      if (selected?.id === id) setSelected(null);
    },
  });

  function toggleActive(automation: Automation) {
    update.mutate({ id: automation.id, isActive: !automation.isActive });
  }

  function createWorkflow() {
    if (!newName.trim()) return;
    const tmpl = TEMPLATES[selectedTemplate];
    create.mutate({
      name: newName.trim(),
      triggerType: tmpl?.triggerType ?? "contact_created",
      triggerConfig: {},
      actions: tmpl?.actions ?? [],
      isActive: false,
    });
  }

  const filtered = automations.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()));

  const status = (a: Automation): "active" | "paused" | "draft" =>
    a.actions.length === 0 ? "draft" : a.isActive ? "active" : "paused";

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Automation</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Build automated workflows to engage your contacts</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Workflow
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Active Workflows", value: automations.filter((a) => a.isActive).length, color: "text-green-600" },
            { label: "Total Enrolled", value: automations.reduce((s, a) => s + a.enrolledCount, 0), color: "text-blue-600" },
            { label: "Completed", value: automations.reduce((s, a) => s + a.completedCount, 0), color: "text-purple-600" },
            {
              label: "Conversion Rate",
              value: `${Math.round(
                (automations.reduce((s, a) => s + a.completedCount, 0) /
                  Math.max(1, automations.reduce((s, a) => s + a.enrolledCount, 0))) * 100
              )}%`,
              color: "text-primary",
            },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-border shadow-sm p-4">
              <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workflows..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        {selected ? (
          <div className="space-y-4">
            <button onClick={() => setSelected(null)} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              ← Back to all workflows
            </button>
            <div className="grid grid-cols-[1fr_280px] gap-5">
              <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-foreground">{selected.name}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_STYLES[status(selected)]}`}>
                      {status(selected)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleActive(selected)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        selected.isActive
                          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                          : "bg-green-100 text-green-700 hover:bg-green-200"
                      }`}
                    >
                      {selected.isActive ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Activate</>}
                    </button>
                  </div>
                </div>
                <div className="p-6 flex flex-col items-center">
                  <div className="w-full max-w-sm">
                    <div className="bg-primary/10 border-2 border-primary/30 rounded-xl p-4 text-center">
                      <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center mx-auto mb-2">
                        <Zap className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Trigger</div>
                      <div className="text-sm font-semibold text-foreground">{TRIGGER_LABELS[selected.triggerType] ?? selected.triggerType}</div>
                    </div>
                    {selected.actions.map((action, i) => {
                      const Icon = ACTION_ICONS[action.type] ?? Zap;
                      return (
                        <div key={i} className="flex flex-col items-center">
                          <div className="w-0.5 h-6 bg-border" />
                          <ChevronRight className="w-4 h-4 text-muted-foreground -mt-3 -mb-1 rotate-90" />
                          <div className="w-0.5 h-6 bg-border" />
                          <div className="w-full bg-white border border-border rounded-xl p-3 flex items-center gap-3 hover:border-primary/40 cursor-pointer transition-colors group">
                            <div className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                              <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-foreground">{ACTION_LABELS[action.type]}</div>
                              {action.config.days && <div className="text-[11px] text-muted-foreground">Wait {action.config.days} day(s)</div>}
                              {action.config.subject && <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">"{action.config.subject}"</div>}
                              {action.config.tag && <div className="text-[11px] text-muted-foreground">Tag: {action.config.tag}</div>}
                              {action.config.status && <div className="text-[11px] text-muted-foreground">→ {action.config.status}</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex justify-center mt-4">
                      <button className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium border border-dashed border-primary/40 px-4 py-2 rounded-lg hover:bg-primary/5 transition-colors">
                        <Plus className="w-4 h-4" /> Add Action
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-border shadow-sm p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Performance</h3>
                  {[
                    { label: "Enrolled", value: selected.enrolledCount, color: "bg-blue-500" },
                    { label: "Completed", value: selected.completedCount, color: "bg-green-500" },
                    { label: "In Progress", value: selected.enrolledCount - selected.completedCount, color: "bg-amber-500" },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{s.label}</span>
                        <span className="font-semibold text-foreground">{s.value}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className={`${s.color} h-1.5 rounded-full`} style={{ width: `${Math.min(100, (s.value / Math.max(1, selected.enrolledCount)) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-xl border border-border shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Details</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="text-foreground">{new Date(selected.createdAt).toLocaleDateString()}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Trigger</span><span className="text-foreground">{TRIGGER_LABELS[selected.triggerType] ?? selected.triggerType}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Steps</span><span className="text-foreground">{selected.actions.length}</span></div>
                  </div>
                  <button
                    onClick={() => remove.mutate(selected.id)}
                    className="mt-4 w-full text-xs py-2 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Delete Workflow
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3">Workflow</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Trigger</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Enrolled</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Completed</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <Zap className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                      <p className="text-sm font-medium text-foreground">No workflows yet</p>
                      <button onClick={() => setShowNew(true)} className="text-sm text-primary hover:underline mt-1">Create your first workflow</button>
                    </td>
                  </tr>
                ) : filtered.map((w) => {
                  const s = status(w);
                  return (
                    <tr key={w.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <button onClick={() => setSelected(w)} className="flex items-center gap-2.5 text-left group">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Zap className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{w.name}</div>
                            <div className="text-xs text-muted-foreground">{w.actions.length} step{w.actions.length !== 1 ? "s" : ""}</div>
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">{TRIGGER_LABELS[w.triggerType] ?? w.triggerType}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_STYLES[s]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s === "active" ? "bg-green-500" : s === "paused" ? "bg-amber-500" : "bg-gray-400"}`} />
                          {s}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm font-medium text-foreground">{w.enrolledCount}</td>
                      <td className="px-4 py-3.5 text-right text-sm text-muted-foreground">
                        {w.completedCount}
                        {w.enrolledCount > 0 && <span className="text-xs ml-1 text-muted-foreground/60">({Math.round(w.completedCount / w.enrolledCount * 100)}%)</span>}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => toggleActive(w)} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title={w.isActive ? "Pause" : "Activate"}>
                            {w.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          </button>
                          <button className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Copy className="w-3.5 h-3.5" /></button>
                          <button onClick={() => remove.mutate(w.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">New Workflow</h3>
              <button onClick={() => setShowNew(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Workflow Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createWorkflow()}
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="e.g. New Lead Welcome Series"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">Start from a template</label>
                <div className="space-y-2">
                  {TEMPLATES.map((t, i) => (
                    <button
                      key={t.name}
                      onClick={() => { setSelectedTemplate(i); if (!newName) setNewName(t.name); }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${selectedTemplate === i ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40 text-foreground"}`}
                    >
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{t.actions.length} steps · Trigger: {TRIGGER_LABELS[t.triggerType]}</div>
                    </button>
                  ))}
                </div>
              </div>
              {create.error && <p className="text-xs text-red-500">{String(create.error)}</p>}
            </div>
            <div className="px-6 pb-6 flex gap-2 justify-end">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg">Cancel</button>
              <button
                onClick={createWorkflow}
                disabled={!newName.trim() || create.isPending}
                className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                {create.isPending ? "Creating..." : "Create Workflow"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
