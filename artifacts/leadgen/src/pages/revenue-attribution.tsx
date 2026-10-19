import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { CrmError } from "@/components/company-crm";
import { ReportHeader, ReportMetric, ReportMetrics, ReportPanel } from "@/components/report-layout";

type Attribution = {
  total: number; qualified: number; closed: number;
  bySource: { source: string; count: number; closed: number }[];
  byStatus: { status: string; count: number }[];
  byCampaign: { campaignId: string | number | null; campaignName: string; count: number; convertedCount: number }[];
};

export default function RevenueAttribution() {
  const [period, setPeriod] = useState("all");
  const query = useQuery<Attribution>({ queryKey: ["analytics", "attribution", period], queryFn: () => apiFetch(`/api/analytics/attribution?days=${period}`) });
  const data = query.data;
  return <div className="page-stack">
    <ReportHeader title="Revenue attribution" description="See which sources and campaigns bring contacts through to conversion." actions={<label className="flex items-center gap-2 text-xs font-medium text-slate-600">Period<select aria-label="Attribution period" value={period} onChange={event => setPeriod(event.target.value)} className="workspace-control rounded-lg border bg-white px-3 py-2 text-sm"><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>} />
    <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-600">This report shows contact conversions. Deal and payment amounts are not recorded, so revenue totals are unavailable. Periods use contact creation dates and current status.</p>
    {query.error ? <CrmError error={query.error} retry={() => void query.refetch()} /> : query.isPending ? <p role="status" className="text-sm text-slate-500">Loading attribution report…</p> : data && <>
      <ReportMetrics>
        <ReportMetric label="Contacts" value={data.total.toLocaleString()} />
        <ReportMetric label="Qualified or further" value={data.qualified.toLocaleString()} />
        <ReportMetric label="Converted" value={data.closed.toLocaleString()} />
        <ReportMetric label="Conversion rate" value={`${data.total ? (data.closed / data.total * 100).toFixed(1) : 0}%`} />
      </ReportMetrics>
      {!data.total && <p className="text-sm text-muted-foreground">No contacts match this period. Choose All time or import contacts to populate this report.</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        <ReportPanel title="By source" description="Where contacts originated and how many converted.">
          <div className="overflow-x-auto"><table className="workspace-table min-w-[440px] w-full text-sm"><thead><tr><th>Source</th><th className="text-right">Contacts</th><th className="text-right">Converted</th></tr></thead><tbody>{data.bySource.map(row => <tr key={row.source}><td className="font-medium">{row.source}</td><td className="text-right">{row.count.toLocaleString()}</td><td className="text-right">{row.closed.toLocaleString()}</td></tr>)}</tbody></table></div>
          {!data.bySource.length && <p className="py-6 text-center text-sm text-slate-500">No source data for this period.</p>}
        </ReportPanel>
        <ReportPanel title="By campaign" description="Campaign contribution to contact conversions.">
          <div className="overflow-x-auto"><table className="workspace-table min-w-[440px] w-full text-sm"><thead><tr><th>Campaign</th><th className="text-right">Contacts</th><th className="text-right">Converted</th></tr></thead><tbody>{data.byCampaign.map(row => <tr key={row.campaignId ?? "none"}><td className="font-medium">{row.campaignName}</td><td className="text-right">{row.count.toLocaleString()}</td><td className="text-right">{row.convertedCount.toLocaleString()}</td></tr>)}</tbody></table></div>
          {!data.byCampaign.length && <p className="py-6 text-center text-sm text-slate-500">No campaign data for this period.</p>}
        </ReportPanel>
      </div>
    </>}
  </div>;
}
