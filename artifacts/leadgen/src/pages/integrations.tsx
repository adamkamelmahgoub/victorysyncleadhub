import { useState } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, XCircle, Settings, ExternalLink, AlertCircle, Plug } from "lucide-react";

interface Integration {
  id: number;
  type: string;
  name: string;
  accountIdentifier?: string;
  status: "connected" | "disconnected" | "error";
  config: Record<string, unknown>;
  createdAt: string;
}

interface IntegrationDef {
  type: string;
  name: string;
  category: string;
  description: string;
  logo: string;
  color: string;
  fields?: { key: string; label: string; placeholder: string; type?: string }[];
  oauthLabel?: string;
}

const ALL_INTEGRATIONS: IntegrationDef[] = [
  { type: "gmail", name: "Gmail", category: "Email", description: "Send & receive emails via your Gmail account", logo: "G", color: "bg-red-500", oauthLabel: "Connect with Google" },
  { type: "outlook", name: "Outlook", category: "Email", description: "Connect your Microsoft Outlook or Office 365 email", logo: "O", color: "bg-blue-600", oauthLabel: "Connect with Microsoft" },
  { type: "twilio_sms", name: "Twilio SMS", category: "SMS", description: "Send & receive SMS messages via Twilio", logo: "T", color: "bg-red-600", fields: [
    { key: "account_sid", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
    { key: "auth_token", label: "Auth Token", placeholder: "Your Twilio auth token", type: "password" },
    { key: "from_number", label: "From Number", placeholder: "+15551234567" },
  ]},
  { type: "facebook", name: "Facebook", category: "Social", description: "Reply to Facebook messages and comments", logo: "f", color: "bg-blue-500", oauthLabel: "Connect with Facebook" },
  { type: "instagram", name: "Instagram", category: "Social", description: "Manage Instagram DMs and comments", logo: "IG", color: "bg-gradient-to-br from-purple-500 to-pink-500", oauthLabel: "Connect with Instagram" },
  { type: "linkedin", name: "LinkedIn", category: "Social", description: "Engage with LinkedIn messages and leads", logo: "in", color: "bg-blue-700", oauthLabel: "Connect with LinkedIn" },
  { type: "google_business", name: "Google Business", category: "Reviews", description: "Manage Google Business Profile reviews and messages", logo: "GB", color: "bg-green-500", oauthLabel: "Connect with Google" },
  { type: "whatsapp", name: "WhatsApp Business", category: "Messaging", description: "Send and receive WhatsApp messages", logo: "W", color: "bg-green-600", fields: [
    { key: "phone_number_id", label: "Phone Number ID", placeholder: "Your WhatsApp phone number ID" },
    { key: "access_token", label: "Access Token", placeholder: "Your Meta access token", type: "password" },
  ]},
  { type: "slack", name: "Slack", category: "Notifications", description: "Send lead alerts and notifications to Slack", logo: "S", color: "bg-purple-600", oauthLabel: "Connect with Slack" },
  { type: "zapier", name: "Zapier", category: "Automation", description: "Connect to 5,000+ apps via Zapier webhooks", logo: "Z", color: "bg-orange-500", fields: [
    { key: "webhook_url", label: "Webhook URL", placeholder: "https://hooks.zapier.com/hooks/catch/..." },
  ]},
  { type: "stripe", name: "Stripe", category: "Payments", description: "Track payments and revenue from Stripe", logo: "$", color: "bg-indigo-600", fields: [
    { key: "publishable_key", label: "Publishable Key", placeholder: "pk_live_..." },
    { key: "secret_key", label: "Secret Key", placeholder: "sk_live_...", type: "password" },
  ]},
  { type: "calendly", name: "Calendly", category: "Scheduling", description: "Sync Calendly bookings as contacts and appointments", logo: "C", color: "bg-teal-600", oauthLabel: "Connect with Calendly" },
];

const CATEGORIES = ["All", "Email", "SMS", "Social", "Messaging", "Reviews", "Notifications", "Automation", "Payments", "Scheduling"];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

export default function Integrations() {
  const qc = useQueryClient();
  const [category, setCategory] = useState("All");
  const [configuring, setConfiguring] = useState<IntegrationDef | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const { data: connected = [] } = useQuery<Integration[]>({
    queryKey: ["integrations"],
    queryFn: () => apiFetch("/api/integrations"),
  });

  const connect = useMutation({
    mutationFn: (body: object) => apiFetch("/api/integrations", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["integrations"] }); setConfiguring(null); setFieldValues({}); },
  });

  const disconnect = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/integrations/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
  });

  const connectedMap = new Map(connected.map((c) => [c.type, c]));

  const filtered = category === "All" ? ALL_INTEGRATIONS : ALL_INTEGRATIONS.filter((i) => i.category === category);

  function handleConnect(def: IntegrationDef) {
    if (def.fields) {
      setConfiguring(def);
    } else {
      // OAuth stub — simulate connection
      connect.mutate({
        type: def.type,
        name: def.name,
        accountIdentifier: `user@${def.type}.com`,
        status: "connected",
        config: {},
      });
    }
  }

  function handleFieldConnect() {
    if (!configuring) return;
    connect.mutate({
      type: configuring.type,
      name: configuring.name,
      accountIdentifier: fieldValues.from_number ?? fieldValues.phone_number_id ?? fieldValues.webhook_url ?? `${configuring.type} account`,
      status: "connected",
      config: fieldValues,
    });
  }

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Integrations & Connections</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Connect your channels to manage all conversations in one place</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="w-4 h-4 text-green-500" />
            {connected.filter((c) => c.status === "connected").length} connected
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Connected", value: connected.filter((c) => c.status === "connected").length, color: "text-green-600", bg: "bg-green-50", icon: CheckCircle },
            { label: "Available", value: ALL_INTEGRATIONS.length, color: "text-blue-600", bg: "bg-blue-50", icon: Plug },
            { label: "Errors", value: connected.filter((c) => c.status === "error").length, color: "text-red-600", bg: "bg-red-50", icon: AlertCircle },
            { label: "Categories", value: CATEGORIES.length - 1, color: "text-purple-600", bg: "bg-purple-50", icon: Settings },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-border shadow-sm p-4 flex gap-3 items-center">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg} flex-shrink-0`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                category === c ? "bg-primary text-white border-primary" : "bg-white border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Integration grid */}
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((def) => {
            const conn = connectedMap.get(def.type);
            const isConnected = conn?.status === "connected";
            return (
              <div key={def.type} className="bg-white rounded-xl border border-border shadow-sm p-5 flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${def.color}`}>
                    {def.logo}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-sm">{def.name}</span>
                      {isConnected && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                    </div>
                    <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{def.category}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed flex-1">{def.description}</p>
                {isConnected && conn?.accountIdentifier && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                    <span className="truncate">{conn.accountIdentifier}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  {isConnected ? (
                    <>
                      <button className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                        <Settings className="w-3.5 h-3.5" /> Settings
                      </button>
                      <button
                        onClick={() => conn && disconnect.mutate(conn.id)}
                        className="flex-1 text-xs py-2 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleConnect(def)}
                      className="w-full flex items-center justify-center gap-1.5 text-xs py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
                    >
                      {def.oauthLabel ?? "Connect"}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Config modal */}
      {configuring && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setConfiguring(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm ${configuring.color}`}>
                {configuring.logo}
              </div>
              <div>
                <div className="font-semibold text-foreground">Connect {configuring.name}</div>
                <div className="text-xs text-muted-foreground">{configuring.description}</div>
              </div>
              <button onClick={() => setConfiguring(null)} className="ml-auto text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {(configuring.fields ?? []).map((f) => (
                <div key={f.key}>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">{f.label}</label>
                  <input
                    type={f.type ?? "text"}
                    value={fieldValues[f.key] ?? ""}
                    onChange={(e) => setFieldValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                  />
                </div>
              ))}
              {connect.error && <p className="text-xs text-red-500">{String(connect.error)}</p>}
            </div>
            <div className="px-6 pb-6 flex gap-2 justify-end">
              <button onClick={() => setConfiguring(null)} className="px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted">Cancel</button>
              <button
                onClick={handleFieldConnect}
                disabled={connect.isPending}
                className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
              >
                {connect.isPending ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
