import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Globe, Plus, Trash2, Play, CheckCircle, XCircle, AlertCircle,
  Copy, Settings, Zap, ChevronRight, ToggleLeft, ToggleRight,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { asArray } from "@/lib/data-shape";

interface Webhook {
  id: number;
  name: string;
  url: string;
  events: string[];
  secret?: string;
  isActive: boolean;
  lastTriggeredAt?: string;
  successCount: number;
  failureCount: number;
  createdAt: string;
}

const ALL_EVENTS = [
  { group: "Contacts", events: ["contact.created", "contact.updated", "contact.deleted", "contact.tagged"] },
  { group: "Opportunities", events: ["opportunity.created", "opportunity.updated", "opportunity.stage_changed", "opportunity.won", "opportunity.lost"] },
  { group: "Forms", events: ["form.submitted"] },
  { group: "Appointments", events: ["appointment.scheduled", "appointment.cancelled"] },
  { group: "Automations", events: ["automation.enrolled", "automation.completed"] },
  { group: "Reviews", events: ["review.received", "review.replied"] },
];

export default function Webhooks() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", url: "", events: [] as string[], secret: "" });
  const [testResult, setTestResult] = useState<Record<number, { success: boolean; ms?: number; status?: number; error?: string } | null>>({});
  const [testing, setTesting] = useState<Record<number, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000); }

  const { data: webhooksResponse = [] } = useQuery<Webhook[]>({ queryKey: ["webhooks"], queryFn: () => apiFetch("/api/webhooks") });
  const webhooks = asArray<Webhook>(webhooksResponse).map((webhook) => ({
    ...webhook,
    events: asArray<string>(webhook.events),
  }));

  const create = useMutation({
    mutationFn: (body: object) => apiFetch("/api/webhooks", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks"] }); setShowCreate(false); setForm({ name: "", url: "", events: [], secret: "" }); showToast("Webhook created!"); },
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Webhook>) => apiFetch(`/api/webhooks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["webhooks"] }); setEditingId(null); showToast("Webhook updated!"); },
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  async function testWebhook(id: number) {
    setTesting((t) => ({ ...t, [id]: true }));
    try {
      const result = await apiFetch(`/api/webhooks/${id}/test`, { method: "POST" }) as { success: boolean; ms?: number; status?: number; error?: string };
      setTestResult((r) => ({ ...r, [id]: result }));
      qc.invalidateQueries({ queryKey: ["webhooks"] });
    } catch (e) {
      setTestResult((r) => ({ ...r, [id]: { success: false, error: String(e) } }));
    } finally {
      setTesting((t) => ({ ...t, [id]: false }));
    }
  }

  function toggleEvent(event: string) {
    setForm((f) => ({ ...f, events: f.events.includes(event) ? f.events.filter((e) => e !== event) : [...f.events, event] }));
  }

  function toggleAll(events: string[]) {
    setForm((f) => {
      const allSelected = events.every((e) => f.events.includes(e));
      return { ...f, events: allSelected ? f.events.filter((e) => !events.includes(e)) : [...new Set([...f.events, ...events])] };
    });
  }

  return (
    <>
      <div className="space-y-5">
        {toast && (
          <div className="fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />{toast}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Webhooks</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Send real-time event data to external systems when contacts and deals change</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90">
            <Plus className="w-4 h-4" /> New Webhook
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Webhooks", value: webhooks.length, color: "text-blue-600" },
            { label: "Successful Calls", value: webhooks.reduce((s, w) => s + w.successCount, 0), color: "text-green-600" },
            { label: "Failed Calls", value: webhooks.reduce((s, w) => s + w.failureCount, 0), color: "text-red-500" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-border shadow-sm p-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {webhooks.length === 0 ? (
          <div className="bg-white rounded-xl border border-border shadow-sm p-12 text-center">
            <Globe className="w-14 h-14 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-base font-semibold text-foreground">No webhooks yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Connect to Zapier, Make, n8n, or any HTTP endpoint</p>
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90">Create Your First Webhook</button>
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.map((wh) => {
              const result = testResult[wh.id];
              return (
                <div key={wh.id} className="bg-white rounded-xl border border-border shadow-sm p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${wh.isActive ? "bg-green-50" : "bg-muted"}`}>
                      <Globe className={`w-5 h-5 ${wh.isActive ? "text-green-600" : "text-muted-foreground"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground text-sm">{wh.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${wh.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border"}`}>
                          {wh.isActive ? "Active" : "Paused"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-xs text-muted-foreground font-mono truncate max-w-xs">{wh.url}</code>
                        <button onClick={() => { navigator.clipboard.writeText(wh.url); }} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {asArray<string>(wh.events).slice(0, 4).map((e) => (
                          <span key={e} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">{e}</span>
                        ))}
                        {asArray<string>(wh.events).length > 4 && <span className="text-[10px] text-muted-foreground">+{asArray<string>(wh.events).length - 4} more</span>}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-3 h-3" />{wh.successCount} ok</span>
                        <span className="flex items-center gap-1 text-red-500"><XCircle className="w-3 h-3" />{wh.failureCount} failed</span>
                        {wh.lastTriggeredAt && <span>Last: {new Date(wh.lastTriggeredAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => update.mutate({ id: wh.id, isActive: !wh.isActive })} className="p-1.5 rounded hover:bg-muted text-muted-foreground" title={wh.isActive ? "Pause" : "Activate"}>
                        {wh.isActive ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                      <button onClick={() => testWebhook(wh.id)} disabled={testing[wh.id]} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-40">
                        <Play className="w-3 h-3" />{testing[wh.id] ? "Testing..." : "Test"}
                      </button>
                      <button onClick={() => remove.mutate(wh.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {result && (
                    <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${result.success ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                      {result.success ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {result.success ? `✓ Delivered (${result.ms}ms, HTTP ${result.status})` : `✗ Failed: ${result.error ?? `HTTP ${result.status}`}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl border border-border max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-foreground">New Webhook</h3>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Name *</label>
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder="e.g. Zapier Lead Sync" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Secret (optional)</label>
                  <input value={form.secret} onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))} type="password" className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30" placeholder="HMAC signing secret" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Endpoint URL *</label>
                <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 font-mono" placeholder="https://hooks.zapier.com/hooks/catch/..." />
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-medium text-muted-foreground">Events to subscribe to</label>
                  <button onClick={() => { const allEvts = ALL_EVENTS.flatMap((g) => g.events); setForm((f) => ({ ...f, events: f.events.length === allEvts.length ? [] : allEvts })); }} className="text-xs text-primary hover:underline">
                    {form.events.length === ALL_EVENTS.flatMap((g) => g.events).length ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div className="space-y-3">
                  {ALL_EVENTS.map((group) => (
                    <div key={group.group} className="border border-border rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-foreground">{group.group}</span>
                        <button onClick={() => toggleAll(group.events)} className="text-[10px] text-primary hover:underline">
                          {group.events.every((e) => form.events.includes(e)) ? "Deselect all" : "Select all"}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {group.events.map((event) => (
                          <label key={event} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.events.includes(event)} onChange={() => toggleEvent(event)} className="rounded" />
                            <span className="text-xs text-foreground font-mono">{event}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground">Cancel</button>
              <button onClick={() => create.mutate(form)} disabled={!form.name || !form.url || form.events.length === 0 || create.isPending} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40">
                {create.isPending ? "Creating..." : `Create Webhook (${form.events.length} events)`}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
