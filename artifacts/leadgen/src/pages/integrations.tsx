import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle, XCircle, Settings, ExternalLink, AlertCircle,
  Plug, Copy, Info, ChevronDown, ChevronRight,
} from "lucide-react";

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
  connectType: "oauth" | "apikey";
  oauthProvider?: string;
  fields?: { key: string; label: string; placeholder: string; type?: string }[];
  oauthLabel?: string;
  validateEndpoint?: string;
  validatePayloadMap?: Record<string, string>;
  docsUrl?: string;
}

const ALL_INTEGRATIONS: IntegrationDef[] = [
  {
    type: "gmail", name: "Gmail", category: "Email", connectType: "oauth", oauthProvider: "google",
    description: "Send & receive emails. Connect your Gmail to power conversations and sequences.",
    logo: "G", color: "bg-red-500", oauthLabel: "Connect with Google",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
  },
  {
    type: "outlook", name: "Outlook / Office 365", category: "Email", connectType: "apikey",
    description: "Connect your Microsoft Outlook or Office 365 email for conversations.",
    logo: "O", color: "bg-blue-600",
    fields: [
      { key: "email", label: "Email Address", placeholder: "you@company.com" },
      { key: "client_id", label: "Azure App Client ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
      { key: "client_secret", label: "Client Secret", placeholder: "Your Azure app secret", type: "password" },
    ],
  },
  {
    type: "twilio_sms", name: "Twilio SMS", category: "SMS", connectType: "apikey",
    description: "Send & receive SMS messages. Validated against your live Twilio account.",
    logo: "T", color: "bg-red-600", validateEndpoint: "/api/oauth/twilio/validate",
    validatePayloadMap: { account_sid: "accountSid", auth_token: "authToken", from_number: "fromNumber" },
    fields: [
      { key: "account_sid", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
      { key: "auth_token", label: "Auth Token", placeholder: "Your Twilio auth token", type: "password" },
      { key: "from_number", label: "From Phone Number", placeholder: "+15551234567" },
    ],
    docsUrl: "https://console.twilio.com",
  },
  {
    type: "facebook", name: "Facebook", category: "Social", connectType: "oauth", oauthProvider: "facebook",
    description: "Reply to Facebook page messages and comments in one unified inbox.",
    logo: "f", color: "bg-blue-500", oauthLabel: "Connect with Facebook",
    docsUrl: "https://developers.facebook.com/apps",
  },
  {
    type: "instagram", name: "Instagram", category: "Social", connectType: "oauth", oauthProvider: "instagram",
    description: "Manage Instagram DMs and comments from your conversations inbox.",
    logo: "IG", color: "bg-gradient-to-br from-purple-500 to-pink-500", oauthLabel: "Connect with Instagram",
    docsUrl: "https://developers.facebook.com/apps",
  },
  {
    type: "linkedin", name: "LinkedIn", category: "Social", connectType: "oauth", oauthProvider: "linkedin",
    description: "Engage with LinkedIn messages and auto-import profile leads.",
    logo: "in", color: "bg-blue-700", oauthLabel: "Connect with LinkedIn",
    docsUrl: "https://www.linkedin.com/developers/apps",
  },
  {
    type: "google_business", name: "Google Business", category: "Reviews", connectType: "oauth", oauthProvider: "google_business",
    description: "Manage Google Business Profile reviews and Q&A from one place.",
    logo: "GB", color: "bg-green-600", oauthLabel: "Connect with Google",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
  },
  {
    type: "whatsapp", name: "WhatsApp Business", category: "Messaging", connectType: "apikey",
    description: "Send and receive WhatsApp messages via the Meta Cloud API.",
    logo: "W", color: "bg-green-500",
    fields: [
      { key: "phone_number_id", label: "Phone Number ID", placeholder: "Your WhatsApp phone number ID" },
      { key: "waba_id", label: "WhatsApp Business Account ID", placeholder: "Your WABA ID" },
      { key: "access_token", label: "Permanent Access Token", placeholder: "EAAxx...", type: "password" },
    ],
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
  },
  {
    type: "slack", name: "Slack", category: "Notifications", connectType: "oauth", oauthProvider: "slack",
    description: "Get real-time alerts for new leads, deal changes, and form submissions in Slack.",
    logo: "S", color: "bg-purple-600", oauthLabel: "Connect with Slack",
    docsUrl: "https://api.slack.com/apps",
  },
  {
    type: "zapier", name: "Zapier", category: "Automation", connectType: "apikey",
    description: "Connect to 5,000+ apps. Send contact events to any Zapier Zap via webhook.",
    logo: "Z", color: "bg-orange-500", validateEndpoint: "/api/oauth/zapier/validate",
    validatePayloadMap: { webhook_url: "webhookUrl" },
    fields: [{ key: "webhook_url", label: "Zapier Webhook URL", placeholder: "https://hooks.zapier.com/hooks/catch/..." }],
    docsUrl: "https://zapier.com/apps/webhook",
  },
  {
    type: "stripe", name: "Stripe", category: "Payments", connectType: "apikey",
    description: "Track payment events, invoices and revenue from Stripe contacts.",
    logo: "$", color: "bg-indigo-600",
    fields: [
      { key: "publishable_key", label: "Publishable Key", placeholder: "pk_live_..." },
      { key: "secret_key", label: "Secret Key", placeholder: "sk_live_...", type: "password" },
    ],
    docsUrl: "https://dashboard.stripe.com/apikeys",
  },
  {
    type: "calendly", name: "Calendly", category: "Scheduling", connectType: "oauth", oauthProvider: "calendly",
    description: "Auto-create contacts and appointments when someone books via Calendly.",
    logo: "C", color: "bg-teal-600", oauthLabel: "Connect with Calendly",
    docsUrl: "https://developer.calendly.com",
  },
];

const CATEGORIES = ["All", "Email", "SMS", "Social", "Messaging", "Reviews", "Notifications", "Automation", "Payments", "Scheduling"];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

function SetupGuide({ def, callbackUrls, onClose }: { def: IntegrationDef; callbackUrls: Record<string, string>; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const callbackUrl = def.oauthProvider ? callbackUrls[def.oauthProvider] ?? "" : "";

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-border" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm ${def.color}`}>{def.logo}</div>
          <div>
            <div className="font-semibold text-foreground">Set Up {def.name}</div>
            <div className="text-xs text-muted-foreground">OAuth credentials required</div>
          </div>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <div className="font-semibold mb-1">Before connecting, you need to create an OAuth app</div>
            <ol className="list-decimal list-inside space-y-1 text-xs text-amber-700">
              <li>Go to <a href={def.docsUrl} target="_blank" className="underline text-blue-600">{def.docsUrl}</a></li>
              <li>Create a new app / OAuth client</li>
              <li>Add the callback URL below as an authorized redirect URI</li>
              <li>Copy the Client ID and Client Secret</li>
              <li>Add them as Replit Secrets (see below)</li>
            </ol>
          </div>

          {callbackUrl && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1.5">Your OAuth Callback URL</div>
              <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                <code className="text-xs text-foreground flex-1 truncate">{callbackUrl}</code>
                <button onClick={() => copy(callbackUrl)} className="text-xs text-primary hover:text-primary/80 font-medium flex-shrink-0">
                  {copied ? "Copied!" : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">Required Replit Secrets</div>
            {def.oauthProvider === "google" || def.oauthProvider === "google_business" ? (
              <div className="space-y-2">
                <SecretItem name="GOOGLE_CLIENT_ID" desc="From Google Cloud Console → Credentials" />
                <SecretItem name="GOOGLE_CLIENT_SECRET" desc="From Google Cloud Console → Credentials" />
              </div>
            ) : def.oauthProvider === "facebook" ? (
              <div className="space-y-2">
                <SecretItem name="FACEBOOK_APP_ID" desc="From Meta Developer Portal → App Settings" />
                <SecretItem name="FACEBOOK_APP_SECRET" desc="From Meta Developer Portal → App Settings" />
              </div>
            ) : def.oauthProvider === "instagram" ? (
              <div className="space-y-2">
                <SecretItem name="INSTAGRAM_APP_ID" desc="Same as Facebook App ID (Meta platform)" />
                <SecretItem name="INSTAGRAM_APP_SECRET" desc="Same as Facebook App Secret (Meta platform)" />
              </div>
            ) : def.oauthProvider === "slack" ? (
              <div className="space-y-2">
                <SecretItem name="SLACK_CLIENT_ID" desc="From Slack API → Your App → Basic Info" />
                <SecretItem name="SLACK_CLIENT_SECRET" desc="From Slack API → Your App → Basic Info" />
              </div>
            ) : def.oauthProvider === "linkedin" ? (
              <div className="space-y-2">
                <SecretItem name="LINKEDIN_CLIENT_ID" desc="From LinkedIn Developer Portal → App" />
                <SecretItem name="LINKEDIN_CLIENT_SECRET" desc="From LinkedIn Developer Portal → App" />
              </div>
            ) : def.oauthProvider === "calendly" ? (
              <div className="space-y-2">
                <SecretItem name="CALENDLY_CLIENT_ID" desc="From Calendly Developer Portal → OAuth App" />
                <SecretItem name="CALENDLY_CLIENT_SECRET" desc="From Calendly Developer Portal → OAuth App" />
              </div>
            ) : null}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
            <span className="font-semibold">Add secrets:</span> In Replit, click the 🔒 lock icon in the left sidebar → Secrets → add the key-value pairs above. Once added, click "Connect" again.
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:bg-muted">Close</button>
          {def.oauthProvider && (
            <a href={`${BASE}/api/oauth/${def.oauthProvider}/start`} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-1.5">
              {def.oauthLabel ?? "Connect"} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function SecretItem({ name, desc }: { name: string; desc: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2 border border-border">
      <code className="text-xs font-mono text-foreground font-semibold flex-1">{name}</code>
      <button onClick={() => { navigator.clipboard.writeText(name); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="text-[10px] text-primary flex-shrink-0">
        {copied ? "✓" : <Copy className="w-3 h-3" />}
      </button>
      <div className="text-[10px] text-muted-foreground w-full col-span-full mt-0.5">{desc}</div>
    </div>
  );
}

export default function Integrations() {
  const qc = useQueryClient();
  const [category, setCategory] = useState("All");
  const [configuring, setConfiguring] = useState<IntegrationDef | null>(null);
  const [showGuide, setShowGuide] = useState<IntegrationDef | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState("");

  // Check URL params for OAuth result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success")) {
      const provider = params.get("provider") ?? "";
      setToast({ msg: `${provider} connected successfully!`, type: "success" });
      qc.invalidateQueries({ queryKey: ["integrations"] });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("error")) {
      const err = params.get("error") ?? "Unknown error";
      const provider = params.get("provider") ?? "";
      if (err === "not_configured") {
        const def = ALL_INTEGRATIONS.find((i) => i.oauthProvider === provider);
        if (def) setShowGuide(def);
      } else {
        setToast({ msg: `Connection failed: ${err}`, type: "error" });
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t); }
  }, [toast]);

  const { data: connected = [] } = useQuery<Integration[]>({
    queryKey: ["integrations"],
    queryFn: () => apiFetch("/api/integrations"),
  });

  const { data: callbackUrls = {} } = useQuery<Record<string, string>>({
    queryKey: ["oauth-callbacks"],
    queryFn: () => apiFetch("/api/oauth/callback-url"),
  });

  const { data: providerStatus = {} } = useQuery<Record<string, { configured: boolean }>>({
    queryKey: ["oauth-providers"],
    queryFn: () => apiFetch("/api/oauth/providers"),
  });

  const disconnect = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/integrations/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["integrations"] }); setToast({ msg: "Disconnected.", type: "success" }); },
  });

  const connectApiKey = useMutation({
    mutationFn: (body: object) => apiFetch("/api/integrations", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["integrations"] });
      setConfiguring(null);
      setFieldValues({});
      setToast({ msg: "Connected successfully!", type: "success" });
    },
  });

  const connectedMap = new Map(connected.map((c) => [c.type, c]));
  const filtered = category === "All" ? ALL_INTEGRATIONS : ALL_INTEGRATIONS.filter((i) => i.category === category);

  async function handleConnect(def: IntegrationDef) {
    if (def.connectType === "oauth") {
      const provider = def.oauthProvider ?? def.type;
      const status = providerStatus[provider];
      if (status && !status.configured) {
        setShowGuide(def);
        return;
      }
      // Initiate OAuth redirect
      window.location.href = `${BASE}/api/oauth/${provider}/start`;
    } else {
      setConfiguring(def);
      setValidationError("");
    }
  }

  async function handleFieldConnect() {
    if (!configuring) return;
    setValidationError("");

    if (configuring.validateEndpoint && configuring.validatePayloadMap) {
      setValidating(true);
      try {
        const payload: Record<string, string> = {};
        for (const [fieldKey, payloadKey] of Object.entries(configuring.validatePayloadMap)) {
          payload[payloadKey] = fieldValues[fieldKey] ?? "";
        }
        const res = await fetch(`${BASE}${configuring.validateEndpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json() as { success?: boolean; error?: string };
        if (!res.ok || !data.success) {
          setValidationError(data.error ?? "Validation failed");
          setValidating(false);
          return;
        }
        qc.invalidateQueries({ queryKey: ["integrations"] });
        setConfiguring(null);
        setFieldValues({});
        setToast({ msg: `${configuring.name} connected and verified!`, type: "success" });
      } catch (e) {
        setValidationError(String(e));
      } finally {
        setValidating(false);
      }
    } else {
      connectApiKey.mutate({
        type: configuring.type,
        name: configuring.name,
        accountIdentifier: fieldValues.email ?? fieldValues.from_number ?? `${configuring.name} account`,
        status: "connected",
        config: fieldValues,
      });
    }
  }

  const connectedCount = connected.filter((c) => c.status === "connected").length;

  return (
    <Layout>
      <div className="space-y-5">
        {/* Toast */}
        {toast && (
          <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 ${toast.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
            {toast.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {toast.msg}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Integrations & Connections</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Connect your real accounts to unify conversations and automate workflows</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="font-semibold text-foreground">{connectedCount}</span>
            <span className="text-muted-foreground">connected</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Connected", value: connectedCount, color: "text-green-600", bg: "bg-green-50", icon: CheckCircle },
            { label: "Available", value: ALL_INTEGRATIONS.length, color: "text-blue-600", bg: "bg-blue-50", icon: Plug },
            { label: "Errors", value: connected.filter((c) => c.status === "error").length, color: "text-red-600", bg: "bg-red-50", icon: AlertCircle },
            { label: "OAuth Configured", value: Object.values(providerStatus).filter((s) => s.configured).length, color: "text-purple-600", bg: "bg-purple-50", icon: Settings },
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

        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${category === c ? "bg-primary text-white border-primary" : "bg-white border-border text-muted-foreground hover:border-primary/40"}`}>
              {c}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-4">
          {filtered.map((def) => {
            const conn = connectedMap.get(def.type);
            const isConnected = conn?.status === "connected";
            const provider = def.oauthProvider ?? def.type;
            const oauthConfigured = providerStatus[provider]?.configured ?? false;
            const needsSetup = def.connectType === "oauth" && !oauthConfigured && !isConnected;

            return (
              <div key={def.type} className={`bg-white rounded-xl border shadow-sm p-5 flex flex-col gap-3.5 transition-all ${isConnected ? "border-green-200" : "border-border"}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${def.color}`}>
                    {def.logo}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground text-sm">{def.name}</span>
                      {isConnected && <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                      {needsSetup && (
                        <button onClick={() => setShowGuide(def)} className="flex items-center gap-0.5 text-[10px] text-amber-600 font-medium">
                          <Info className="w-3 h-3" /> Setup required
                        </button>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{def.category}</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed flex-1">{def.description}</p>
                {isConnected && conn?.accountIdentifier && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    <span className="truncate font-medium">{conn.accountIdentifier}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  {isConnected ? (
                    <>
                      <button className="flex-1 flex items-center justify-center gap-1.5 text-xs py-2 border border-border rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                        <Settings className="w-3.5 h-3.5" /> Settings
                      </button>
                      <button onClick={() => conn && disconnect.mutate(conn.id)} className="flex-1 text-xs py-2 border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors">
                        Disconnect
                      </button>
                    </>
                  ) : needsSetup ? (
                    <button onClick={() => setShowGuide(def)} className="w-full flex items-center justify-center gap-1.5 text-xs py-2 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors font-medium">
                      <Info className="w-3.5 h-3.5" /> View Setup Guide
                    </button>
                  ) : (
                    <button onClick={() => handleConnect(def)} className="w-full flex items-center justify-center gap-1.5 text-xs py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium">
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

      {/* OAuth Setup Guide Modal */}
      {showGuide && <SetupGuide def={showGuide} callbackUrls={callbackUrls as Record<string, string>} onClose={() => setShowGuide(null)} />}

      {/* API Key Config Modal */}
      {configuring && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setConfiguring(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm ${configuring.color}`}>{configuring.logo}</div>
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
              {configuring.docsUrl && (
                <a href={configuring.docsUrl} target="_blank" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <ExternalLink className="w-3.5 h-3.5" /> Get credentials from {configuring.name} console
                </a>
              )}
              {validationError && (
                <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{validationError}
                </div>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-2 justify-end">
              <button onClick={() => setConfiguring(null)} className="px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={handleFieldConnect} disabled={validating || connectApiKey.isPending} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors">
                {validating ? "Verifying..." : "Connect & Verify"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
