import { useState } from "react";
import { useListCampaigns, useCreateCampaign, useDeleteCampaign, getListCampaignsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, ArrowRight, Megaphone, Users, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, parseISO } from "date-fns";

const SOURCE_TYPES = ["email", "linkedin", "paid_search", "organic", "referral", "event", "social", "other"];
const STATUS_COLORS: Record<string, string> = {
  active: "hsl(140 70% 50%)",
  paused: "hsl(40 90% 60%)",
  archived: "hsl(215 20% 65%)",
};

export default function Campaigns() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", sourceType: "", status: "active" });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: campaigns, isLoading } = useListCampaigns();
  const createCampaign = useCreateCampaign();
  const deleteCampaign = useDeleteCampaign();

  function handleCreate() {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    createCampaign.mutate(
      { data: form },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          setShowCreate(false);
          setForm({ name: "", description: "", sourceType: "", status: "active" });
          toast({ title: "Campaign created" });
        },
      }
    );
  }

  function handleDelete(id: number) {
    deleteCampaign.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
        toast({ title: "Campaign deleted" });
      },
    });
  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Campaigns</h1>
            <p className="text-sm text-muted-foreground mt-1">{campaigns?.length ?? 0} campaigns</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> New Campaign
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44" />)}
          </div>
        ) : !campaigns?.length ? (
          <Card className="p-12 border border-border bg-card text-center">
            <Megaphone className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">No campaigns yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first campaign to start tracking lead sources</p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>New Campaign</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {campaigns.map((c) => {
              const convRate = c.leadCount > 0 ? Math.round((c.convertedCount / c.leadCount) * 100) : 0;
              return (
                <Card key={c.id} className="p-5 border border-border bg-card hover:border-primary/40 transition-colors group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs capitalize" style={{ borderColor: (STATUS_COLORS[c.status] ?? "hsl(215 20% 65%)") + "60", color: STATUS_COLORS[c.status] }}>
                          {c.status}
                        </Badge>
                        {c.sourceType && <span className="text-xs text-muted-foreground capitalize">{c.sourceType.replace("_", " ")}</span>}
                      </div>
                      <h3 className="font-semibold text-foreground text-sm truncate">{c.name}</h3>
                      {c.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      className="w-7 h-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive flex-shrink-0 ml-2"
                      onClick={() => handleDelete(c.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 py-3 border-y border-border my-3">
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{c.leadCount}</p>
                      <p className="text-xs text-muted-foreground">Leads</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{c.convertedCount}</p>
                      <p className="text-xs text-muted-foreground">Converted</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-primary">{convRate}%</p>
                      <p className="text-xs text-muted-foreground">Rate</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{formatDistanceToNow(parseISO(c.createdAt), { addSuffix: true })}</span>
                    <Link href={`/campaigns/${c.id}`}>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary">
                        View leads <ArrowRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input className="mt-1" placeholder="Q3 Outbound Campaign" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea className="mt-1 resize-none" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Source Type</Label>
                <Select value={form.sourceType} onValueChange={(v) => setForm((f) => ({ ...f, sourceType: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createCampaign.isPending}>
              {createCampaign.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}
