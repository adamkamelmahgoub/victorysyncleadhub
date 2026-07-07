import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Building2, Bell, Users, Key, Check } from "lucide-react";

const TEAM_MEMBERS = [
  { name: "Alex Carter", email: "alex@company.com", role: "Admin", initials: "AC" },
  { name: "Maya Patel", email: "maya@company.com", role: "Manager", initials: "MP" },
  { name: "Jordan Lee", email: "jordan@company.com", role: "Member", initials: "JL" },
];

export default function Settings() {
  const { toast } = useToast();
  const [org, setOrg] = useState({ name: "Acme Corp", domain: "acme.com", website: "https://acme.com" });
  const [notifications, setNotifications] = useState({
    newLead: true,
    highScore: true,
    formSubmission: true,
    weeklyReport: false,
    campaignUpdates: false,
  });
  const [saved, setSaved] = useState(false);

  function handleSaveOrg() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast({ title: "Settings saved" });
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Organization and notification preferences</p>
        </div>

        {/* Organization */}
        <Card className="p-6 border border-border bg-card">
          <div className="flex items-center gap-2 mb-5">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Organization</p>
          </div>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Organization Name</Label>
              <Input className="mt-1" value={org.name} onChange={(e) => setOrg((o) => ({ ...o, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Domain</Label>
                <Input className="mt-1" value={org.domain} onChange={(e) => setOrg((o) => ({ ...o, domain: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Website</Label>
                <Input className="mt-1" value={org.website} onChange={(e) => setOrg((o) => ({ ...o, website: e.target.value }))} />
              </div>
            </div>
            <div className="pt-1">
              <Button size="sm" onClick={handleSaveOrg} className="gap-1.5">
                {saved ? <Check className="w-3.5 h-3.5" /> : null}
                {saved ? "Saved!" : "Save Changes"}
              </Button>
            </div>
          </div>
        </Card>

        {/* Notifications */}
        <Card className="p-6 border border-border bg-card">
          <div className="flex items-center gap-2 mb-5">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Notifications</p>
          </div>
          <div className="space-y-4">
            {[
              { key: "newLead", label: "New lead added", description: "Get notified when a new lead is created" },
              { key: "highScore", label: "High-score leads", description: "Alert when a lead scores 70 or above" },
              { key: "formSubmission", label: "Form submissions", description: "Notify on every form submission" },
              { key: "weeklyReport", label: "Weekly report", description: "Receive a weekly pipeline summary" },
              { key: "campaignUpdates", label: "Campaign updates", description: "Notify on campaign status changes" },
            ].map(({ key, label, description }) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <Switch
                  checked={notifications[key as keyof typeof notifications]}
                  onCheckedChange={(v) => setNotifications((n) => ({ ...n, [key]: v }))}
                />
              </div>
            ))}
          </div>
        </Card>

        {/* Team */}
        <Card className="p-6 border border-border bg-card">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Team Members</p>
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => toast({ title: "Team invite coming soon" })}>
              Invite Member
            </Button>
          </div>
          <div className="space-y-3">
            {TEAM_MEMBERS.map((m) => (
              <div key={m.email} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                    {m.initials}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">{m.role}</Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* API Key */}
        <Card className="p-6 border border-border bg-card">
          <div className="flex items-center gap-2 mb-5">
            <Key className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">API Access</p>
          </div>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">API Key</Label>
              <div className="flex gap-2 mt-1">
                <Input className="font-mono text-xs" value="lg_live_••••••••••••••••••••••••••••••" readOnly />
                <Button variant="outline" size="sm" className="flex-shrink-0" onClick={() => toast({ title: "API key regeneration coming soon" })}>
                  Regenerate
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Use this key to authenticate API requests and integrate with external systems.</p>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
