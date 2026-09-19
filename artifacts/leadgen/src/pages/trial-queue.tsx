import { useState } from "react";
import { CalendarCheck2, Headphones, PhoneOutgoing } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  CrmHeader,
  CrmError,
  CompanyLink,
  StageBadge,
} from "@/components/company-crm";
import {
  displayDate,
  localDate,
  trialEndDate,
  useCompanies,
} from "@/lib/company-crm";

export default function TrialQueue() {
  const query = useCompanies();
  const [candidate, setCandidate] = useState("");
  let end = "";
  let invalid = "";
  if (candidate) {
    try {
      end = trialEndDate(candidate);
    } catch (error) {
      invalid = (error as Error).message;
    }
  }
  const committed = (query.data ?? [])
    .filter((company) =>
      ["trial_booked", "trial_active"].includes(company.stage),
    )
    .sort(
      (a, b) =>
        (a.trial_start_date ?? "9999").localeCompare(
          b.trial_start_date ?? "9999",
        ) || a.name.localeCompare(b.name),
    );
  const conflicts = committed.filter(
    (company) =>
      company.trial_type === "inbound" &&
      company.trial_start_date &&
      company.trial_end_date &&
      end &&
      company.trial_start_date <= end &&
      company.trial_end_date >= candidate,
  );
  const awaiting = (query.data ?? []).filter(
    (company) => company.stage === "trial_completed",
  );
  return (
    <div className="page-stack">
      <CrmHeader
        title="Trial schedule"
        description="Booked and active trials, in start-date order. One live inbound trial at a time."
      />
      <section className="rounded-xl border bg-white p-5">
        <div className="flex items-center gap-2">
          <CalendarCheck2 className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Check an inbound start date</h2>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="text-sm">
            Proposed start
            <Input
              className="mt-1 w-48"
              type="date"
              value={candidate}
              onChange={(e) => setCandidate(e.target.value)}
            />
          </label>
          {candidate && !query.isPending && !query.error && (
            <div aria-live="polite" className="text-sm">
              {invalid ? (
                <p className="text-red-700">{invalid}</p>
              ) : conflicts.length ? (
                <p className="text-amber-800">
                  Already committed to{" "}
                  {conflicts.map((company) => company.name).join(", ")}.
                </p>
              ) : (
                <p className="font-medium text-emerald-700">
                  No inbound booking overlaps {displayDate(candidate)} –{" "}
                  {displayDate(end)}.
                </p>
              )}
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Three business days, including the start day; weekends excluded,
          holidays included. Checking a date does not reserve it. Save a booked
          trial on the company page to reserve capacity.
        </p>
      </section>
      {query.isPending ? (
        <p role="status">Loading trial commitments…</p>
      ) : query.error ? (
        <CrmError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <section className="overflow-hidden rounded-xl border bg-white">
            <div className="border-b p-5">
              <h2 className="font-semibold">
                Scheduled & active trials{" "}
                <span className="ml-2 text-muted-foreground">
                  {committed.length}
                </span>
              </h2>
            </div>
            {!committed.length ? (
              <p className="p-8 text-sm text-muted-foreground">
                No trials committed yet. Set a company to Trial Booked with a
                type and start date to add it here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="workspace-table w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-muted-foreground">
                    <tr>
                      {[
                        "Company",
                        "Coverage",
                        "Trial window",
                        "Capacity slot",
                        "Stage",
                      ].map((title) => (
                        <th key={title} className="px-5 py-3 font-medium">
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {committed.map((company) => (
                      <tr key={company.id}>
                        <td className="px-5 py-5">
                          <CompanyLink id={company.id}>
                            {company.name}
                          </CompanyLink>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {company.contact_name}
                          </p>
                        </td>
                        <td className="px-5 py-5">
                          <span className="inline-flex items-center gap-2">
                            {company.trial_type === "inbound" ? (
                              <>
                                <Headphones className="h-4 w-4 text-teal-700" />
                                Inbound
                              </>
                            ) : (
                              <>
                                <PhoneOutgoing className="h-4 w-4" />
                                Outbound
                              </>
                            )}
                          </span>
                        </td>
                        <td className="px-5 py-5">
                          {displayDate(company.trial_start_date)}
                          <br />
                          <span className="text-xs text-muted-foreground">
                            through {displayDate(company.trial_end_date)}
                          </span>
                          {company.trial_end_date &&
                            company.trial_end_date < localDate() && (
                              <p className="mt-1 text-xs text-amber-800">
                                Window ended · review stage
                              </p>
                            )}
                        </td>
                        <td className="px-5 py-5 text-xs">
                          {company.trial_capacity_slot}
                        </td>
                        <td className="px-5 py-5">
                          <StageBadge stage={company.stage} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
            <h2 className="font-semibold">
              Completed · awaiting a close decision
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {awaiting.length} companies ready for follow-up. Move to Client or
              Disqualified once the decision is made.
            </p>
            <div className="mt-4 flex flex-wrap gap-4">
              {awaiting.map((company) => (
                <CompanyLink key={company.id} id={company.id}>
                  {company.name}
                </CompanyLink>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
