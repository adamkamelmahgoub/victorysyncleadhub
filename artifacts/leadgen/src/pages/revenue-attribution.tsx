import { PageTitle, PageDescription } from "@/components/page-layout";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { CrmError } from "@/components/company-crm";

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
    <div className="flex flex-wrap items-center justify-between gap-3 flex-wrap gap-4 min-w-0"><div><PageTitle>Revenue Attribution</PageTitle><PageDescription>Contact sources and conversions from your saved records.</PageDescription></div><select aria-label="Attribution period" value={period} onChange={event => setPeriod(event.target.value)} className="workspace-control rounded-md border bg-white px-3 py-2 text-sm"><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></div>
    <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-600">Actual revenue is not available: contacts do not contain recorded deal or payment amounts. This report shows conversions; it does not estimate dollars. Date filters use contact creation time and current status.</p>
    {query.error ? <CrmError error={query.error} retry={() => void query.refetch()} /> : query.isPending ? <p role="status">Loading attribution report…</p> : data && <>
      <div className="flex flex-wrap gap-x-10 gap-y-4 border-y py-4">{[["Contacts", data.total], ["Qualified or further", data.qualified], ["Converted", data.closed], ["Conversion rate", `${data.total ? (data.closed / data.total * 100).toFixed(1) : 0}%`]].map(([title, value]) => <div key={title}><p className="text-xs text-muted-foreground">{title}</p><p className="text-2xl font-semibold">{value}</p></div>)}</div>
      {!data.total && <p className="text-sm text-muted-foreground">No contacts match this period. Choose All time or import contacts to populate this report.</p>}
      <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-lg border bg-white p-4"><h2 className="mb-3 font-semibold">By source</h2><div className="overflow-x-auto"><table className="workspace-table w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th>Source</th><th className="text-right">Contacts</th><th className="text-right">Converted</th></tr></thead><tbody>{data.bySource.map(row => <tr key={row.source} className="border-t"><td className="py-3">{row.source}</td><td className="text-right">{row.count}</td><td className="text-right">{row.closed}</td></tr>)}</tbody></table></div></section>
      <section className="rounded-lg border bg-white p-4"><h2 className="mb-3 font-semibold">By campaign</h2><div className="overflow-x-auto"><table className="workspace-table w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th>Campaign</th><th className="text-right">Contacts</th><th className="text-right">Converted</th></tr></thead><tbody>{data.byCampaign.map(row => <tr key={row.campaignId ?? "none"} className="border-t"><td className="py-3">{row.campaignName}</td><td className="text-right">{row.count}</td><td className="text-right">{row.convertedCount}</td></tr>)}</tbody></table></div></section></div>
    </>}
  </div>;
}
