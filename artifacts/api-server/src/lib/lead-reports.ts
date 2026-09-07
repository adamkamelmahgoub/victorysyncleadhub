type ReportLead = {
  id: string | number;
  status?: string | null;
  source?: string | null;
  score?: number | null;
  created_at: string;
  campaign_id?: string | number | null;
};
export function leadReports(
  leads: ReportLead[],
  campaigns: { id: string | number; name: string }[] = [],
  now = new Date(),
) {
  const day = now.toISOString().slice(0, 10);
  const week = new Date(`${day}T00:00:00Z`);
  week.setUTCDate(week.getUTCDate() - week.getUTCDay());
  const month = day.slice(0, 7) + "-01";
  const converted = leads.filter((lead) => lead.status === "converted").length;
  const groups = (field: "status" | "source") => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      const key = lead[field]?.trim() || "Unknown";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ [field]: key, count }));
  };
  const timeline = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 29 + index);
    return { date: date.toISOString().slice(0, 10), count: 0 };
  });
  const dates = new Map(timeline.map((row) => [row.date, row]));
  const campaignNames = new Map(
    campaigns.map((row) => [String(row.id), row.name]),
  );
  const byCampaign = new Map<
    string,
    {
      campaignId: string | number | null;
      campaignName: string;
      count: number;
      convertedCount: number;
    }
  >();
  for (const lead of leads) {
    const date = dates.get(lead.created_at?.slice(0, 10));
    if (date) date.count++;
    const id = lead.campaign_id ?? null,
      key = String(id);
    const campaign = byCampaign.get(key) ?? {
      campaignId: id,
      campaignName:
        id === null
          ? "No campaign"
          : (campaignNames.get(key) ?? "Unknown campaign"),
      count: 0,
      convertedCount: 0,
    };
    campaign.count++;
    if (lead.status === "converted") campaign.convertedCount++;
    byCampaign.set(key, campaign);
  }
  return {
    attribution: {
      total: leads.length,
      qualified: leads.filter(lead => ["qualified", "proposal", "converted"].includes(lead.status ?? "")).length,
      closed: converted,
      bySource: groups("source").map(group => ({
        source: group.source,
        count: group.count,
        closed: leads.filter(lead => (lead.source?.trim() || "Unknown") === group.source && lead.status === "converted").length,
      })),
      byStatus: groups("status"),
      byCampaign: [...byCampaign.values()].sort((a, b) => b.count - a.count),
    },
    overview: {
      totalLeads: leads.length,
      convertedLeads: converted,
      conversionRate: leads.length
        ? Math.round((converted / leads.length) * 1000) / 10
        : 0,
      averageScore: leads.length
        ? Math.round(
            (leads.reduce((sum, lead) => sum + (Number(lead.score) || 0), 0) /
              leads.length) *
              10,
          ) / 10
        : 0,
      hotLeads: leads.filter((lead) => (lead.score ?? 0) >= 70).length,
      newLeadsToday: leads.filter(
        (lead) => lead.created_at?.slice(0, 10) === day,
      ).length,
      newLeadsThisWeek: leads.filter(
        (lead) =>
          lead.created_at >= week.toISOString() &&
          lead.created_at <= now.toISOString(),
      ).length,
      newLeadsThisMonth: leads.filter(
        (lead) =>
          lead.created_at?.slice(0, 10) >= month &&
          lead.created_at <= now.toISOString(),
      ).length,
    },
    "by-status": groups("status"),
    "by-source": groups("source"),
    "lead-sources": groups("source"),
    "by-campaign": [...byCampaign.values()].sort((a, b) => b.count - a.count),
    timeline,
  };
}
