import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, Search, Edit3, Trash2, Copy, Eye, Save, X, Star } from "lucide-react";

interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  body: string;
  previewText?: string;
  category: string;
  tags: string[];
  isDefault: boolean;
  useCount: number;
  createdAt: string;
}

const CATEGORIES = ["all", "onboarding", "sales", "outreach", "reviews", "reminders", "retention", "general"];

const CATEGORY_COLORS: Record<string, string> = {
  onboarding: "bg-green-100 text-green-700 border-green-200",
  sales: "bg-blue-100 text-blue-700 border-blue-200",
  outreach: "bg-purple-100 text-purple-700 border-purple-200",
  reviews: "bg-amber-100 text-amber-700 border-amber-200",
  reminders: "bg-orange-100 text-orange-700 border-orange-200",
  retention: "bg-pink-100 text-pink-700 border-pink-200",
  general: "bg-gray-100 text-gray-700 border-gray-200",
};

const VARS = ["{{firstName}}", "{{lastName}}", "{{email}}", "{{company}}", "{{senderName}}", "{{appointmentDate}}", "{{appointmentTime}}"];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

type ModalMode = { type: "none" } | { type: "edit"; template: EmailTemplate } | { type: "create" } | { type: "preview"; template: EmailTemplate };

export default function EmailTemplates() {
  const qc = useQueryClient();
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<ModalMode>({ type: "none" });
  const [form, setForm] = useState({ name: "", subject: "", body: "", previewText: "", category: "general" });
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }
  function openCreate() { setForm({ name: "", subject: "", body: "", previewText: "", category: "general" }); setModal({ type: "create" }); }
  function openEdit(t: EmailTemplate) { setForm({ name: t.name, subject: t.subject, body: t.body, previewText: t.previewText ?? "", category: t.category }); setModal({ type: "edit", template: t }); }

  const { data: templates = [], isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["email-templates"],
    queryFn: () => apiFetch("/api/email-templates"),
  });

  const create = useMutation({
    mutationFn: (body: object) => apiFetch("/api/email-templates", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); setModal({ type: "none" }); showToast("Template created!"); },
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<EmailTemplate>) => apiFetch(`/api/email-templates/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); setModal({ type: "none" }); showToast("Template saved!"); },
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/email-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); showToast("Template deleted."); },
  });

  const duplicate = useMutation({
    mutationFn: (t: EmailTemplate) => apiFetch("/api/email-templates", { method: "POST", body: JSON.stringify({ name: `${t.name} (copy)`, subject: t.subject, body: t.body, previewText: t.previewText, category: t.category }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["email-templates"] }); showToast("Template duplicated!"); },
  });

  function handleSave() {
    if (modal.type === "create") create.mutate(form);
    if (modal.type === "edit") update.mutate({ id: modal.template.id, ...form });
  }

  function insertVar(v: string) {
    setForm((f) => ({ ...f, body: f.body + v }));
  }

  const filtered = templates.filter((t) => {
    if (category !== "all" && t.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(`${t.name} ${t.subject} ${t.body}`.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const byCategory = CATEGORIES.slice(1).map((c) => ({ c, count: templates.filter((t) => t.category === c).length })).filter((x) => x.count > 0);

  return (
    <>
      <div className="space-y-5">
        {toast && (
          <div className="fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
            {toast}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Email Templates</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Reusable email templates for sequences, automations and campaigns</p>
          </div>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90">
            <Plus className="w-4 h-4" /> New Template
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total", value: templates.length, color: "text-blue-600" },
            { label: "Default", value: templates.filter((t) => t.isDefault).length, color: "text-amber-500" },
            { label: "Custom", value: templates.filter((t) => !t.isDefault).length, color: "text-purple-600" },
            { label: "Categories", value: byCategory.length, color: "text-green-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-border shadow-sm p-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates..." className="pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-white outline-none focus:ring-2 focus:ring-primary/30 w-48" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors capitalize ${category === c ? "bg-primary text-white border-primary" : "bg-white border-border text-muted-foreground hover:border-primary/40"}`}>
                {c} {c !== "all" && templates.filter((t) => t.category === c).length > 0 && `(${templates.filter((t) => t.category === c).length})`}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading templates...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-border shadow-sm p-12 text-center">
            <Mail className="w-14 h-14 text-muted-foreground/20 mx-auto mb-4" />
            <p className="font-semibold text-foreground">No templates found</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first email template to use in sequences and automations</p>
            <button onClick={openCreate} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90">Create Template</button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {filtered.map((t) => {
              const catColor = CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.general!;
              return (
                <div key={t.id} className="bg-white rounded-xl border border-border shadow-sm p-5 flex flex-col gap-3 hover:border-primary/30 transition-colors group">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-foreground text-sm">{t.name}</span>
                        {t.isDefault && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />}
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border capitalize inline-block mt-0.5 ${catColor}`}>{t.category}</span>
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => setModal({ type: "preview", template: t })} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Eye className="w-3.5 h-3.5" /></button>
                      <button onClick={() => duplicate.mutate(t)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Copy className="w-3.5 h-3.5" /></button>
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Edit3 className="w-3.5 h-3.5" /></button>
                      {!t.isDefault && <button onClick={() => remove.mutate(t.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">Subject</div>
                    <div className="text-sm font-medium text-foreground truncate">{t.subject}</div>
                  </div>
                  {t.previewText && <div className="text-xs text-muted-foreground truncate">{t.previewText}</div>}
                  <div className="flex gap-2 mt-auto pt-2 border-t border-border">
                    <button onClick={() => openEdit(t)} className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                      <Edit3 className="w-3 h-3" /> Edit
                    </button>
                    <button onClick={() => setModal({ type: "preview", template: t })} className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 bg-primary/5 border border-primary/30 rounded-lg text-primary hover:bg-primary/10 transition-colors">
                      <Eye className="w-3 h-3" /> Preview
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {modal.type === "preview" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModal({ type: "none" })}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-border max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
              <div>
                <div className="font-semibold text-foreground">{modal.template.name}</div>
                <div className="text-xs text-muted-foreground">Email Preview</div>
              </div>
              <button onClick={() => setModal({ type: "none" })} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="bg-muted/30 border border-border rounded-xl p-4 mb-4 space-y-1">
                <div><span className="text-xs font-medium text-muted-foreground">Subject: </span><span className="text-sm font-semibold text-foreground">{modal.template.subject}</span></div>
                {modal.template.previewText && <div><span className="text-xs font-medium text-muted-foreground">Preview: </span><span className="text-xs text-foreground">{modal.template.previewText}</span></div>}
              </div>
              <div className="bg-white border border-border rounded-xl p-5 text-sm text-foreground leading-relaxed whitespace-pre-wrap">{modal.template.body}</div>
            </div>
            <div className="px-6 py-4 border-t border-border flex gap-2 justify-end flex-shrink-0">
              <button onClick={() => { openEdit(modal.template); }} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:bg-muted">
                <Edit3 className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={() => setModal({ type: "none" })} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {(modal.type === "create" || modal.type === "edit") && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-border max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between flex-shrink-0">
              <h3 className="font-semibold text-foreground">{modal.type === "create" ? "New Template" : `Edit: ${modal.template.name}`}</h3>
              <button onClick={() => setModal({ type: "none" })} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Template Name *</label>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. Welcome Email" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Category</label>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white outline-none">
                    {CATEGORIES.slice(1).map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Subject Line *</label>
                <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. Welcome to {{company}}!" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Preview Text</label>
                <input value={form.previewText} onChange={(e) => setForm((f) => ({ ...f, previewText: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder="Short summary shown in inbox preview..." />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Email Body *</label>
                  <div className="flex gap-1 flex-wrap">
                    {VARS.map((v) => (
                      <button key={v} onClick={() => insertVar(v)} className="text-[10px] font-mono bg-muted hover:bg-primary/10 hover:text-primary px-1.5 py-0.5 rounded border border-border transition-colors">
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                  rows={10}
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 resize-none font-mono"
                  placeholder={`Hi {{firstName}},\n\nYour email content here...\n\nBest,\n{{senderName}}`}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex gap-2 justify-end flex-shrink-0">
              <button onClick={() => setModal({ type: "none" })} className="px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:bg-muted">Cancel</button>
              <button
                onClick={handleSave}
                disabled={!form.name || !form.subject || !form.body || create.isPending || update.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40"
              >
                <Save className="w-4 h-4" />{create.isPending || update.isPending ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
