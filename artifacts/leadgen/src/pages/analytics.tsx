import { useState } from "react";
import { CompanyReport } from "@/components/company-report";
import { CrmError } from "@/components/company-crm";
import {
  useGetAnalyticsOverview,
  useGetAnalyticsByStatus,
  useGetAnalyticsBySource,
  useGetAnalyticsByCampaign,
  useGetAnalyticsTimeline,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { TrendingUp, Users, CheckCircle2, Zap, Target } from "lucide-react";
import { asArray, type ArrayElement } from "@/lib/data-shape";
import { ReportHeader, ReportMetric, ReportMetrics } from "@/components/report-layout";

const STATUS_COLORS: Record<string, string> = {
  new: "#2563eb",
  contacted: "hsl(280 85% 60%)",
  qualified: "hsl(40 90% 60%)",
  proposal: "hsl(140 70% 50%)",
  converted: "hsl(140 70% 45%)",
  lost: "hsl(350 85% 60%)",
};
const PIE_COLORS = [
  "#2563eb", "hsl(280 85% 60%)", "hsl(40 90% 60%)",
  "hsl(140 70% 50%)", "hsl(350 85% 60%)", "hsl(220 70% 60%)",
];

const tooltipStyle = {
  contentStyle: { background: "#ffffff", border: "1px solid hsl(224 40% 18%)", borderRadius: 6, fontSize: 12 },
  labelStyle: { color: "#0f172a" },
  itemStyle: { color: "#2563eb" },
};

export default function Analytics() {
  const [dataset, setDataset] = useState("contacts");
  return <div className="page-stack"><ReportHeader title="CRM analytics" description="Reports from saved contacts and prospect companies." /><div className="inline-flex w-fit rounded-lg border border-slate-200 bg-white p-1" role="tablist" aria-label="Report data"><button role="tab" aria-selected={dataset === "contacts"} className={"rounded-md px-4 py-2 text-sm font-medium " + (dataset === "contacts" ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:text-slate-900")} onClick={() => setDataset("contacts")}>Contacts</button><button role="tab" aria-selected={dataset === "companies"} className={"rounded-md px-4 py-2 text-sm font-medium " + (dataset === "companies" ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:text-slate-900")} onClick={() => setDataset("companies")}>Companies</button></div>{dataset === "contacts" ? <ContactAnalytics /> : <CompanyReport />}</div>;
}

function ContactAnalytics() {
  const overviewQuery = useGetAnalyticsOverview();
  const { data: overview, isLoading: oLoading } = overviewQuery;
  const byStatusQuery = useGetAnalyticsByStatus();
  const { data: byStatus } = byStatusQuery;
  const bySourceQuery = useGetAnalyticsBySource();
  const { data: bySource } = bySourceQuery;
  const byCampaignQuery = useGetAnalyticsByCampaign();
  const { data: byCampaign } = byCampaignQuery;
  const timelineQuery = useGetAnalyticsTimeline();
  const { data: timeline } = timelineQuery;
  const statusRows = asArray<ArrayElement<NonNullable<typeof byStatus>>>(byStatus);
  const sourceRows = asArray<ArrayElement<NonNullable<typeof bySource>>>(bySource);
  const campaignRows = asArray<ArrayElement<NonNullable<typeof byCampaign>>>(byCampaign);
  const timelineRows = asArray<ArrayElement<NonNullable<typeof timeline>>>(timeline);

  const chartData = timelineRows.map((t) => ({
    date: format(parseISO(t.date), "MMM d"),
    leads: t.count,
  }));

  const statusData = statusRows.map((s) => ({
    name: s.status.charAt(0).toUpperCase() + s.status.slice(1),
    value: s.count,
    color: STATUS_COLORS[s.status] ?? "hsl(215 20% 65%)",
  }));

  const sourceData = sourceRows.map((s) => ({
    name: s.source.replace("_", " "),
    leads: s.count,
  }));

  const campaignData = campaignRows
    .filter((c) => c.count > 0)
    .map((c) => ({
      name: c.campaignName.length > 14 ? c.campaignName.slice(0, 14) + "…" : c.campaignName,
      leads: c.count,
      converted: c.convertedCount,
    }));

  const queries = [overviewQuery, byStatusQuery, bySourceQuery, byCampaignQuery, timelineQuery];
  const failed = queries.find(query => query.error);
  if (failed?.error) return <CrmError error={failed.error} retry={() => { queries.forEach(query => void query.refetch()); }} />;
  if (queries.some(query => query.isPending)) return <p role="status">Loading contact reports?</p>;

  return (

      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Contact reports</h2>
          <p className="text-sm text-muted-foreground mt-1">All saved contacts, including imports. Daily volume uses UTC and the last 30 days. Company records are shown in the Companies report.</p>
        </div>

        {/* KPI row */}
        <ReportMetrics>
          {[
            { label: "Total Leads", value: oLoading ? null : overview?.totalLeads, icon: Users },
            { label: "Converted", value: oLoading ? null : overview?.convertedLeads, icon: CheckCircle2 },
            { label: "Conv. Rate", value: oLoading ? null : `${overview?.conversionRate ?? 0}%`, icon: TrendingUp },
            { label: "Avg Score", value: oLoading ? null : overview?.averageScore?.toFixed(1), icon: Target },
          ].map(({ label, value, icon: Icon }) => (
            <ReportMetric key={label} label={label} value={value === null ? <Skeleton className="h-8 w-20" /> : value} icon={<Icon className="size-4" />} />
          ))}
        </ReportMetrics>

        {/* Timeline */}
        <Card className="p-5 border border-border bg-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Lead Volume</p>
              <p className="text-xs text-muted-foreground">Daily new leads: last 30 days</p>
            </div>
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="timelineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(215 20% 65%)" }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(215 20% 65%)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="leads" stroke="#2563eb" strokeWidth={2} fill="url(#timelineGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {/* Status breakdown */}
          <Card className="p-5 border border-border bg-card">
            <p className="text-sm font-semibold text-foreground mb-4">By Status</p>
            {statusData.length > 0 ? (
              <>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                        {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip {...tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-2">
                  {statusData.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                        <span className="text-muted-foreground capitalize">{s.name}</span>
                      </div>
                      <span className="font-medium text-foreground">{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="text-xs text-muted-foreground text-center py-8">No data yet</p>}
          </Card>

          {/* Source breakdown */}
          <Card className="p-5 border border-border bg-card">
            <p className="text-sm font-semibold text-foreground mb-4">By Source</p>
            {sourceData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(215 20% 65%)" }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(215 20% 65%)" }} tickLine={false} axisLine={false} width={70} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="leads" radius={[0, 4, 4, 0]}>
                      {sourceData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-xs text-muted-foreground text-center py-8">No data yet</p>}
          </Card>

          {/* Campaign performance */}
          <Card className="p-5 border border-border bg-card">
            <p className="text-sm font-semibold text-foreground mb-4">By Campaign</p>
            {campaignData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaignData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(215 20% 65%)" }} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(215 20% 65%)" }} tickLine={false} axisLine={false} width={75} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="leads" fill="#2563eb" radius={[0, 2, 2, 0]} />
                    <Bar dataKey="converted" fill="hsl(140 70% 45%)" radius={[0, 2, 2, 0]} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "hsl(215 20% 65%)" }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-xs text-muted-foreground text-center py-8">No campaign data yet</p>}
          </Card>
        </div>
      </div>

  );
}
