import { useState, useCallback } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, Plus, Play, Pause, Trash2, ChevronRight,
  Mail, Clock, Tag, User, GitBranch, MessageSquare,
  TrendingUp, Copy, Search, X, ArrowUp, ArrowDown,
  Save, Edit3, Globe, FileText, Bell,
} from "lucide-react";

type TriggerType = "contact_created" | "tag_added" | "form_submitted" | "appointment_scheduled" |
  "opportunity_stage_changed" | "email_opened" | "sms_replied" | "deal_won" | "page_visit";

type ActionType = "send_email" | "wait" | "add_tag" | "remove_tag" | "update_status" |
  "enroll_sequence" | "send_sms" | "assign_user" | "add_note" | "webhook" | "send_notification";

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
  sms_replied: "SMS Replied",
  deal_won: "Deal Won / Closed",
  page_visit: "Page Visit",
};

const TRIGGER_CONFIG: Record<TriggerType, { label: string; fields: { key: string; label: string; placeholder: string }[] }> = {
  contact_created: { label: "Contact Created", fields: [] },
  tag_added: { label: "Tag Added", fields: [{ key: "tag", label: "Tag Name", placeholder: "e.g. interested" }] },
  form_submitted: { label: "Form Submitted", fields: [{ key: "formName", label: "Form Name", placeholder: "e.g. Contact Us" }] },
  appointment_scheduled: { label: "Appointment Scheduled", fields: [{ key: "calendarName", label: "Calendar (optional)", placeholder: "Any calendar" }] },
  opportunity_stage_changed: { label: "Stage Changed", fields: [{ key: "stage", label: "New Stage", placeholder: "e.g. Proposal Sent" }] },
  email_opened: { label: "Email Opened", fields: [{ key: "subject", label: "Subject Contains (optional)", placeholder: "Leave blank for any" }] },
  sms_replied: { label: "SMS Replied", fields: [] },
  deal_won: { label: "Deal Won", fields: [] },
  page_visit: { label: "Page Visit", fields: [{ key: "url", label: "Page URL Contains", placeholder: "/pricing" }] },
};

const ACTION_META: Record<ActionType, {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  fields: { key: string; label: string; placeholder: string; type?: string; options?: string[] }[];
}> = {
  send_email: {
    label: "Send Email", icon: Mail, color: "text-blue-600", bg: "bg-blue-50",
    fields: [
      { key: "subject", label: "Subject", placeholder: "e.g. Welcome to VictorySync!" },
      { key: "body", label: "Body", placeholder: "Hi {{firstName}},\n\nThank you for...", type: "textarea" },
      { key: "delay", label: "Send after (minutes)", placeholder: "0" },
    ],
  },
  wait: {
    label: "Wait / Delay", icon: Clock, color: "text-amber-600", bg: "bg-amber-50",
    fields: [
      { key: "duration", label: "Duration", placeholder: "1" },
      { key: "unit", label: "Unit", placeholder: "days", options: ["minutes", "hours", "days", "weeks"] },
    ],
  },
  add_tag: {
    label: "Add Tag", icon: Tag, color: "text-green-600", bg: "bg-green-50",
    fields: [{ key: "tag", label: "Tag Name", placeholder: "e.g. qualified" }],
  },
  remove_tag: {
    label: "Remove Tag", icon: Tag, color: "text-red-500", bg: "bg-red-50",
    fields: [{ key: "tag", label: "Tag to Remove", placeholder: "e.g. unqualified" }],
  },
  update_status: {
    label: "Update Contact Status", icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50",
    fields: [{ key: "status", label: "New Status", placeholder: "contacted", options: ["new", "contacted", "qualified", "proposal", "converted", "lost"] }],
  },
  enroll_sequence: {
    label: "Enroll in Sequence", icon: GitBranch, color: "text-indigo-600", bg: "bg-indigo-50",
    fields: [{ key: "sequenceName", label: "Sequence Name", placeholder: "e.g. Nurture Campaign" }],
  },
  send_sms: {
    label: "Send SMS", icon: MessageSquare, color: "text-teal-600", bg: "bg-teal-50",
    fields: [{ key: "message", label: "Message (160 chars)", placeholder: "Hi {{firstName}}, just checking in...", type: "textarea" }],
  },
  assign_user: {
    label: "Assign to Team Member", icon: User, color: "text-orange-600", bg: "bg-orange-50",
    fields: [{ key: "userEmail", label: "Team Member Email", placeholder: "e.g. sales@company.com" }],
  },
  add_note: {
    label: "Add Internal Note", icon: FileText, color: "text-gray-600", bg: "bg-gray-100",
    fields: [{ key: "note", label: "Note Content", placeholder: "Auto-generated note...", type: "textarea" }],
  },
  webhook: {
    label: "Send Webhook", icon: Globe, color: "text-pink-600", bg: "bg-pink-50",
    fields: [
      { key: "url", label: "Webhook URL", placeholder: "https://hooks.zapier.com/..." },
      { key: "method", label: "Method", placeholder: "POST", options: ["GET", "POST", "PUT", "PATCH"] },
    ],
  },
  send_notification: {
    label: "Send Internal Alert", icon: Bell, color: "text-yellow-600", bg: "bg-yellow-50",
    fields: [
      { key: "message", label: "Alert Message", placeholder: "New hot lead: {{firstName}} {{lastName}}" },
      { key: "to", label: "Notify (email)", placeholder: "team@company.com" },
    ],
  },
};

const STATUS_STYLES = {
  active: "bg-green-100 text-green-700 border-green-200",
  paused: "bg-amber-100 text-amber-700 border-amber-200",
  draft: "bg-gray-100 text-gray-600 border-gray-200",
};

const TEMPLATES = [
  { name: "New Lead Welcome Series", triggerType: "contact_created" as TriggerType, actions: [
    { type: "send_email" as ActionType, config: { subject: "Welcome to {{company}}!", body: "Hi {{firstName}},\n\nThanks for reaching out. We'd love to learn more about how we can help.", delay: "0" } },
    { type: "wait" as ActionType, config: { duration: "1", unit: "days" } },
    { type: "add_tag" as ActionType, config: { tag: "welcomed" } },
    { type: "update_status" as ActionType, config: { status: "contacted" } },
  ]},
  { name: "Form Submission Follow-up", triggerType: "form_submitted" as TriggerType, actions: [
    { type: "send_email" as ActionType, config: { subject: "Got your message!", body: "Hi {{firstName}},\n\nThanks for filling out our form. Expect a response within 24 hours." } },
    { type: "wait" as ActionType, config: { duration: "1", unit: "days" } },
    { type: "send_sms" as ActionType, config: { message: "Hi {{firstName}}, just checking in re your inquiry. Reply YES to schedule a call." } },
  ]},
  { name: "Deal Won Onboarding", triggerType: "deal_won" as TriggerType, actions: [
    { type: "send_email" as ActionType, config: { subject: "Welcome aboard, {{firstName}}! 🎉", body: "We're thrilled to have you as a customer. Here's how to get started..." } },
    { type: "add_tag" as ActionType, config: { tag: "customer" } },
    { type: "update_status" as ActionType, config: { status: "converted" } },
  ]},
  { name: "Tag-Based Nurture", triggerType: "tag_added" as TriggerType, actions: [
    { type: "send_email" as ActionType, config: { subject: "Special offer inside", body: "Hi {{firstName}},\n\nWe noticed you've shown interest in our platform..." } },
    { type: "wait" as ActionType, config: { duration: "3", unit: "days" } },
    { type: "webhook" as ActionType, config: { url: "https://hooks.zapier.com/", method: "POST" } },
  ]},
  { name: "Blank Workflow", triggerType: "contact_created" as TriggerType, actions: [] },
];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

function ActionCard({
  action, index, total, editing, onEdit, onDelete, onMove, onChange,
}: {
  action: WorkflowAction;
  index: number;
  total: number;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (dir: "up" | "down") => void;
  onChange: (config: Record<string, string>) => void;
}) {
  const meta = ACTION_META[action.type];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <div className={`w-full max-w-sm mx-auto`}>
      <div className={`border-2 rounded-xl transition-all ${editing ? "border-primary shadow-md" : "border-border hover:border-primary/40"} bg-white`}>
        <div className="flex items-center gap-3 p-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
            <Icon className={`w-4 h-4 ${meta.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-foreground">{meta.label}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {action.config.subject ?? action.config.message ?? action.config.tag ?? action.config.status ?? action.config.duration ? (
                action.config.subject ? `"${action.config.subject}"` :
                action.config.message ? action.config.message.slice(0, 30) + "..." :
                action.config.tag ? `Tag: ${action.config.tag}` :
                action.config.status ? `→ ${action.config.status}` :
                action.config.duration ? `${action.config.duration} ${action.config.unit ?? "days"}` :
                "Click to configure"
              ) : "Click to configure"}
            </div>
          </div>
          <div className="flex gap-0.5 flex-shrink-0">
            <button onClick={() => onMove("up")} disabled={index === 0} className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-20">
              <ArrowUp className="w-3 h-3" />
            </button>
            <button onClick={() => onMove("down")} disabled={index === total - 1} className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-20">
              <ArrowDown className="w-3 h-3" />
            </button>
            <button onClick={onEdit} className={`p-1 rounded hover:bg-muted ${editing ? "text-primary" : "text-muted-foreground"}`}>
              <Edit3 className="w-3 h-3" />
            </button>
            <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
        {editing && (
          <div className="border-t border-border p-3 space-y-3 bg-muted/20">
            {meta.fields.map((f) => (
              <div key={f.key}>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">{f.label}</label>
                {f.options ? (
                  <select
                    value={action.config[f.key] ?? ""}
                    onChange={(e) => onChange({ ...action.config, [f.key]: e.target.value })}
                    className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">{f.placeholder}</option>
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    value={action.config[f.key] ?? ""}
                    onChange={(e) => onChange({ ...action.config, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    rows={3}
                    className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  />
                ) : (
                  <input
                    value={action.config[f.key] ?? ""}
                    onChange={(e) => onChange({ ...action.config, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary/30"
                  />
                )}
              </div>
            ))}
            {meta.fields.some((f) => f.key === "subject" || f.key === "body" || f.key === "message") && (
              <div className="text-[10px] text-muted-foreground bg-white border border-border rounded-lg px-2 py-1.5">
                <span className="font-semibold">Variables:</span> {"{{firstName}}"} {"{{lastName}}"} {"{{email}}"} {"{{company}}"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Automation() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Automation | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(0);
  const [showAddStep, setShowAddStep] = useState(false);

  // Editor state
  const [editActions, setEditActions] = useState<WorkflowAction[]>([]);
  const [editTrigger, setEditTrigger] = useState<TriggerType>("contact_created");
  const [editTriggerConfig, setEditTriggerConfig] = useState<Record<string, string>>({});
  const [editName, setEditName] = useState("");
  const [editingStep, setEditingStep] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: automations = [], isLoading } = useQuery<Automation[]>({
    queryKey: ["automations"],
    queryFn: () => apiFetch("/api/automations"),
  });

  const create = useMutation({
    mutationFn: (body: object) => apiFetch("/api/automations", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data: Automation) => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      setShowNew(false);
      setNewName("");
      openEditor(data);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Automation>) =>
      apiFetch(`/api/automations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (data: Automation) => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      setSelected(data);
      setHasChanges(false);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/automations/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["automations"] });
      if (selected?.id === id) { setSelected(null); setEditActions([]); }
    },
  });

  function openEditor(a: Automation) {
    setSelected(a);
    setEditActions(JSON.parse(JSON.stringify(a.actions)));
    setEditTrigger(a.triggerType);
    setEditTriggerConfig((a.triggerConfig as Record<string, string>) ?? {});
    setEditName(a.name);
    setHasChanges(false);
    setEditingStep(null);
  }

  function saveChanges() {
    if (!selected) return;
    update.mutate({ id: selected.id, name: editName, actions: editActions, triggerType: editTrigger, triggerConfig: editTriggerConfig });
  }

  function addAction(type: ActionType) {
    setEditActions((prev) => [...prev, { type, config: {} }]);
    setEditingStep(editActions.length);
    setHasChanges(true);
    setShowAddStep(false);
  }

  function updateAction(i: number, config: Record<string, string>) {
    setEditActions((prev) => prev.map((a, idx) => idx === i ? { ...a, config } : a));
    setHasChanges(true);
  }

  function deleteAction(i: number) {
    setEditActions((prev) => prev.filter((_, idx) => idx !== i));
    setEditingStep(null);
    setHasChanges(true);
  }

  function moveAction(i: number, dir: "up" | "down") {
    const next = [...editActions];
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setEditActions(next);
    setHasChanges(true);
  }

  function createWorkflow() {
    if (!newName.trim()) return;
    const tmpl = TEMPLATES[selectedTemplate];
    create.mutate({ name: newName.trim(), triggerType: tmpl?.triggerType ?? "contact_created", triggerConfig: {}, actions: tmpl?.actions ?? [], isActive: false });
  }

  const status = (a: Automation): "active" | "paused" | "draft" =>
    a.actions.length === 0 ? "draft" : a.isActive ? "active" : "paused";

  const filtered = automations.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()));
  const triggerFields = TRIGGER_CONFIG[editTrigger]?.fields ?? [];

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Automation</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Build automated workflows to engage contacts at the right time</p>
          </div>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Create Workflow
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Active Workflows", value: automations.filter((a) => a.isActive).length, color: "text-green-600" },
            { label: "Total Enrolled", value: automations.reduce((s, a) => s + a.enrolledCount, 0), color: "text-blue-600" },
            { label: "Completed", value: automations.reduce((s, a) => s + a.completedCount, 0), color: "text-purple-600" },
            { label: "Conversion Rate", value: `${Math.round((automations.reduce((s, a) => s + a.completedCount, 0) / Math.max(1, automations.reduce((s, a) => s + a.enrolledCount, 0))) * 100)}%`, color: "text-primary" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-border shadow-sm p-4">
              <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {selected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button onClick={() => { setSelected(null); setHasChanges(false); }} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                ← Workflows
              </button>
              {hasChanges && <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Unsaved changes</span>}
            </div>

            <div className="grid grid-cols-[1fr_300px] gap-5">
              {/* Editor panel */}
              <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-3">
                  <input
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); setHasChanges(true); }}
                    className="flex-1 text-base font-semibold text-foreground bg-transparent border-0 outline-none focus:ring-2 focus:ring-primary/20 rounded px-1"
                  />
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_STYLES[status(selected)]}`}>{status(selected)}</span>
                  <div className="flex gap-2 ml-2">
                    <button
                      onClick={() => update.mutate({ id: selected.id, isActive: !selected.isActive })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${selected.isActive ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}
                    >
                      {selected.isActive ? <><Pause className="w-3.5 h-3.5" />Pause</> : <><Play className="w-3.5 h-3.5" />Activate</>}
                    </button>
                    {hasChanges && (
                      <button onClick={saveChanges} disabled={update.isPending} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-60">
                        <Save className="w-3.5 h-3.5" />{update.isPending ? "Saving..." : "Save Changes"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-6 overflow-y-auto max-h-[70vh]">
                  {/* Trigger */}
                  <div className="w-full max-w-sm mx-auto mb-2">
                    <div className="border-2 border-primary/40 rounded-xl p-4 bg-primary/5">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                          <Zap className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trigger</div>
                      </div>
                      <select
                        value={editTrigger}
                        onChange={(e) => { setEditTrigger(e.target.value as TriggerType); setEditTriggerConfig({}); setHasChanges(true); }}
                        className="w-full px-2 py-1.5 text-sm font-semibold text-foreground border border-border rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {Object.entries(TRIGGER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      {triggerFields.map((f) => (
                        <div key={f.key} className="mt-2">
                          <input
                            value={editTriggerConfig[f.key] ?? ""}
                            onChange={(e) => { setEditTriggerConfig((c) => ({ ...c, [f.key]: e.target.value })); setHasChanges(true); }}
                            placeholder={f.placeholder}
                            className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  {editActions.map((action, i) => (
                    <div key={i} className="flex flex-col items-center">
                      <div className="w-0.5 h-5 bg-border" />
                      <ChevronRight className="w-4 h-4 text-muted-foreground -mt-3 -mb-1 rotate-90" />
                      <div className="w-0.5 h-4 bg-border" />
                      <ActionCard
                        action={action}
                        index={i}
                        total={editActions.length}
                        editing={editingStep === i}
                        onEdit={() => setEditingStep(editingStep === i ? null : i)}
                        onDelete={() => deleteAction(i)}
                        onMove={(dir) => moveAction(i, dir)}
                        onChange={(config) => updateAction(i, config)}
                      />
                    </div>
                  ))}

                  {/* Add step */}
                  <div className="flex flex-col items-center mt-2">
                    <div className="w-0.5 h-5 bg-border" />
                    <div className="w-full max-w-sm mx-auto">
                      <button onClick={() => setShowAddStep(!showAddStep)} className="w-full flex items-center justify-center gap-2 text-sm text-primary font-medium border-2 border-dashed border-primary/40 px-4 py-3 rounded-xl hover:bg-primary/5 transition-colors">
                        <Plus className="w-4 h-4" /> Add Step
                      </button>
                      {showAddStep && (
                        <div className="mt-2 grid grid-cols-2 gap-2 bg-white border border-border rounded-xl p-3 shadow-lg">
                          {Object.entries(ACTION_META).map(([type, meta]) => {
                            const Icon = meta.icon;
                            return (
                              <button
                                key={type}
                                onClick={() => addAction(type as ActionType)}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-left transition-colors"
                              >
                                <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                                  <Icon className={`w-3 h-3 ${meta.color}`} />
                                </div>
                                <span className="text-xs text-foreground font-medium">{meta.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right panel: stats + danger zone */}
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-border shadow-sm p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Performance</h3>
                  {[
                    { label: "Enrolled", value: selected.enrolledCount, color: "bg-blue-500" },
                    { label: "Completed", value: selected.completedCount, color: "bg-green-500" },
                    { label: "In Progress", value: selected.enrolledCount - selected.completedCount, color: "bg-amber-500" },
                  ].map((s) => (
                    <div key={s.label}>
                      <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">{s.label}</span><span className="font-semibold">{s.value}</span></div>
                      <div className="w-full bg-muted rounded-full h-1.5"><div className={`${s.color} h-1.5 rounded-full`} style={{ width: `${Math.min(100, (s.value / Math.max(1, selected.enrolledCount)) * 100)}%` }} /></div>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-xl border border-border shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Workflow Details</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(selected.createdAt).toLocaleDateString()}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Steps</span><span>{editActions.length}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Trigger</span><span className="truncate max-w-[120px]">{TRIGGER_LABELS[editTrigger]}</span></div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-border shadow-sm p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-2">Actions</h3>
                  <div className="space-y-1">
                    <button onClick={() => { const copy = { ...selected, name: `${selected.name} (copy)` }; create.mutate({ ...copy, id: undefined }); }} className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted flex items-center gap-2">
                      <Copy className="w-3.5 h-3.5 text-muted-foreground" /> Duplicate Workflow
                    </button>
                    <button onClick={() => remove.mutate(selected.id)} className="w-full text-left text-xs px-3 py-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 flex items-center gap-2 mt-2">
                      <Trash2 className="w-3.5 h-3.5" /> Delete Workflow
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-3">
              <div className="relative max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search workflows..." className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left text-xs font-semibold text-muted-foreground px-5 py-3">Workflow</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Trigger</th>
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Status</th>
                    <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Enrolled</th>
                    <th className="text-right text-xs font-semibold text-muted-foreground px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    <tr><td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">Loading...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={5} className="py-16 text-center">
                      <Zap className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                      <p className="text-sm font-medium text-foreground">No workflows yet</p>
                      <button onClick={() => setShowNew(true)} className="text-sm text-primary hover:underline mt-1">Create your first workflow</button>
                    </td></tr>
                  ) : filtered.map((w) => {
                    const s = status(w);
                    return (
                      <tr key={w.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3.5">
                          <button onClick={() => openEditor(w)} className="flex items-center gap-2.5 text-left group">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Zap className="w-4 h-4 text-primary" /></div>
                            <div>
                              <div className="text-sm font-semibold text-foreground group-hover:text-primary">{w.name}</div>
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
                        <td className="px-4 py-3.5 text-right text-sm font-medium">{w.enrolledCount}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEditor(w)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Edit3 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => update.mutate({ id: w.id, isActive: !w.isActive })} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                              {w.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => remove.mutate(w.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Create modal */}
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
                <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createWorkflow()} autoFocus className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. New Lead Welcome Series" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-2">Start from a template</label>
                <div className="space-y-2">
                  {TEMPLATES.map((t, i) => (
                    <button key={t.name} onClick={() => { setSelectedTemplate(i); if (!newName) setNewName(t.name); }} className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${selectedTemplate === i ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                      <div className={`font-medium ${selectedTemplate === i ? "text-primary" : "text-foreground"}`}>{t.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{t.actions.length} steps · Trigger: {TRIGGER_LABELS[t.triggerType]}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2 justify-end">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground">Cancel</button>
              <button onClick={createWorkflow} disabled={!newName.trim() || create.isPending} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40">
                {create.isPending ? "Creating..." : "Create & Edit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
