import { Link } from "wouter";
import { useCompanies, COMPANY_STAGES } from "@/lib/company-crm";
import { CrmError, StageBadge } from "./company-crm";

export function CompanyReport() {
  const query = useCompanies();
  if (query.isPending) return <p role="status">Loading company report…</p>;
  if (query.error)
    return <CrmError error={query.error} retry={() => void query.refetch()} />;
  const rows = query.data ?? [];
  const clients = rows.filter((row) => row.stage === "client").length;
  const sources = new Map<string, number>();
  for (const row of rows) {
    const source = row.source?.trim() || "Not specified";
    sources.set(source, (sources.get(source) ?? 0) + 1);
  }
  return (
    <section className="space-y-5" aria-label="Company pipeline report">
      <div className="flex flex-wrap gap-x-10 gap-y-4 border-y py-4">
        {[
          ["Total companies", rows.length],
          ["Clients", clients],
          [
            "Client conversion",
            `${rows.length ? ((clients / rows.length) * 100).toFixed(1) : 0}%`,
          ],
          [
            "Needs verification",
            rows.filter((row) => row.needs_verification).length,
          ],
        ].map(([name, value]) => (
          <div key={name}>
            <p className="text-xs text-muted-foreground">{name}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      {!rows.length && (
        <p>
          No companies yet.{" "}
          <Link href="/company-import" className="text-primary underline">
            Import companies
          </Link>{" "}
          to populate this report.
        </p>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h2 className="mb-3 font-semibold">Current pipeline</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2">Stage</th>
                <th className="text-right">Companies</th>
              </tr>
            </thead>
            <tbody>
              {COMPANY_STAGES.map((stage) => (
                <tr key={stage} className="border-t">
                  <td className="py-2">
                    <StageBadge stage={stage} />
                  </td>
                  <td className="text-right">
                    {rows.filter((row) => row.stage === stage).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg border p-4">
          <h2 className="mb-3 font-semibold">Company sources</h2>
          {[...sources]
            .sort((a, b) => b[1] - a[1])
            .map(([source, count]) => (
              <div
                key={source}
                className="flex justify-between border-t py-2 text-sm"
              >
                <span>{source}</span>
                <span>{count}</span>
              </div>
            ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        All-time company records, including imports. Stages reflect the current
        pipeline.{" "}
        <Link href="/company-kpis" className="text-primary underline">
          Daily performance
        </Link>{" "}
        reports logged calls, response times and trial activity.
      </p>
    </section>
  );
}
