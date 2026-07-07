import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Mail,
  Plus,
  Trash2,
  CheckCircle2,
  Star,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Send,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Account = {
  id: number;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  isDefault: boolean;
  dailyLimit: number;
  sentToday: number;
};

const PRESETS: Record<string, { host: string; port: number }> = {
  gmail: { host: "smtp.gmail.com", port: 587 },
  outlook: { host: "smtp.office365.com", port: 587 },
  yahoo: { host: "smtp.mail.yahoo.com", port: 587 },
  custom: { host: "", port: 587 },
};

const PROVIDERS = [
  {
    key: "gmail",
    label: "Gmail",
    hint: "Use an App Password (not your regular password). Enable 2FA → Google Account → Security → App Passwords.",
    color: "#EA4335",
  },
  {
    key: "outlook",
    label: "Outlook / Microsoft",
    hint: "Use your Microsoft account password. Make sure SMTP AUTH is enabled in your M365 admin panel.",
    color: "#0078D4",
  },
  {
    key: "yahoo",
    label: "Yahoo Mail",
    hint: "Generate an App Password in Yahoo Account Security settings.",
    color: "#6001D2",
  },
  { key: "custom", label: "Custom SMTP", hint: "Enter your SMTP server details manually.", color: "#00E5FF" },
];

function useAccounts() {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const load = React.useCallback(async () => {
    const r = await fetch(`${BASE}/api/email-accounts`);
    if (r.ok) setAccounts(await r.json());
  }, []);
  React.useEffect(() => { load(); }, [load]);
  return { accounts, reload: load };
}

export default function EmailAccountsPage() {
  const { accounts, reload } = useAccounts();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, { ok: boolean; msg: string }>>({});
  const [preset, setPreset] = useState("gmail");
  const [showHint, setShowHint] = useState(true);
  const [form, setForm] = useState({
    fromName: "",
    fromEmail: "",
    smtpHost: PRESETS.gmail.host,
    smtpPort: PRESETS.gmail.port,
    smtpUser: "",
    smtpPassword: "",
    isDefault: false,
    dailyLimit: 100,
  });
  const [saving, setSaving] = useState(false);

  function applyPreset(key: string) {
    setPreset(key);
    const p = PRESETS[key] ?? PRESETS.custom;
    setForm((f) => ({ ...f, smtpHost: p.host, smtpPort: p.port }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const r = await fetch(`${BASE}/api/email-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const e = await r.json();
        toast({ title: "Error", description: JSON.stringify(e.error), variant: "destructive" });
        return;
      }
      toast({ title: "Account connected" });
      setOpen(false);
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    await fetch(`${BASE}/api/email-accounts/${id}`, { method: "DELETE" });
    reload();
  }

  async function handleSetDefault(id: number) {
    await fetch(`${BASE}/api/email-accounts/${id}/set-default`, { method: "POST" });
    reload();
  }

  async function handleTest(id: number) {
    setTesting(id);
    try {
      const r = await fetch(`${BASE}/api/email-accounts/${id}/test`, { method: "POST" });
      const data = await r.json();
      setTestResult((prev) => ({ ...prev, [id]: { ok: data.success, msg: data.message } }));
    } finally {
      setTesting(null);
    }
  }

  const currentPreset = PROVIDERS.find((p) => p.key === preset);

  return (

      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Email Accounts</h1>
            <p className="text-muted-foreground mt-1">Connect your sending accounts for cold outreach</p>
          </div>
          <Button onClick={() => setOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" /> Connect Account
          </Button>
        </div>

        {/* Setup tips */}
        {accounts.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3 text-primary">
              <Mail className="w-6 h-6" />
              <span className="font-semibold text-lg">Connect your first sending account</span>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Connect Gmail, Outlook, or any SMTP-enabled email to start sending cold emails and sequences directly
              from your own account — no third-party relay needed.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {PROVIDERS.slice(0, 3).map((p) => (
                <button
                  key={p.key}
                  onClick={() => { applyPreset(p.key); setOpen(true); }}
                  className="border border-border rounded-lg p-3 text-left hover:border-primary transition-colors"
                >
                  <div className="font-medium text-foreground text-sm">{p.label}</div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">{PRESETS[p.key].host}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Accounts list */}
        {accounts.map((acct) => (
          <div key={acct.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{acct.fromName}</span>
                    {acct.isDefault && (
                      <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">Default</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">{acct.fromEmail}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{acct.smtpHost}:{acct.smtpPort}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {testResult[acct.id] && (
                  <div className={`flex items-center gap-1 text-xs ${testResult[acct.id].ok ? "text-green-400" : "text-red-400"}`}>
                    {testResult[acct.id].ok ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {testResult[acct.id].msg}
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTest(acct.id)}
                  disabled={testing === acct.id}
                  className="border-border text-muted-foreground hover:text-foreground"
                >
                  {testing === acct.id ? "Testing…" : "Test"}
                </Button>
                {!acct.isDefault && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSetDefault(acct.id)}
                    className="border-border text-muted-foreground hover:text-foreground"
                  >
                    <Star className="w-3 h-3 mr-1" /> Set Default
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(acct.id)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
              <div className="flex items-center gap-1">
                <Send className="w-3 h-3" />
                <span>{acct.sentToday} / {acct.dailyLimit} sent today</span>
              </div>
              <div className="flex-1 bg-muted rounded-full h-1">
                <div
                  className="bg-primary h-1 rounded-full"
                  style={{ width: `${Math.min(100, (acct.sentToday / acct.dailyLimit) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}

        {/* Connect dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="bg-card border-border max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-foreground">Connect Email Account</DialogTitle>
            </DialogHeader>

            {/* Provider picker */}
            <div className="grid grid-cols-4 gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key)}
                  className={`rounded-lg border p-2 text-xs font-medium transition-colors ${
                    preset === p.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Hint */}
            {currentPreset && (
              <button
                onClick={() => setShowHint((h) => !h)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="text-left">{currentPreset.hint}</span>
                {showHint ? <ChevronUp className="w-3 h-3 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0" />}
              </button>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-foreground text-xs">Your Name</Label>
                  <Input
                    className="bg-background border-border text-foreground"
                    placeholder="John Smith"
                    value={form.fromName}
                    onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground text-xs">From Email</Label>
                  <Input
                    className="bg-background border-border text-foreground"
                    placeholder="you@gmail.com"
                    value={form.fromEmail}
                    onChange={(e) => setForm((f) => ({ ...f, fromEmail: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-foreground text-xs">SMTP Host</Label>
                  <Input
                    className="bg-background border-border text-foreground"
                    value={form.smtpHost}
                    onChange={(e) => setForm((f) => ({ ...f, smtpHost: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-foreground text-xs">Port</Label>
                  <Input
                    className="bg-background border-border text-foreground"
                    type="number"
                    value={form.smtpPort}
                    onChange={(e) => setForm((f) => ({ ...f, smtpPort: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-foreground text-xs">SMTP Username (usually your email)</Label>
                <Input
                  className="bg-background border-border text-foreground"
                  placeholder="you@gmail.com"
                  value={form.smtpUser}
                  onChange={(e) => setForm((f) => ({ ...f, smtpUser: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-foreground text-xs">
                  {preset === "gmail" ? "App Password (not your Gmail password)" : "Password"}
                </Label>
                <Input
                  className="bg-background border-border text-foreground"
                  type="password"
                  placeholder="••••••••••••"
                  value={form.smtpPassword}
                  onChange={(e) => setForm((f) => ({ ...f, smtpPassword: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-foreground text-xs">Daily Send Limit</Label>
                <Input
                  className="bg-background border-border text-foreground"
                  type="number"
                  value={form.dailyLimit}
                  onChange={(e) => setForm((f) => ({ ...f, dailyLimit: Number(e.target.value) }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} className="border-border text-foreground">
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground">
                {saving ? "Connecting…" : "Connect Account"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

  );
}
