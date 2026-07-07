import { useState } from "react";
import { Layout } from "@/components/layout";
import {
  Zap, Plus, Play, Pause, Trash2, MoreHorizontal, ChevronRight,
  Mail, Clock, Tag, User, GitBranch, MessageSquare, Star,
  TrendingUp, Edit3, Copy, Search,
} from "lucide-react";

type TriggerType = "contact_created" | "tag_added" | "form_submitted" | "appointment_scheduled" | "opportunity_stage_changed" | "email_opened";
type ActionType = "send_email" | "wait" | "add_tag" | "update_status" | "enroll_sequence" | "send_sms" | "assign_user";

interface WorkflowAction {
  type: ActionType;
  config: Record<string, string>;
}

interface Workflow {
  id: number;
  name: string;
  trigger: TriggerType;
  actions: WorkflowAction[];
  status: "active" | "paused" | "draft";
  enrolled: number;
  completed: number;
  createdAt: string;
}

const SAMPLE_WORKFLOWS: Workflow[] = [
  {
    id: 1,
    name: "New Lead Welcome Sequence",
    trigger: "contact_created",
    actions: [
      { type: "send_email", config: { subject: "Welcome!", delay: "0" } },
      { type: "wait", config: { days: "1" } },
      { type: "add_tag", config: { tag: "welcomed" } },
      { type: "enroll_sequence", config: { sequence: "Nurture Series" } },
    ],
    status: "active",
    enrolled: 124,
    completed: 89,
    createdAt: "2024-06-01",
  },
  {
    id: 2,
    name: "Form Submission Follow-up",
    trigger: "form_submitted",
    actions: [
      { type: "send_email", config: { subject: "Got your info!" } },
      { type: "wait", config: { days: "2" } },
      { type: "update_status", config: { status: "contacted" } },
    ],
    status: "active",
    enrolled: 67,
    completed: 42,
    createdAt: "2024-06-10",
  },
  {
    id: 3,
    name: "Deal Won Celebration",
    trigger: "opportunity_stage_changed",
    actions: [
      { type: "send_email", config: { subject: "🎉 Welcome aboard!" } },
      { type: "add_tag", config: { tag: "customer" } },
      { type: "assign_user", config: { user: "Account Manager" } },
    ],
    status: "active",
    enrolled: 23,
    completed: 23,
    createdAt: "2024-06-15",
  },
  {
    id: 4,
    name: "Re-engagement Campaign",
    trigger: "tag_added",
    actions: [
      { type: "wait", config: { days: "3" } },
      { type: "send_email", config: { subject: "Still interested?" } },
      { type: "wait", config: { days: "5" } },
      { type: "send_sms", config: { message: "Hi {{firstName}}, just checking in!" } },
    ],
    status: "paused",
    enrolled: 45,
    completed: 12,
    createdAt: "2024-06-20",
  },
  {
    id: 5,
    name: "Post-Appointment Follow-up",
    trigger: "appointment_scheduled",
    actions: [
      { type: "send_email", config: { subject: "Your appointment is confirmed!" } },
      { type: "wait", config: { days: "1" } },
      { type: "send_sms", config: { message: "Reminder: your call is tomorrow!" } },
    ],
    status: "draft",
    enrolled: 0,
    completed: 0,
    createdAt: "2024-07-01",
  },
];

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

export default function Automation() {
  const [workflows, setWorkflows] = useState<Workflow[]>(SAMPLE_WORKFLOWS);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  const filtered = workflows.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()));

  function toggleStatus(id: number) {
    setWorkflows((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, status: w.status === "active" ? "paused" : "active" } : w
      )
    );
    if (selected?.id === id) {
      setSelected((s) => s ? { ...s, status: s.status === "active" ? "paused" : "active" } : null);
    }
  }

  function deleteWorkflow(id: number) {
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  function createWorkflow() {
    if (!newName.trim()) return;
    const w: Workflow = {
      id: Date.now(),
      name: newName.trim(),
      trigger: "contact_created",
      actions: [],
      status: "draft",
      enrolled: 0,
      completed: 0,
      createdAt: new Date().toISOString().split("T")[0]!,
    };
    setWorkflows((prev) => [w, ...prev]);
    setShowNew(false);
    setNewName("");
    setSelected(w);
  }

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Automation</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Build automated workflows to engage your contacts</p>
          </div>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" /> Create Workflow
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Active Workflows", value: workflows.filter((w) => w.status === "active").length, color: "text-green-600", bg: "bg-green-50" },
            { label: "Total Enrolled", value: workflows.reduce((s, w) => s + w.enrolled, 0), color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Completed", value: workflows.reduce((s, w) => s + w.completed, 0), color: "text-purple-600", bg: "bg-purple-50" },
            { label: "Conversion Rate", value: `${Math.round(workflows.reduce((s, w) => s + w.completed, 0) / Math.max(1, workflows.reduce((s, w) => s + w.enrolled, 0)) * 100)}%`, color: "text-orange-600", bg: "bg-orange-50" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-border p-4 shadow-sm">
              <div className="text-xs text-muted-foreground mb-1">{stat.label}</div>
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Search */}
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
          /* ── Workflow Detail View ── */
          <div className="space-y-4">
            <button onClick={() => setSelected(null)} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              ← Back to all workflows
            </button>
            <div className="grid grid-cols-[1fr_320px] gap-5">
              {/* Flow builder */}
              <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-foreground">{selected.name}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_STYLES[selected.status]}`}>
                      {selected.status}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleStatus(selected.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        selected.status === "active"
                          ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                          : "bg-green-100 text-green-700 hover:bg-green-200"
                      }`}
                    >
                      {selected.status === "active" ? <><Pause className="w-3.5 h-3.5" /> Pause</> : <><Play className="w-3.5 h-3.5" /> Activate</>}
                    </button>
                    <button className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground"><Edit3 className="w-4 h-4" /></button>
                  </div>
                </div>
                <div className="p-6">
                  {/* Trigger */}
                  <div className="flex flex-col items-center">
                    <div className="w-full max-w-sm">
                      <div className="bg-primary/10 border-2 border-primary/30 rounded-xl p-4 text-center">
                        <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center mx-auto mb-2">
                          <Zap className="w-4 h-4 text-white" />
                        </div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Trigger</div>
                        <div className="text-sm font-semibold text-foreground">{TRIGGER_LABELS[selected.trigger]}</div>
                      </div>

                      {/* Actions */}
                      {selected.actions.map((action, i) => {
                        const Icon = ACTION_ICONS[action.type];
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
                                {action.config.days && <div className="text-[11px] text-muted-foreground">Wait {action.config.days} day{action.config.days !== "1" ? "s" : ""}</div>}
                                {action.config.subject && <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">"{action.config.subject}"</div>}
                                {action.config.tag && <div className="text-[11px] text-muted-foreground">Tag: {action.config.tag}</div>}
                                {action.config.status && <div className="text-[11px] text-muted-foreground">Status → {action.config.status}</div>}
                                {action.config.sequence && <div className="text-[11px] text-muted-foreground">{action.config.sequence}</div>}
                                {action.config.message && <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">"{action.config.message}"</div>}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Add action */}
                      <div className="flex justify-center mt-4">
                        <button className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium border border-dashed border-primary/40 px-4 py-2 rounded-lg hover:bg-primary/5 transition-colors">
                          <Plus className="w-4 h-4" /> Add Action
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats sidebar */}
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-border shadow-sm p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Performance</h3>
                  {[
                    { label: "Enrolled", value: selected.enrolled, color: "bg-blue-500" },
                    { label: "Completed", value: selected.completed, color: "bg-green-500" },
                    { label: "In Progress", value: selected.enrolled - selected.completed, color: "bg-amber-500" },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">{s.label}</span>
                        <span className="font-semibold text-foreground">{s.value}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className={`${s.color} h-1.5 rounded-full`} style={{ width: `${Math.min(100, (s.value / Math.max(1, selected.enrolled)) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-xl border border-border shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Details</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="text-foreground">{selected.createdAt}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Trigger</span><span className="text-foreground">{TRIGGER_LABELS[selected.trigger]}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Steps</span><span className="text-foreground">{selected.actions.length}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ── Workflow List ── */
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
                {filtered.map((w) => (
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
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-muted-foreground">{TRIGGER_LABELS[w.trigger]}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_STYLES[w.status]}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${w.status === "active" ? "bg-green-500" : w.status === "paused" ? "bg-amber-500" : "bg-gray-400"}`} />
                        {w.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm font-medium text-foreground">{w.enrolled}</td>
                    <td className="px-4 py-3.5 text-right text-sm text-muted-foreground">
                      {w.completed}
                      {w.enrolled > 0 && <span className="text-xs ml-1 text-muted-foreground/60">({Math.round(w.completed / w.enrolled * 100)}%)</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => toggleStatus(w.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title={w.status === "active" ? "Pause" : "Activate"}>
                          {w.status === "active" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteWorkflow(w.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-16 text-center">
                <Zap className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">No workflows found</p>
                <button onClick={() => setShowNew(true)} className="text-sm text-primary hover:underline mt-1">Create your first workflow</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── New workflow modal ── */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border">
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
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                  placeholder="e.g. New Lead Welcome Series"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">Start from a template</label>
                <div className="space-y-2">
                  {[
                    { name: "Welcome new contacts", trigger: "contact_created" },
                    { name: "Post-form follow-up", trigger: "form_submitted" },
                    { name: "Re-engagement", trigger: "tag_added" },
                    { name: "Blank canvas", trigger: "contact_created" },
                  ].map((t) => (
                    <button
                      key={t.name}
                      onClick={() => setNewName(t.name)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${newName === t.name ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/40 text-foreground"}`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2 justify-end">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg">Cancel</button>
              <button onClick={createWorkflow} disabled={!newName.trim()} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Create Workflow
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
