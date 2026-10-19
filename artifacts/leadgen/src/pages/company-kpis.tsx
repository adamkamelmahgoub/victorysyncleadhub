import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CrmError } from "@/components/company-crm";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { displayDate, localDate, type CompanyKpis } from "@/lib/company-crm";
import { ReportHeader, ReportMetric } from "@/components/report-layout";

export default function CompanyKpiPage() {
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return localDate(date);
  });
  const [to, setTo] = useState(localDate);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const valid = Boolean(
    from &&
    to &&
    from <= to &&
    Date.parse(to) - Date.parse(from) <= 366 * 86400000,
  );
  const query = useQuery<CompanyKpis>({
    queryKey: ["company-crm", "kpis", from, to, timezone],
    enabled: valid,
    queryFn: () =>
      apiFetch(
        `/api/company-crm/kpis?${new URLSearchParams({ from, to, timezone })}`,
      ),
  });
  const daily = query.data?.daily ?? [];
  const totals = daily.reduce(
    (sum, day) => ({
      dials: sum.dials + day.outbound_dials,
      leads: sum.leads + day.inbound_leads,
      appointments: sum.appointments + day.appointments_booked,
      samples: sum.samples + day.response_samples,
      response:
        sum.response +
        (day.average_response_minutes ?? 0) * day.response_samples,
    }),
    { dials: 0, leads: 0, appointments: 0, samples: 0, response: 0 },
  );
  return (
    <div className="page-stack">
      <ReportHeader title="Daily performance" description="Calls, response speed, appointments, and trials that need attention." />
      <p className="text-sm text-muted-foreground">This report counts logged calls and inbound leads handled, not imported records. <Link href="/analytics" className="text-primary underline">Open CRM Analytics</Link> for contact and company totals.</p>
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm font-medium">
          From
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="text-sm font-medium">
          Through
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1"
          />
        </label>
        <p className="pb-2 text-xs text-muted-foreground">
          Day boundaries: {timezone}. Trial counts reflect current stages.
        </p>
      </div>
      {!valid ? (
        <p role="alert" className="text-sm text-red-700">
          Choose a date range of up to 367 days, with the end on or after the
          start.
        </p>
      ) : query.isPending ? (
        <p role="status">Loading performance…</p>
      ) : query.error ? (
        <CrmError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[
              {
                title: "Outbound dials",
                value: totals.dials,
                detail: "Calls logged in this period",
              },
              {
                title: "Inbound leads handled",
                value: totals.leads,
                detail: "Calls and leads logged in this period",
              },
              {
                title: "Average response",
                value: totals.samples
                  ? `${(totals.response / totals.samples).toFixed(1)} min`
                  : "Not measured",
                detail: `${totals.samples} of ${totals.leads} inbound leads measured`,
              },
              {
                title: "Appointments booked",
                value: totals.appointments,
                detail: "Appointment booked outcomes in this period",
              },
              {
                title: "Trials currently active",
                value: query.data?.trials_active ?? 0,
                detail: "Companies in Trial Active",
              },
              {
                title: "Completed · awaiting close",
                value: query.data?.trials_awaiting_close ?? 0,
                detail: "Companies in Trial Completed",
              },
            ].map((metric) => (
              <ReportMetric key={metric.title} label={metric.title} value={metric.value} detail={metric.detail} />
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="workspace-table w-full min-w-[650px] text-left text-sm">
              <caption className="p-5 text-left font-semibold">
                Daily activity
              </caption>
              <thead className="border-y bg-slate-50 text-xs text-muted-foreground">
                <tr>
                  {[
                    "Day",
                    "Outbound dials",
                    "Inbound leads",
                    "Avg. response",
                    "Appointments",
                  ].map((title) => (
                    <th key={title} className="px-5 py-3 font-medium">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...daily].reverse().map((day) => (
                  <tr key={day.day}>
                    <td className="px-5 py-3">{displayDate(day.day)}</td>
                    <td className="px-5 py-3">{day.outbound_dials}</td>
                    <td className="px-5 py-3">{day.inbound_leads}</td>
                    <td className="px-5 py-3">
                      {day.average_response_minutes === null
                        ? "Not measured"
                        : `${day.average_response_minutes.toFixed(1)} min`}
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({day.response_samples} measured)
                      </span>
                    </td>
                    <td className="px-5 py-3">{day.appointments_booked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Unmeasured response times are excluded from averages; zero-minute
            responses are included.{" "}
            <Link
              href="/trial-queue"
              className="font-medium text-primary underline"
            >
              Open trial queue
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
