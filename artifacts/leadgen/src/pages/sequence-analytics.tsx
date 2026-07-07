import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Mail, Eye, MessageSquare, Users, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { asArray } from "@/lib/data-shape";

interface Sequence { id: number; name: string; status: string; totalEnrolled: number; totalSent: number; totalOpened: number; totalReplied: number; }

function pct(a: number, b: number) { if (!b) return 0; return Math.round((a / b) * 100); }

function FunnelStep({ label, value, total, iconColor, barColor, icon: Icon }: { label: string; value: number; total: number; iconColor: string; barColor: string; icon: React.ElementType }) {
  const p = pct(value, total);
  return (
    <div className="flex items-center gap-3">
      <div className={`p-1.5 rounded-lg ${iconColor}`}><Icon className="w-3.5 h-3.5" /></div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{value.toLocaleString()} ({p}%)</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(p, 0)}%`, backgroundColor: barColor }} />
        </div>
      </div>
    </div>
  );
}

function SequenceCard({ seq }: { seq: Sequence }) {
  const [expanded, setExpanded] = useState(false);
  const openRate = pct(seq.totalOpened, seq.totalSent);
  const replyRate = pct(seq.totalReplied, seq.totalSent);

  return (
    <div className="bg-card border rounded-xl overflow-hidden">
      <div className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => setExpanded(e => !e)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">{seq.name}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${seq.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{seq.status}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{seq.totalEnrolled.toLocaleString()} enrolled</div>
        </div>
        <div className="flex items-center gap-6 shrink-0">
          <div className="text-center"><div className="text-lg font-bold">{seq.totalSent.toLocaleString()}</div><div className="text-xs text-muted-foreground">Sent</div></div>
          <div className="text-center"><div className={`text-lg font-bold ${openRate >= 40 ? "text-green-600" : openRate >= 20 ? "text-amber-600" : "text-red-500"}`}>{openRate}%</div><div className="text-xs text-muted-foreground">Open Rate</div></div>
          <div className="text-center"><div className="text-lg font-bold text-primary">{replyRate}%</div><div className="text-xs text-muted-foreground">Reply Rate</div></div>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t pt-4 space-y-3">
          <FunnelStep label="Enrolled" value={seq.totalEnrolled} total={seq.totalEnrolled} iconColor="bg-gray-100 text-gray-600" barColor="#6b7280" icon={Users} />
          <FunnelStep label="Sent" value={seq.totalSent} total={seq.totalEnrolled} iconColor="bg-blue-100 text-blue-600" barColor="#3b82f6" icon={Mail} />
          <FunnelStep label="Opened" value={seq.totalOpened} total={seq.totalSent} iconColor="bg-purple-100 text-purple-600" barColor="#8b5cf6" icon={Eye} />
          <FunnelStep label="Replied" value={seq.totalReplied} total={seq.totalSent} iconColor="bg-green-100 text-green-600" barColor="#10b981" icon={MessageSquare} />
          <div className="mt-4 grid grid-cols-3 gap-3 pt-3 border-t">
            {[{ label: "Delivery Rate", value: `${pct(seq.totalSent, seq.totalEnrolled)}%` }, { label: "Open Rate", value: `${openRate}%` }, { label: "Reply Rate", value: `${replyRate}%` }].map(m => (
              <div key={m.label} className="text-center bg-muted/30 rounded-lg p-3">
                <div className="font-bold text-lg">{m.value}</div>
                <div className="text-xs text-muted-foreground">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SequenceAnalytics() {
  const { data: sequencesResponse = [] } = useQuery<Sequence[]>({ queryKey: ["sequences-analytics"], queryFn: () => apiFetch("/sequences") });
  const [sortBy, setSortBy] = useState("openRate");
  const sequences = asArray<Sequence>(sequencesResponse);

  const totalEnrolled = sequences.reduce((s, q) => s + q.totalEnrolled, 0);
  const totalSent = sequences.reduce((s, q) => s + q.totalSent, 0);
  const totalOpened = sequences.reduce((s, q) => s + q.totalOpened, 0);
  const totalReplied = sequences.reduce((s, q) => s + q.totalReplied, 0);

  const sorted = [...sequences].sort((a, b) => {
    if (sortBy === "openRate") return pct(b.totalOpened, b.totalSent) - pct(a.totalOpened, a.totalSent);
    if (sortBy === "replyRate") return pct(b.totalReplied, b.totalSent) - pct(a.totalReplied, a.totalSent);
    return b.totalEnrolled - a.totalEnrolled;
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Sequence Analytics</h1><p className="text-muted-foreground text-sm">Performance breakdown for all email sequences</p></div>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="openRate">By Open Rate</SelectItem>
            <SelectItem value="replyRate">By Reply Rate</SelectItem>
            <SelectItem value="enrolled">By Enrolled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Enrolled", value: totalEnrolled.toLocaleString(), icon: Users, iconColor: "text-blue-600 bg-blue-100" },
          { label: "Emails Sent", value: totalSent.toLocaleString(), icon: Mail, iconColor: "text-purple-600 bg-purple-100" },
          { label: "Avg Open Rate", value: `${pct(totalOpened, totalSent)}%`, icon: Eye, iconColor: "text-amber-600 bg-amber-100" },
          { label: "Avg Reply Rate", value: `${pct(totalReplied, totalSent)}%`, icon: MessageSquare, iconColor: "text-green-600 bg-green-100" },
        ].map(s => (
          <div key={s.label} className="bg-card border rounded-xl p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${s.iconColor}`}><s.icon className="w-4 h-4" /></div>
            <div><div className="text-xl font-bold">{s.value}</div><div className="text-xs text-muted-foreground">{s.label}</div></div>
          </div>
        ))}
      </div>
      {sequences.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><Mail className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>No sequences yet — create one in the Sequences section to see analytics here.</p></div>
      ) : (
        <div className="space-y-3">{sorted.map(seq => <SequenceCard key={seq.id} seq={seq} />)}</div>
      )}
    </div>
  );
}
