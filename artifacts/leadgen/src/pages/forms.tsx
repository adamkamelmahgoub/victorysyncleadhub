import { PageTitle, PageDescription } from "@/components/page-layout";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, ArrowRight, FormInput, Copy, Check } from "lucide-react";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, parseISO } from "date-fns";
import { asArray } from "@/lib/data-shape";

type FormRow = { id: string; name: string; description?: string | null; status: string; fields?: unknown[]; submissionCount?: number; embedCode?: string | null; createdAt?: string | null };
type CampaignRow = { id: string; name: string };
const formsQueryKey = ["marketing-forms"];

function formatRelativeDate(value: string | null | undefined) {
  if (!value) return "Date unavailable";
  const date = parseISO(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : formatDistanceToNow(date, { addSuffix: true });
}

export default function Forms() {
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", campaignId: "", status: "active" });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: formsResponse, isLoading, error: formsError } = useQuery<FormRow[]>({ queryKey: formsQueryKey, queryFn: () => apiFetch("/api/forms") });
  const { data: campaigns } = useQuery<CampaignRow[]>({ queryKey: ["marketing-campaigns"], queryFn: () => apiFetch("/api/campaigns") });
  const forms = asArray<FormRow>(formsResponse);
  const campaignRows = asArray<CampaignRow>(campaigns);
  const createForm = useMutation({ mutationFn: (data: object) => apiFetch("/api/forms", { method: "POST", body: JSON.stringify(data) }) });
  const deleteForm = useMutation({ mutationFn: (id: string) => apiFetch(`/api/forms/${encodeURIComponent(id)}`, { method: "DELETE" }) });

  function handleCreate() {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    createForm.mutate(
      { ...form, campaignId: form.campaignId || null, fields: [] },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: formsQueryKey });
          setShowCreate(false);
          setForm({ name: "", description: "", campaignId: "", status: "active" });
          toast({ title: "Form created" });
        },
        onError: (error) => toast({ title: "Could not create form", description: error instanceof Error ? error.message : String(error), variant: "destructive" }),
      }
    );
  }

  function handleDelete(id: string) {
    if (!window.confirm("Delete this form and its submissions?")) return;
    deleteForm.mutate(id, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: formsQueryKey });
        toast({ title: "Form deleted" });
      },
      onError: (error) => toast({ title: "Could not delete form", description: error instanceof Error ? error.message : String(error), variant: "destructive" }),
    });
  }

  function copyEmbed(embedCode: string | null | undefined, id: string) {
    if (!embedCode) return;
    navigator.clipboard.writeText(embedCode);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Embed code copied!" });
  }

  return (
    <>
      <div className="page-stack ">
        <div className="flex items-center justify-between flex-wrap gap-4 min-w-0">
          <div>
            <PageTitle>Forms</PageTitle>
            <PageDescription>Embeddable lead capture forms</PageDescription>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> New Form
          </Button>
        </div>

        {formsError ? (
          <Card className="p-6 border-destructive/40" role="alert">
            <p className="font-medium">Forms could not be loaded</p>
            <p className="text-sm text-muted-foreground mt-1">{formsError instanceof Error ? formsError.message : String(formsError)}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => queryClient.invalidateQueries({ queryKey: formsQueryKey })}>Try again</Button>
          </Card>
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-52" />)}
          </div>
        ) : forms.length === 0 ? (
          <Card className="p-12 border border-border bg-card text-center">
            <FormInput className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">No forms yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create embeddable forms to capture leads from any website</p>
            <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>New Form</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {forms.map((f) => (
              <Card key={f.id} className="p-5 border border-border bg-card hover:border-primary/40 transition-colors group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs" style={{ borderColor: f.status === "active" ? "hsl(140 70% 50% / 0.5)" : "hsl(215 20% 65% / 0.5)", color: f.status === "active" ? "hsl(140 70% 50%)" : "hsl(215 20% 65%)" }}>
                        {f.status}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-foreground text-sm">{f.name}</h3>
                    {f.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{f.description}</p>}
                  </div>
                  <Button
                    variant="ghost" size="icon"
                    className="w-7 h-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive flex-shrink-0 ml-2"
                    onClick={() => handleDelete(f.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="flex items-center gap-4 py-3 border-y border-border my-3">
                  <div>
                    <p className="text-lg font-bold text-foreground">{f.submissionCount}</p>
                    <p className="text-xs text-muted-foreground">Submissions</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{asArray(f.fields).length}</p>
                    <p className="text-xs text-muted-foreground">Fields</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Button
                    variant="outline" size="sm"
                    className="w-full gap-1.5 text-xs"
                    onClick={() => copyEmbed(f.embedCode, f.id)}
                  >
                    {copiedId === f.id ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedId === f.id ? "Copied!" : "Copy Embed Code"}
                  </Button>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{formatRelativeDate(f.createdAt)}</span>
                      <Link href={`/forms/${f.id}`}>
                      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary">
                        Edit form <ArrowRight className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Form</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Form Name *</Label>
              <Input className="mt-1" placeholder="Contact Us" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea className="mt-1 resize-none" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Campaign</Label>
                <Select value={form.campaignId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, campaignId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No campaign</SelectItem>
                    {campaignRows.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createForm.isPending}>
              {createForm.isPending ? "Creating..." : "Create Form"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}
