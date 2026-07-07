import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Calendar, Clock, Plus, Video, MapPin, Link, Settings, Check, X, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface EventType { id: number; slug: string; title: string; description?: string; durationMinutes: number; color: string; location?: string; isActive: boolean; requiresConfirmation: boolean; bufferAfter: number; availableDays: string[]; availableStart: string; availableEnd: string; timezone: string; }
interface Appointment { id: number; eventTypeId: number; guestName: string; guestEmail: string; guestCompany?: string; startAt: string; endAt: string; status: string; notes?: string; }

const COLORS = ["#f97316", "#3b82f6", "#8b5cf6", "#10b981", "#ef4444", "#f59e0b"];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

export default function MeetingScheduler() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"event-types" | "appointments">("event-types");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", durationMinutes: 30, color: "#f97316", location: "", isActive: true, requiresConfirmation: false, bufferAfter: 15, availableDays: ["mon", "tue", "wed", "thu", "fri"], availableStart: "09:00", availableEnd: "17:00", timezone: "America/New_York" });

  const { data: eventTypes = [] } = useQuery<EventType[]>({ queryKey: ["event-types"], queryFn: () => apiFetch("/meeting/event-types") });
  const { data: appointments = [] } = useQuery<Appointment[]>({ queryKey: ["appointments"], queryFn: () => apiFetch("/meeting/appointments") });

  const addMutation = useMutation({
    mutationFn: (data: typeof form) => apiFetch("/meeting/event-types", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["event-types"] }); setShowAdd(false); toast({ title: "Event type created" }); },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => apiFetch(`/meeting/event-types/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event-types"] }),
  });

  const updateAppt = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiFetch(`/meeting/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["appointments"] }); toast({ title: "Appointment updated" }); },
  });

  const toggleDay = (day: string) => setForm(f => ({ ...f, availableDays: f.availableDays.includes(day) ? f.availableDays.filter(d => d !== day) : [...f.availableDays, day] }));

  const upcoming = appointments.filter(a => a.status === "confirmed" && new Date(a.startAt) > new Date()).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const past = appointments.filter(a => a.status !== "confirmed" || new Date(a.startAt) <= new Date());

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meeting Scheduler</h1>
          <p className="text-muted-foreground text-sm">Create booking pages and manage appointments</p>
        </div>
        <Button className="bg-primary text-white" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-2" /> New Event Type</Button>
      </div>

      <div className="flex gap-1 border-b">
        {(["event-types", "appointments"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t === "event-types" ? "Event Types" : `Appointments (${appointments.length})`}
          </button>
        ))}
      </div>

      {tab === "event-types" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {eventTypes.map(et => (
            <div key={et.id} className="bg-card border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-1.5" style={{ backgroundColor: et.color }} />
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold">{et.title}</div>
                    {et.description && <div className="text-xs text-muted-foreground mt-0.5">{et.description}</div>}
                  </div>
                  <Switch checked={et.isActive} onCheckedChange={v => toggleActive.mutate({ id: et.id, isActive: v })} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3" />{et.durationMinutes} min</span>
                  {et.location && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="w-3 h-3" />{et.location}</span>}
                  {et.requiresConfirmation && <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 rounded px-1.5"><Check className="w-3 h-3" />Requires confirm</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {et.availableDays.map(d => <span key={d} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium">{DAY_LABELS[d]}</span>)}
                </div>
                <div className="flex gap-2 pt-1 border-t">
                  <button
                    onClick={() => { navigator.clipboard.writeText(`${appUrl}/book/${et.slug}`); toast({ title: "Link copied!" }); }}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border rounded-lg py-1.5 transition-colors"
                  >
                    <Link className="w-3 h-3" /> Copy Link
                  </button>
                  <a href={`/book/${et.slug}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 text-xs text-primary border border-primary/20 bg-primary/5 rounded-lg py-1.5 hover:bg-primary/10 transition-colors">
                    <Video className="w-3 h-3" /> Preview
                  </a>
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => setShowAdd(true)} className="border-2 border-dashed rounded-xl p-6 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors flex flex-col items-center justify-center gap-2">
            <Plus className="w-6 h-6" /><span className="text-sm font-medium">Add Event Type</span>
          </button>
        </div>
      )}

      {tab === "appointments" && (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Upcoming ({upcoming.length})</h3>
              <div className="space-y-2">
                {upcoming.map(a => (
                  <div key={a.id} className="bg-card border rounded-xl p-4 flex items-center gap-4">
                    <div className="text-center min-w-[60px]">
                      <div className="text-lg font-bold">{new Date(a.startAt).getDate()}</div>
                      <div className="text-xs text-muted-foreground">{new Date(a.startAt).toLocaleDateString("en", { month: "short" })}</div>
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">{a.guestName}</div>
                      <div className="text-sm text-muted-foreground">{a.guestEmail}{a.guestCompany && ` · ${a.guestCompany}`}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{new Date(a.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {new Date(a.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                    <Badge className="bg-green-100 text-green-700">Confirmed</Badge>
                    <Button size="sm" variant="outline" onClick={() => updateAppt.mutate({ id: a.id, status: "cancelled" })}>Cancel</Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {appointments.length === 0 && <div className="text-center py-16 text-muted-foreground">No appointments yet — share your booking link to get started</div>}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Event Type</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>Title *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="30 Min Strategy Call" /></div>
            <div className="space-y-1"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Brief description shown to invitees" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Duration (min)</Label>
                <Select value={String(form.durationMinutes)} onValueChange={v => setForm(f => ({ ...f, durationMinutes: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[15, 30, 45, 60, 90, 120].map(d => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Buffer After (min)</Label>
                <Select value={String(form.bufferAfter)} onValueChange={v => setForm(f => ({ ...f, bufferAfter: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[0, 5, 10, 15, 30].map(d => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Location / Meeting Link</Label><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Zoom link, Google Meet, or address" /></div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">{COLORS.map(c => <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? "scale-125 ring-2 ring-offset-2 ring-gray-400" : ""}`} style={{ backgroundColor: c }} />)}</div>
            </div>
            <div className="space-y-2">
              <Label>Available Days</Label>
              <div className="flex gap-1">{DAYS.map(d => <button key={d} onClick={() => toggleDay(d)} className={`px-2 py-1 rounded text-xs font-medium transition-colors ${form.availableDays.includes(d) ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>{DAY_LABELS[d]}</button>)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Start Time</Label><Input type="time" value={form.availableStart} onChange={e => setForm(f => ({ ...f, availableStart: e.target.value }))} /></div>
              <div className="space-y-1"><Label>End Time</Label><Input type="time" value={form.availableEnd} onChange={e => setForm(f => ({ ...f, availableEnd: e.target.value }))} /></div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div><div className="text-sm font-medium">Requires Confirmation</div><div className="text-xs text-muted-foreground">Manually approve each booking</div></div>
              <Switch checked={form.requiresConfirmation} onCheckedChange={v => setForm(f => ({ ...f, requiresConfirmation: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button className="bg-primary text-white" onClick={() => addMutation.mutate(form)} disabled={!form.title || addMutation.isPending}>{addMutation.isPending ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
