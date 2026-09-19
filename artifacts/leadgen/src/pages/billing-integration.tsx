import { PageTitle, PageDescription } from "@/components/page-layout";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Key, Plus, Copy, Check, Trash2, Shield, Webhook, Code2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { asArray } from "@/lib/data-shape";

interface ApiKey { id: number; name: string; keyPrefix: string; scopes: string[]; isActive: boolean; lastUsedAt?: string; requestCount: number; expiresAt?: string; createdAt: string; }

const SCOPE_OPTIONS = [
  { value: "read", label: "Read", description: "GET endpoints: leads, campaigns, analytics" },
  { value: "write", label: "Write", description: "POST/PATCH: create & update data" },
  { value: "provision", label: "Provision", description: "Create & manage sub-accounts" },
  { value: "webhooks", label: "Webhooks", description: "Manage webhook subscriptions" },
  { value: "admin", label: "Admin", description: "Full access to all endpoints" },
];

const CODE_EXAMPLES: Record<string, string> = {
  provision: `POST https://app.victorysync.com/api/provision/accounts
Authorization: Bearer vs_live_YOUR_API_KEY
Content-Type: application/json

{
  "name": "Client Agency Name",
  "ownerEmail": "client@agency.com",
  "ownerName": "OWNER_NAME",
  "plan": "pro",
  "externalId": "cus_stripe_id_here"
}`,
  stats: `GET https://app.victorysync.com/api/provision/accounts/{externalId}/stats
Authorization: Bearer vs_live_YOUR_API_KEY

// Returns: account status, leads count, campaigns count, health score`,
  suspend: `PATCH https://app.victorysync.com/api/provision/accounts/{externalId}/status
Authorization: Bearer vs_live_YOUR_API_KEY
Content-Type: application/json

{ "status": "suspended" }   // or "active" / "cancelled"`,
  sso: `POST https://app.victorysync.com/api/auth/sso
Authorization: Bearer vs_live_YOUR_API_KEY
Content-Type: application/json

{
  "subAccountId": 123,
  "externalUserId": "user_abc",
  "email": "CLIENT_EMAIL",
  "name": "CLIENT_NAME",
  "role": "member"
}

// Response -> { ssoUrl, expiresAt }
// Redirect the client to ssoUrl - one-time use, expires in 5 min`,
};

export default function BillingIntegration() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState(["read", "provision"]);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeExample, setActiveExample] = useState("provision");
  const [expandedDocs, setExpandedDocs] = useState(true);

  const { data: keysResponse = [] } = useQuery<ApiKey[]>({ queryKey: ["api-keys"], queryFn: () => apiFetch("/api-keys") });
  const keys = asArray<ApiKey>(keysResponse);

  const createKey = useMutation({
    mutationFn: () => apiFetch("/api-keys", { method: "POST", body: JSON.stringify({ name: newKeyName, scopes: newKeyScopes }) }),
    onSuccess: (data: { rawKey: string } & ApiKey) => { qc.invalidateQueries({ queryKey: ["api-keys"] }); setRevealedKey(data.rawKey); setShowAdd(false); setNewKeyName(""); setNewKeyScopes(["read", "provision"]); },
  });

  const revokeKey = useMutation({
    mutationFn: (id: number) => apiFetch(`/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["api-keys"] }); toast({ title: "API key revoked" }); },
  });

  const toggleKey = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => apiFetch(`/api-keys/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const copyText = (text: string, id: string) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000); };
  const toggleScope = (scope: string) => setNewKeyScopes(s => s.includes(scope) ? s.filter(x => x !== scope) : [...s, scope]);

  return (
    <div className="page-stack">
      <div>
        <PageTitle>Billing System Integration</PageTitle>
        <PageDescription>Connect <strong>dashboard.victorysync.com</strong> to this platform via API keys and SSO</PageDescription>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Key, title: "API Keys", desc: "Authenticate your billing dashboard to call VictorySync APIs" },
          { icon: Webhook, title: "Webhooks", desc: "Receive real-time events when accounts are created or data changes" },
          { icon: Shield, title: "SSO", desc: "Redirect clients from your dashboard directly into VictorySync" },
        ].map(c => (
          <div key={c.title} className="bg-card border rounded-xl p-4 flex gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary h-fit"><c.icon className="w-4 h-4" /></div>
            <div><div className="font-semibold text-sm">{c.title}</div><div className="text-xs text-muted-foreground mt-0.5">{c.desc}</div></div>
          </div>
        ))}
      </div>

      {revealedKey && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm"><Shield className="w-4 h-4" /> Save this key now — it won't be shown again</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-amber-200 rounded px-3 py-2 text-sm font-mono break-all">{revealedKey}</code>
            <Button size="sm" variant="outline" onClick={() => copyText(revealedKey, "new-key")}>{copied === "new-key" ? <><Check className="w-3.5 h-3.5 mr-1.5 text-green-600" />Copied</> : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</>}</Button>
          </div>
          <button onClick={() => setRevealedKey(null)} className="text-xs text-amber-700 hover:text-amber-900">I've saved this key ✓</button>
        </div>
      )}

      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <h2 className="font-semibold text-sm">API Keys</h2>
          <Button size="sm" className="bg-primary text-white" onClick={() => setShowAdd(true)}><Plus className="w-3.5 h-3.5 mr-1.5" /> Create Key</Button>
        </div>
        {keys.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No API keys — create one to start integrating</div>
        ) : (
          <div className="overflow-x-auto"><table className="workspace-table w-full text-sm">
            <thead><tr className="border-b bg-muted/10">{["Name", "Key", "Scopes", "Requests", "Last Used", "Active", ""].map(h => <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id} className="border-b last:border-0 hover:bg-muted/10">
                  <td className="px-4 py-3 font-medium">{k.name}</td>
                  <td className="px-4 py-3"><code className="text-xs bg-muted px-2 py-0.5 rounded">{k.keyPrefix}…</code></td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{asArray<string>(k.scopes).map(s => <Badge key={s} variant="outline" className="text-[10px] h-4 px-1.5">{s}</Badge>)}</div></td>
                  <td className="px-4 py-3 text-muted-foreground">{k.requestCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "Never"}</td>
                  <td className="px-4 py-3"><Switch checked={k.isActive} onCheckedChange={v => toggleKey.mutate({ id: k.id, isActive: v })} /></td>
                  <td className="px-4 py-3"><Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={() => revokeKey.mutate(k.id)}><Trash2 className="w-3.5 h-3.5" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <button className="w-full flex items-center justify-between px-4 py-3 border-b bg-muted/30 hover:bg-muted/50 transition-colors" onClick={() => setExpandedDocs(d => !d)}>
          <span className="font-semibold text-sm flex items-center gap-2"><Code2 className="w-4 h-4" /> API Reference for dashboard.victorysync.com</span>
          {expandedDocs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {expandedDocs && (
          <div className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">Use these endpoints in your billing dashboard. All requests require <code className="bg-muted px-1.5 py-0.5 rounded text-xs">Authorization: Bearer YOUR_API_KEY</code>.</p>
            <div className="flex gap-2 flex-wrap">
              {Object.keys(CODE_EXAMPLES).map(k => (
                <button key={k} onClick={() => setActiveExample(k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize ${activeExample === k ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                  {k === "sso" ? "SSO / Login" : k.replace(/_/g, " ")}
                </button>
              ))}
            </div>
            <div className="relative">
              <pre className="bg-gray-950 text-green-400 rounded-xl p-4 text-xs overflow-x-auto font-mono leading-relaxed">{CODE_EXAMPLES[activeExample]}</pre>
              <Button size="sm" variant="outline" className="absolute top-2 right-2 h-7 bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => copyText(CODE_EXAMPLES[activeExample]!, activeExample)}>
                {copied === activeExample ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
            {activeExample === "sso" && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 space-y-1">
                <div className="font-semibold">How SSO works for dashboard.victorysync.com:</div>
                <ol className="list-decimal ml-4 space-y-0.5">
                  <li>Client logs into dashboard.victorysync.com</li>
                  <li>Your app calls <code className="bg-blue-100 px-1 rounded">POST /api/auth/sso</code> with the client's info</li>
                  <li>VictorySync returns a one-time <code className="bg-blue-100 px-1 rounded">ssoUrl</code> (valid 5 min)</li>
                  <li>Redirect the client to that URL - they land in VictorySync already logged in</li>
                </ol>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create API Key</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>Key Name *</Label><Input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Dashboard Integration" /></div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              {SCOPE_OPTIONS.map(s => (
                <div key={s.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${newKeyScopes.includes(s.value) ? "border-primary/40 bg-primary/5" : "hover:bg-muted/30"}`} onClick={() => toggleScope(s.value)}>
                  <div className={`w-4 h-4 rounded border mt-0.5 flex items-center justify-center shrink-0 ${newKeyScopes.includes(s.value) ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                    {newKeyScopes.includes(s.value) && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <div><div className="text-sm font-medium">{s.label}</div><div className="text-xs text-muted-foreground">{s.description}</div></div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button className="bg-primary text-white" onClick={() => createKey.mutate()} disabled={!newKeyName || newKeyScopes.length === 0 || createKey.isPending}>{createKey.isPending ? "Creating…" : "Create Key"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
