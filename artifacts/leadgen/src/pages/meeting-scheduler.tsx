import { PageTitle, PageDescription } from "@/components/page-layout";
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
import { asArray } from "@/lib/data-shape";
import {addMonths,addWeeks,eachDayOfInterval,endOfMonth,endOfWeek,format,isSameDay,isSameMonth,
  startOfMonth,startOfWeek,subMonths,subWeeks} from "date-fns";

interface EventType { id: string; slug: string; title: string; description?: string; durationMinutes: number; color: string; location?: string; isActive: boolean; requiresConfirmation: boolean; bufferAfter: number; availableDays: string[]; availableStart: string; availableEnd: string; timezone: string; }
interface Appointment { id: string; eventTypeId: string; guestName: string; guestEmail: string; guestCompany?: string; startAt: string; endAt: string; status: string; notes?: string; }

const COLORS = ["#f97316", "#3b82f6", "#8b5cf6", "#10b981", "#ef4444", "#f59e0b"];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

export default function MeetingScheduler() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"event-types" | "appointments" | "calendar">("calendar");
  const [calendarView,setCalendarView]=useState<"month"|"week">("month");
  const [calendarDate,setCalendarDate]=useState(new Date());
  const [selectedDay,setSelectedDay]=useState(new Date());
  const [selectedAppointment,setSelectedAppointment]=useState<Appointment|null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", durationMinutes: 30, color: "#f97316", location: "", isActive: true, requiresConfirmation: false, bufferAfter: 15, availableDays: ["mon", "tue", "wed", "thu", "fri"], availableStart: "09:00", availableEnd: "17:00", timezone: "America/New_York" });

  const { data: eventTypesResponse = [],error:eventTypesError } = useQuery<EventType[]>({ queryKey: ["event-types"], queryFn: () => apiFetch("/meeting/event-types") });
  const { data: appointmentsResponse = [],error:appointmentsError } = useQuery<Appointment[]>({ queryKey: ["appointments"], queryFn: () => apiFetch("/meeting/appointments") });
  const eventTypes = asArray<EventType>(eventTypesResponse);
  const appointments = asArray<Appointment>(appointmentsResponse);

  const addMutation = useMutation({
    mutationFn: (data: typeof form) => apiFetch("/meeting/event-types", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["event-types"] }); setShowAdd(false); toast({ title: "Event type created" }); },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiFetch(`/meeting/event-types/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event-types"] }),
  });

  const updateAppt = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'confirmed'|'completed'|'cancelled' }) => apiFetch(`/meeting/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["appointments"] }); setSelectedAppointment(null); toast({ title: "Appointment updated" }); },
  });

  const toggleDay = (day: string) => setForm(f => ({ ...f, availableDays: f.availableDays.includes(day) ? f.availableDays.filter(d => d !== day) : [...f.availableDays, day] }));

  const upcoming = appointments.filter(a => a.status === "confirmed" && new Date(a.startAt) > new Date()).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const past = appointments.filter(a => a.status !== "confirmed" || new Date(a.startAt) <= new Date());
  const calendarStart=calendarView==='month'?startOfWeek(startOfMonth(calendarDate)):startOfWeek(calendarDate);
  const calendarEnd=calendarView==='month'?endOfWeek(endOfMonth(calendarDate)):endOfWeek(calendarDate);
  const calendarDays=eachDayOfInterval({start:calendarStart,end:calendarEnd});
  const selectedAppointments=appointments.filter(a=>isSameDay(new Date(a.startAt),selectedDay))
    .sort((a,b)=>a.startAt.localeCompare(b.startAt));
  function moveCalendar(direction:-1|1){
    const next=calendarView==='month'
      ?direction===1?addMonths(calendarDate,1):subMonths(calendarDate,1)
      :direction===1?addWeeks(calendarDate,1):subWeeks(calendarDate,1);
    setCalendarDate(next);setSelectedDay(next);
  }

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="page-stack">
      <div className="flex items-center justify-between flex-wrap gap-4 min-w-0">
        <div>
          <PageTitle>Meeting Scheduler</PageTitle>
          <PageDescription>Create booking pages and manage appointments</PageDescription>
        </div>
        <Button className="bg-primary text-white" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-2" /> New Event Type</Button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b">
        {(["calendar", "appointments", "event-types"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t === "event-types" ? "Event Types" : t === "appointments" ? `Appointments (${appointments.length})` : "Calendar"}
          </button>
        ))}
      </div>

      {(appointmentsError||eventTypesError)&&<p role="alert" className="text-sm text-red-600">
        Could not load calendar data. Please refresh the page.
      </p>}

      {tab === "calendar" && (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 sm:px-5">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={()=>{setCalendarDate(new Date());setSelectedDay(new Date())}}>Today</Button>
                <Button size="icon" variant="ghost" aria-label="Previous period" onClick={()=>moveCalendar(-1)}><ChevronLeft className="h-4 w-4"/></Button>
                <Button size="icon" variant="ghost" aria-label="Next period" onClick={()=>moveCalendar(1)}><ChevronRight className="h-4 w-4"/></Button>
                <h2 className="text-sm font-semibold">{calendarView==='month'?format(calendarDate,'MMMM yyyy'):`${format(calendarStart,'MMM d')} - ${format(calendarEnd,'MMM d, yyyy')}`}</h2>
              </div>
              <div role="group" aria-label="Calendar view" className="flex rounded-lg border p-0.5">
                {(['month','week'] as const).map(view=><Button key={view} size="sm" variant={calendarView===view?'secondary':'ghost'} onClick={()=>setCalendarView(view)}>{view==='month'?'Month':'Week'}</Button>)}
              </div>
            </div>
            <div className="grid grid-cols-7 border-b text-center text-xs text-muted-foreground">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(day=><div key={day} className="py-2">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {calendarDays.map(day=>{
                const dayAppointments=appointments.filter(a=>a.status!=='cancelled'&&isSameDay(new Date(a.startAt),day));
                return <button key={day.toISOString()} type="button" aria-label={format(day,'MMMM d, yyyy')}
                  aria-pressed={isSameDay(day,selectedDay)} onClick={()=>setSelectedDay(day)}
                  className={`min-h-16 min-w-0 border-b border-r p-1 text-left align-top transition-colors sm:min-h-24 sm:p-2 ${isSameDay(day,selectedDay)?'bg-primary/10':isSameMonth(day,calendarDate)?'hover:bg-muted/50':'bg-muted/30 text-muted-foreground'}`}>
                  <span className="block text-xs font-medium sm:text-sm">{format(day,'d')}</span>
                  {dayAppointments.length>0&&<span className="mt-1 block rounded bg-primary/10 px-1 text-[10px] text-primary sm:hidden">{dayAppointments.length} event{dayAppointments.length===1?'':'s'}</span>}
                  {dayAppointments.slice(0,2).map(a=><span key={a.id} className="mt-1 hidden truncate rounded bg-primary/10 px-1 text-xs text-primary sm:block">{format(new Date(a.startAt),'h:mm a')} {a.guestName}</span>)}
                  {dayAppointments.length>2&&<span className="text-[10px] text-muted-foreground">+{dayAppointments.length-2} more</span>}
                </button>;
              })}
            </div>
          </div>
          <aside className="min-w-0 rounded-xl border bg-card p-4 shadow-sm" aria-label="Selected day appointments">
            <h3 className="font-semibold">{format(selectedDay,'EEEE, MMMM d')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{selectedAppointments.length} appointment{selectedAppointments.length===1?'':'s'}</p>
            <div className="mt-4 space-y-2">{selectedAppointments.length?selectedAppointments.map(a=><button key={a.id} type="button"
              className="w-full rounded-lg border p-3 text-left hover:bg-muted/40" onClick={()=>setSelectedAppointment(a)}>
              <span className="block text-sm font-medium">{a.guestName}</span><span className="block text-xs text-muted-foreground">{format(new Date(a.startAt),'h:mm a')} · {eventTypes.find(type=>type.id===a.eventTypeId)?.title||'Appointment'}</span>
            </button>):<p className="text-sm text-muted-foreground">No appointments for this day.</p>}</div>
          </aside>
        </div>
      )}

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
                  {asArray<string>(et.availableDays).map(d => <span key={d} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-medium">{DAY_LABELS[d]}</span>)}
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
          {appointments.length === 0 && <div className="text-center py-16 text-muted-foreground">No appointments yet: share your booking link to get started</div>}
        </div>
      )}

      <Dialog open={!!selectedAppointment} onOpenChange={open=>{if(!open)setSelectedAppointment(null)}}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Appointment details</DialogTitle></DialogHeader>
          {selectedAppointment&&<div className="space-y-3 text-sm">
            <div><p className="font-semibold">{selectedAppointment.guestName}</p><p className="text-muted-foreground">{selectedAppointment.guestEmail}</p></div>
            <p>{format(new Date(selectedAppointment.startAt),'EEEE, MMMM d, yyyy')} · {format(new Date(selectedAppointment.startAt),'h:mm a')} to {format(new Date(selectedAppointment.endAt),'h:mm a')}</p>
            <p>{eventTypes.find(type=>type.id===selectedAppointment.eventTypeId)?.title||'Appointment'} · {selectedAppointment.status}</p>
            {selectedAppointment.notes&&<p className="rounded-lg bg-muted p-3">{selectedAppointment.notes}</p>}
            {updateAppt.error&&<p role="alert" className="text-red-600">{String(updateAppt.error)}</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              {selectedAppointment.status==='confirmed'&&<><Button size="sm" onClick={()=>updateAppt.mutate({id:selectedAppointment.id,status:'completed'})} disabled={updateAppt.isPending}>Mark completed</Button>
                <Button size="sm" variant="outline" onClick={()=>updateAppt.mutate({id:selectedAppointment.id,status:'cancelled'})} disabled={updateAppt.isPending}>Cancel appointment</Button></>}
            </div>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Event Type</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1"><Label>Title *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="30 Min Strategy Call" /></div>
            <div className="space-y-1"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Brief description shown to invitees" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
