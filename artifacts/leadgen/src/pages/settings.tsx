import { PageTitle, PageDescription } from "@/components/page-layout";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Building2, Bell, Users, Key, Check } from "lucide-react";
import { Link } from "wouter";
import { ConnectedAccounts } from "@/components/connected-accounts";
import {SocialAttributionSettings} from "@/components/social-attribution-settings";

export default function Settings() {
  const { toast } = useToast();
  const [org, setOrg] = useState({ name: "", domain: "", website: "" });
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

      <div className="page-stack">
        <div>
          <PageTitle>Settings</PageTitle>
          <PageDescription>Organization and notification preferences</PageDescription>
        </div>

        <ConnectedAccounts />
        <SocialAttributionSettings />

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <Link href="/team">
              <Button size="sm" variant="outline" className="h-8 text-xs">Manage Team</Button>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            Team members are loaded from your VictorySync workspace. Use Team Management to invite users and control their access.
          </p>
        </Card>

        {/* API Key */}
        <Card className="p-6 border border-border bg-card">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">API Access</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Create, revoke, and manage real VictorySync API keys.</p>
            </div>
            <Link href="/billing-integration">
              <Button variant="outline" size="sm">Manage API Keys</Button>
            </Link>
          </div>
        </Card>
      </div>

  );
}
