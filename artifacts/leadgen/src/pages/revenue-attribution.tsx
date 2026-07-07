import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { DollarSign, TrendingUp, Users, Target, ArrowRight, BarChart3 } from "lucide-react";
import { useState } from "react";
import { asArray } from "@/lib/data-shape";

interface Lead { id: number; firstName: string; lastName: string; source?: string; status: string; score: number; campaignName?: string; createdAt: string; }

const SOURCE_COLORS: Record<string, string> = {
  Email: "#f97316",
  LinkedIn: "#0077b5",
  Referral: "#8b5cf6",
  Webinar: "#10b981",
  Paid_search: "#f59e0b",
  Organic: "#06b6d4",
  Cold_call: "#ef4444",
  Partner: "#84cc16",
  Other: "#6b7280",
};

function AttributionBar({ label, count, total, color, revenue }: { label: string; count: number; total: number; color: string; revenue: number }) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-24 text-sm font-medium truncate" title={label}>{label}</div>
      <div className="flex-1 relative">
        <div className="h-7 bg-muted rounded-lg overflow-hidden">
          <div className="h-full rounded-lg flex items-center px-2 transition-all duration-700" style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: color + "33", borderLeft: `3px solid ${color}` }}>
            <span className="text-xs font-semibold" style={{ color }}>{count}</span>
          </div>
        </div>
      </div>
      <div className="w-16 text-right text-xs text-muted-foreground">{pct}%</div>
      <div className="w-24 text-right text-sm font-semibold">${revenue.toLocaleString()}</div>
    </div>
  );
}

function StageBar({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-sm flex-1">{label}</span>
      <span className="font-semibold">{count}</span>
    </div>
  );
}

export default function RevenueAttribution() {
  const [period, setPeriod] = useState("30");
  const { data: leadsData } = useQuery({ queryKey: ["leads-attribution"], queryFn: () => apiFetch("/leads?limit=500") });

  const leadResponse = leadsData as { leads?: Lead[] } | undefined;
  const leads: Lead[] = asArray<Lead>(leadResponse?.leads);
  const cutoff = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);
  const periodLeads = leads.filter(l => new Date(l.createdAt) > cutoff);

  const bySource: Record<string, { count: number; qualified: number; closed: number }> = {};
  periodLeads.forEach(l => {
    const src = l.source?.replace(/_/g, " ") || "Unknown";
    if (!bySource[src]) bySource[src] = { count: 0, qualified: 0, closed: 0 };
    bySource[src].count++;
    if (l.status === "qualified" || l.status === "proposal" || l.status === "converted") bySource[src].qualified++;
    if (l.status === "converted") bySource[src].closed++;
  });

  const sourceSorted = Object.entries(bySource).sort((a, b) => b[1].count - a[1].count);
  const total = periodLeads.length;

  const byStatus: Record<string, number> = {};
  periodLeads.forEach(l => { byStatus[l.status] = (byStatus[l.status] || 0) + 1; });
  const STATUS_COLORS: Record<string, string> = { new: "#6b7280", contacted: "#3b82f6", qualified: "#8b5cf6", proposal: "#f59e0b", converted: "#10b981", lost: "#ef4444" };

  const avgScore = periodLeads.length ? Math.round(periodLeads.reduce((s, l) => s + l.score, 0) / periodLeads.length) : 0;
  const qualified = periodLeads.filter(l => ["qualified", "proposal", "converted"].includes(l.status)).length;
  const closed = periodLeads.filter(l => l.status === "converted").length;
  const estRevenue = closed * 4800;

  const byCampaign: Record<string, number> = {};
  periodLeads.forEach(l => { const c = l.campaignName || "Direct"; byCampaign[c] = (byCampaign[c] || 0) + 1; });
  const campaignSorted = Object.entries(byCampaign).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Revenue Attribution</h1><p className="text-muted-foreground text-sm">Understand which channels drive your pipeline and closed revenue</p></div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {[["7", "7d"], ["30", "30d"], ["90", "90d"]].map(([v, label]) => (
            <button key={v} onClick={() => setPeriod(v)} className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${period === v ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Leads", value: total.toLocaleString(), sub: `last ${period} days`, icon: Users, color: "text-blue-600 bg-blue-100" },
          { label: "Qualified", value: `${qualified}`, sub: `${total ? Math.round(qualified / total * 100) : 0}% of leads`, icon: Target, color: "text-purple-600 bg-purple-100" },
          { label: "Closed Won", value: `${closed}`, sub: `${total ? Math.round(closed / total * 100) : 0}% close rate`, icon: TrendingUp, color: "text-green-600 bg-green-100" },
          { label: "Est. Revenue", value: `$${estRevenue.toLocaleString()}`, sub: "@ $4,800 avg deal", icon: DollarSign, color: "text-orange-600 bg-orange-100" },
        ].map(s => (
          <div key={s.label} className="bg-card border rounded-xl p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${s.color}`}><s.icon className="w-4 h-4" /></div>
            <div><div className="text-xl font-bold">{s.value}</div><div className="text-xs text-muted-foreground">{s.sub}</div></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-card border rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Leads by Source</h2>
            <div className="text-xs text-muted-foreground flex items-center gap-4">
              <span>Count</span><span className="w-16 text-right">Share</span><span className="w-24 text-right">Est. Revenue</span>
            </div>
          </div>
          {sourceSorted.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No leads in this period</div>
          ) : sourceSorted.map(([src, d]) => (
            <AttributionBar key={src} label={src} count={d.count} total={total} color={SOURCE_COLORS[src.replace(/ /g, "_")] || SOURCE_COLORS[src] || "#6b7280"} revenue={d.closed * 4800} />
          ))}
        </div>

        <div className="space-y-4">
          <div className="bg-card border rounded-xl p-4">
            <h2 className="font-semibold mb-3">Pipeline Stage</h2>
            {Object.entries(byStatus).length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">No data</div>
            ) : Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
              <StageBar key={status} label={status.charAt(0).toUpperCase() + status.slice(1)} count={count} color={STATUS_COLORS[status] || "#6b7280"} />
            ))}
          </div>

          <div className="bg-card border rounded-xl p-4">
            <h2 className="font-semibold mb-3">Top Campaigns</h2>
            {campaignSorted.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">No campaigns</div>
            ) : campaignSorted.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between py-1.5 text-sm">
                <span className="truncate flex-1 text-muted-foreground" title={name}>{name}</span>
                <span className="font-semibold ml-2">{count}</span>
              </div>
            ))}
          </div>

          <div className="bg-card border rounded-xl p-4">
            <h2 className="font-semibold mb-1">Avg Lead Score</h2>
            <div className="text-3xl font-bold text-primary">{avgScore}</div>
            <div className="text-xs text-muted-foreground">across {total} leads</div>
            <div className="h-2 bg-muted rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${avgScore}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
