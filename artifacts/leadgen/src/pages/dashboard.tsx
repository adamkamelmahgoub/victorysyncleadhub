import { useGetAnalyticsOverview, useGetAnalyticsByStatus, useGetAnalyticsTimeline, useGetTopLeads, useListCampaigns } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Users, Zap, CheckCircle2, ArrowRight, Target } from "lucide-react";
import { Link } from "wouter";
import { format, parseISO } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  new: "hsl(185 100% 50%)",
  contacted: "hsl(280 85% 60%)",
  qualified: "hsl(40 90% 60%)",
  proposal: "hsl(140 70% 50%)",
  converted: "hsl(140 70% 45%)",
  lost: "hsl(350 85% 60%)",
};

function StatCard({ label, value, sub, icon: Icon, loading }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; loading?: boolean;
}) {
  return (
    <Card className="p-5 border border-border bg-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
          {loading ? (
            <Skeleton className="h-8 w-24 mt-1" />
          ) : (
            <p className="text-3xl font-bold text-foreground">{value}</p>
          )}
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data: overview, isLoading: overviewLoading } = useGetAnalyticsOverview();
  const { data: byStatus } = useGetAnalyticsByStatus();
  const { data: timeline } = useGetAnalyticsTimeline();
  const { data: topLeads, isLoading: topLoading } = useGetTopLeads();
  const { data: campaigns } = useListCampaigns();

  const chartData = timeline?.map((t) => ({
    date: format(parseISO(t.date), "MMM d"),
    leads: t.count,
  })) ?? [];

  return (

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Your lead generation overview</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Leads" value={overview?.totalLeads ?? 0} icon={Users} loading={overviewLoading} sub={`${overview?.newLeadsThisMonth ?? 0} this month`} />
          <StatCard label="Converted" value={overview?.convertedLeads ?? 0} icon={CheckCircle2} loading={overviewLoading} sub={`${overview?.conversionRate ?? 0}% rate`} />
          <StatCard label="Hot Leads" value={overview?.hotLeads ?? 0} icon={Zap} loading={overviewLoading} sub="Score 70+" />
          <StatCard label="Avg Score" value={overview?.averageScore?.toFixed(1) ?? "0"} icon={Target} loading={overviewLoading} sub="Out of 100" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Timeline chart */}
          <Card className="lg:col-span-2 p-5 border border-border bg-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Lead Volume</p>
                <p className="text-xs text-muted-foreground">Last 30 days</p>
              </div>
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(185 100% 50%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(185 100% 50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(215 20% 65%)" }} tickLine={false} axisLine={false} interval={6} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(215 20% 65%)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(224 45% 12%)", border: "1px solid hsl(224 40% 18%)", borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: "hsl(210 40% 98%)" }}
                    itemStyle={{ color: "hsl(185 100% 50%)" }}
                  />
                  <Area type="monotone" dataKey="leads" stroke="hsl(185 100% 50%)" strokeWidth={2} fill="url(#leadGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Status breakdown */}
          <Card className="p-5 border border-border bg-card">
            <p className="text-sm font-semibold text-foreground mb-4">By Status</p>
            {byStatus && byStatus.length > 0 ? (
              <div className="space-y-3">
                {byStatus.map((s) => {
                  const total = byStatus.reduce((acc, x) => acc + x.count, 0);
                  const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
                  return (
                    <div key={s.status}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground capitalize">{s.status}</span>
                        <span className="text-foreground font-medium">{s.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: STATUS_COLORS[s.status] ?? "hsl(185 100% 50%)" }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-xs">No data yet</div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top leads */}
          <Card className="p-5 border border-border bg-card">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-foreground">Top Leads</p>
              <Link href="/leads">
                <span className="text-xs text-primary flex items-center gap-1 cursor-pointer hover:underline">View all <ArrowRight className="w-3 h-3" /></span>
              </Link>
            </div>
            {topLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {(topLeads ?? []).slice(0, 6).map((lead) => (
                  <Link key={lead.id} href={`/leads/${lead.id}`}>
                    <div className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/40 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {lead.firstName[0]}{lead.lastName[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{lead.firstName} {lead.lastName}</p>
                          <p className="text-xs text-muted-foreground truncate">{lead.company ?? lead.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="text-sm font-bold text-primary">{lead.score}</span>
                        <Badge variant="outline" className="text-xs capitalize" style={{ borderColor: STATUS_COLORS[lead.status] + "60", color: STATUS_COLORS[lead.status] }}>
                          {lead.status}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Active campaigns */}
          <Card className="p-5 border border-border bg-card">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-foreground">Active Campaigns</p>
              <Link href="/campaigns">
                <span className="text-xs text-primary flex items-center gap-1 cursor-pointer hover:underline">View all <ArrowRight className="w-3 h-3" /></span>
              </Link>
            </div>
            <div className="space-y-2">
              {(campaigns ?? []).filter((c) => c.status === "active").slice(0, 5).map((c) => {
                const rate = c.leadCount > 0 ? Math.round(((c.convertedCount ?? 0) / c.leadCount) * 100) : 0;
                return (
                  <Link key={c.id} href={`/campaigns/${c.id}`}>
                    <div className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-muted/40 transition-colors cursor-pointer">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.leadCount} leads · {c.sourceType ?? "—"}</p>
                      </div>
                      <div className="flex-shrink-0 ml-4 text-right">
                        <p className="text-sm font-bold text-primary">{rate}%</p>
                        <p className="text-xs text-muted-foreground">conv.</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
              {!campaigns?.length && (
                <div className="text-center py-8 text-muted-foreground text-xs">No campaigns yet</div>
              )}
            </div>
          </Card>
        </div>
      </div>

  );
}
