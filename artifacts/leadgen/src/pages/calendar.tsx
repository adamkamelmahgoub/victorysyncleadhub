import { useState } from "react";
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalIcon,
  Clock, Video, Phone, User, MoreHorizontal, Search,
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths,
  isToday, parseISO,
} from "date-fns";

interface Appointment {
  id: number;
  title: string;
  contact: string;
  time: string;
  duration: string;
  type: "video" | "phone" | "in-person";
  date: string;
  color: string;
}

const SAMPLE_APPOINTMENTS: Appointment[] = [
  { id: 1, title: "Discovery Call", contact: "Sarah Chen", time: "10:00 AM", duration: "30 min", type: "video", date: format(new Date(), "yyyy-MM-dd"), color: "bg-blue-500" },
  { id: 2, title: "Product Demo", contact: "Marcus Rivera", time: "2:00 PM", duration: "45 min", type: "video", date: format(new Date(), "yyyy-MM-dd"), color: "bg-purple-500" },
  { id: 3, title: "Follow-up Call", contact: "Priya Patel", time: "11:30 AM", duration: "15 min", type: "phone", date: format(addMonths(new Date(), 0).setDate(new Date().getDate() + 2) as unknown as Date, "yyyy-MM-dd"), color: "bg-green-500" },
  { id: 4, title: "Contract Review", contact: "James O'Brien", time: "3:30 PM", duration: "60 min", type: "in-person", date: format(addMonths(new Date(), 0).setDate(new Date().getDate() + 4) as unknown as Date, "yyyy-MM-dd"), color: "bg-orange-500" },
  { id: 5, title: "Onboarding Session", contact: "Yuki Tanaka", time: "9:00 AM", duration: "90 min", type: "video", date: format(addMonths(new Date(), 0).setDate(new Date().getDate() + 7) as unknown as Date, "yyyy-MM-dd"), color: "bg-pink-500" },
];

const TYPE_ICON = {
  video: Video,
  phone: Phone,
  "in-person": User,
};

export default function CalendarPage() {
  const [current, setCurrent] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [view, setView] = useState<"month" | "week">("month");
  const [showNew, setShowNew] = useState(false);

  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  function getAppts(date: Date) {
    return SAMPLE_APPOINTMENTS.filter((a) => {
      try { return isSameDay(parseISO(a.date), date); } catch { return false; }
    });
  }

  const selectedAppts = getAppts(selectedDay);

  const upcoming = SAMPLE_APPOINTMENTS
    .filter((a) => { try { return parseISO(a.date) >= new Date(); } catch { return false; } })
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Calendars</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Schedule and manage appointments</p>
          </div>
          <div className="flex gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden bg-white">
              {["month","week"].map((v) => (
                <button key={v} onClick={() => setView(v as "month" | "week")} className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${view === v ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>
                  {v}
                </button>
              ))}
            </div>
            <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
              <Plus className="w-4 h-4" /> New Appointment
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_280px] gap-5">
          {/* ── Calendar ── */}
          <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
            {/* Month nav */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <button onClick={() => setCurrent(subMonths(current, 1))} className="p-1.5 rounded hover:bg-muted transition-colors"><ChevronLeft className="w-4 h-4" /></button>
              <h2 className="text-sm font-semibold text-foreground">{format(current, "MMMM yyyy")}</h2>
              <button onClick={() => setCurrent(addMonths(current, 1))} className="p-1.5 rounded hover:bg-muted transition-colors"><ChevronRight className="w-4 h-4" /></button>
            </div>

            {/* Day labels */}
            <div className="grid grid-cols-7 border-b border-border">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7">
              {days.map((day, i) => {
                const appts = getAppts(day);
                const inMonth = isSameMonth(day, current);
                const sel = isSameDay(day, selectedDay);
                const tod = isToday(day);
                return (
                  <div
                    key={i}
                    onClick={() => setSelectedDay(day)}
                    className={`min-h-[88px] p-1.5 border-b border-r border-border cursor-pointer transition-colors ${
                      sel ? "bg-primary/5" : inMonth ? "bg-white hover:bg-muted/30" : "bg-muted/20"
                    }`}
                  >
                    <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-1 ${
                      tod ? "bg-primary text-white" : sel ? "bg-primary/15 text-primary" : inMonth ? "text-foreground" : "text-muted-foreground/50"
                    }`}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-0.5">
                      {appts.slice(0, 2).map((a) => (
                        <div key={a.id} className={`text-[10px] font-medium text-white px-1 py-0.5 rounded truncate ${a.color}`}>
                          {a.time} {a.title}
                        </div>
                      ))}
                      {appts.length > 2 && (
                        <div className="text-[10px] text-muted-foreground pl-1">+{appts.length - 2} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Right panel ── */}
          <div className="space-y-4">
            {/* Today's appointments */}
            <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">
                  {isSameDay(selectedDay, new Date()) ? "Today" : format(selectedDay, "MMM d")}
                  <span className="ml-2 text-xs text-muted-foreground font-normal">{selectedAppts.length} event{selectedAppts.length !== 1 ? "s" : ""}</span>
                </h3>
              </div>
              {selectedAppts.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <CalIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No events</p>
                  <button onClick={() => setShowNew(true)} className="text-xs text-primary hover:underline mt-1">Schedule one</button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {selectedAppts.map((a) => {
                    const Icon = TYPE_ICON[a.type];
                    return (
                      <div key={a.id} className="px-4 py-3 flex gap-3 hover:bg-muted/30 transition-colors cursor-pointer">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${a.color} bg-opacity-15`}>
                          <Icon className={`w-4 h-4 text-white`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-foreground">{a.title}</div>
                          <div className="text-[11px] text-muted-foreground">{a.contact}</div>
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                            <Clock className="w-3 h-3" />{a.time} · {a.duration}
                          </div>
                        </div>
                        <button className="p-1 rounded hover:bg-muted text-muted-foreground self-start"><MoreHorizontal className="w-3.5 h-3.5" /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Upcoming */}
            <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Upcoming</h3>
              </div>
              <div className="divide-y divide-border">
                {upcoming.map((a) => {
                  const Icon = TYPE_ICON[a.type];
                  let dateLabel = "";
                  try { dateLabel = format(parseISO(a.date), "MMM d"); } catch {}
                  return (
                    <div key={a.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors cursor-pointer">
                      <div className={`w-1.5 h-8 rounded-full ${a.color} flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-foreground">{a.title}</div>
                        <div className="text-[11px] text-muted-foreground">{a.contact} · {dateLabel} {a.time}</div>
                      </div>
                      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── New appointment modal ── */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-border">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-foreground">New Appointment</h3>
              <button onClick={() => setShowNew(false)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Title</label>
                <input className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 bg-background" placeholder="Discovery Call" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Date</label>
                  <input type="date" className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 bg-background" defaultValue={format(new Date(), "yyyy-MM-dd")} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1.5">Time</label>
                  <input type="time" className="w-full px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 bg-background" defaultValue="10:00" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Contact</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 bg-background" placeholder="Search contacts..." />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1.5">Type</label>
                <div className="flex gap-2">
                  {(["video","phone","in-person"] as const).map((t) => {
                    const Icon = TYPE_ICON[t];
                    return (
                      <button key={t} className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary capitalize transition-colors">
                        <Icon className="w-3.5 h-3.5" /> {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2 justify-end">
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg">Cancel</button>
              <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">Create Appointment</button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
