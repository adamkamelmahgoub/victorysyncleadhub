import { useState } from "react";
import { Link, useRoute } from "wouter";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeft, Clock3, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CrmHeader, CrmError, StageBadge } from "@/components/company-crm";
import {
  CALL_OUTCOMES,
  COMPANY_STAGES,
  companiesKey,
  displayDate,
  label,
  trialEndDate,
  useCompanies,
  type Company,
  type CompanyActivity,
  type Direction,
} from "@/lib/company-crm";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const selectClass =
  "mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm disabled:opacity-60";
function CompanyForm({
  company,
  readOnly,
}: {
  company: Company;
  readOnly: boolean;
}) {
  const [draft, setDraft] = useState(company);
  const [saved, setSaved] = useState(false);
  const qc = useQueryClient();
  const companies = useCompanies();
  const update = <K extends keyof Company>(key: K, value: Company[K]) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  let endDate: string | null = null;
  let dateError = "";
  if (draft.trial_start_date) {
    try {
      endDate = trialEndDate(draft.trial_start_date);
    } catch (error) {
      dateError = (error as Error).message;
    }
  }
  const conflicts = (companies.data ?? []).filter(
    (other) =>
      other.id !== company.id &&
      other.trial_type === "inbound" &&
      ["trial_booked", "trial_active"].includes(other.stage) &&
      other.trial_start_date &&
      other.trial_end_date &&
      draft.trial_start_date &&
      endDate &&
      other.trial_start_date <= endDate &&
      other.trial_end_date >= draft.trial_start_date,
  );
  const reservesInbound =
    draft.trial_type === "inbound" &&
    ["trial_booked", "trial_active"].includes(draft.stage);
  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...draft,
          trial_end_date: endDate,
          trial_capacity_slot: draft.trial_start_date
            ? draft.trial_type === "inbound"
              ? "solo-inbound"
              : "outbound"
            : null,
        }),
      }),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ["company-crm"] });
    },
  });
  return (
    <form
      className="space-y-6 rounded-xl border bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        save.mutate();
      }}
    >
      <fieldset disabled={readOnly || save.isPending} className="space-y-5">
        <legend className="mb-4 text-lg font-semibold">
          Company & trial details
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              "name",
              "phone",
              "city",
              "state",
              "industry",
              "contact_name",
              "source",
            ] as const
          ).map((field) => (
            <label key={field} className="text-sm font-medium">
              {field === "contact_name" ? "Owner / GM name" : label(field)}
              <Input
                className="mt-1"
                required={field === "name"}
                maxLength={500}
                value={draft[field]}
                onChange={(e) => update(field, e.target.value)}
              />
            </label>
          ))}
          <label className="text-sm font-medium">
            Stage
            <select
              aria-label="Stage"
              className={selectClass}
              value={draft.stage}
              onChange={(e) =>
                update("stage", e.target.value as Company["stage"])
              }
            >
              {COMPANY_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {label(stage)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium">
          Fit notes
          <Textarea
            className="mt-1"
            rows={3}
            maxLength={10000}
            value={draft.fit_notes}
            onChange={(e) => update("fit_notes", e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.needs_verification}
            onChange={(e) => update("needs_verification", e.target.checked)}
          />
          Company needs verification
        </label>
        <div className="border-t pt-5">
          <h3 className="font-semibold">Three-business-day trial</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Monday–Friday, including the start day. Holidays are not excluded.
            Move stages manually as the trial progresses.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Trial type
            <select
              aria-label="Trial type"
              className={selectClass}
              value={draft.trial_type ?? ""}
              required={Boolean(draft.trial_start_date)}
              onChange={(e) =>
                update(
                  "trial_type",
                  (e.target.value || null) as Direction | null,
                )
              }
            >
              <option value="">Not selected</option>
              <option value="inbound">
                Inbound · live call / lead coverage
              </option>
              <option value="outbound">Outbound · cold calling</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Trial start date
            <Input
              className="mt-1"
              type="date"
              value={draft.trial_start_date ?? ""}
              required={[
                "trial_booked",
                "trial_active",
                "trial_completed",
              ].includes(draft.stage)}
              onChange={(e) =>
                update("trial_start_date", e.target.value || null)
              }
            />
          </label>
          <div className="text-sm">
            <p className="font-medium">Trial end date</p>
            <p className="mt-2">{displayDate(endDate)}</p>
          </div>
          <div className="text-sm">
            <p className="font-medium">Capacity slot</p>
            <p className="mt-2">
              {draft.trial_type === "inbound"
                ? "solo-inbound · one live trial at a time"
                : draft.trial_type === "outbound"
                  ? "outbound · separate from inbound capacity"
                  : "Choose a trial type"}
            </p>
          </div>
        </div>
        <Link
          href="/trial-queue"
          className="inline-block text-sm font-semibold text-primary underline"
        >
          Check the trial queue
        </Link>
        {dateError && (
          <p role="alert" className="text-sm text-red-700">
            {dateError}
          </p>
        )}
        {reservesInbound && conflicts.length > 0 && (
          <div
            role="alert"
            className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
          >
            This window overlaps{" "}
            {conflicts.map((other) => other.name).join(", ")}. Choose a
            different start date.
          </div>
        )}
        {save.error && (
          <p role="alert" className="text-sm text-red-700">
            {save.error.message}
          </p>
        )}
        {!readOnly && (
          <Button
            type="submit"
            disabled={
              Boolean(dateError) || (reservesInbound && conflicts.length > 0)
            }
          >
            {save.isPending ? "Saving…" : "Save company"}
          </Button>
        )}
      </fieldset>
      {saved && (
        <p role="status" className="text-sm text-emerald-700">
          Company saved.
        </p>
      )}
    </form>
  );
}

function ActivityLog({
  company,
  readOnly,
}: {
  company: Company;
  readOnly: boolean;
}) {
  const [direction, setDirection] = useState<Direction>("outbound");
  const [success, setSuccess] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = ["company-crm", "activities", company.id];
  const activities = useInfiniteQuery<{
    items: CompanyActivity[];
    nextOffset: number | null;
  }>({
    queryKey: key,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiFetch(`/api/companies/${company.id}/activities?offset=${pageParam}`),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
  });
  const log = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch(`/api/companies/${company.id}/activities`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setSuccess(true);
      setFormKey((value) => value + 1);
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ["company-crm", "kpis"] });
    },
  });
  const items = activities.data?.pages.flatMap((page) => page.items) ?? [];
  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  return (
    <section className="space-y-5 rounded-xl border bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold">Call & lead activity</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          One entry per call or inbound lead. Outcomes do not change the company
          stage.
        </p>
      </div>
      {!readOnly && (
        <form
          key={formKey}
          className="space-y-4 rounded-lg bg-slate-50 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSuccess(false);
            const form = new FormData(e.currentTarget);
            const response = String(form.get("response_time_minutes") ?? "");
            log.mutate({
              direction,
              outcome: form.get("outcome"),
              notes: form.get("notes"),
              occurred_at: new Date(
                String(form.get("occurred_at")),
              ).toISOString(),
              response_time_minutes:
                direction === "inbound" && response !== ""
                  ? Number(response)
                  : null,
            });
          }}
        >
          <fieldset disabled={log.isPending} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Direction
                <select
                  aria-label="Direction"
                  className={selectClass}
                  value={direction}
                  onChange={(e) => {
                    setDirection(e.target.value as Direction);
                    setSuccess(false);
                  }}
                >
                  <option value="outbound">Outbound call</option>
                  <option value="inbound">Inbound call / lead</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Outcome
                <select
                  aria-label="Outcome"
                  className={selectClass}
                  name="outcome"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select outcome
                  </option>
                  {CALL_OUTCOMES.map((outcome) => (
                    <option key={outcome} value={outcome}>
                      {label(outcome)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium">
                Timestamp (local time)
                <Input
                  className="mt-1"
                  name="occurred_at"
                  type="datetime-local"
                  required
                  defaultValue={localNow}
                />
              </label>
              {direction === "inbound" && (
                <label className="text-sm font-medium">
                  Response time (minutes)
                  <Input
                    className="mt-1"
                    name="response_time_minutes"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="e.g. 2.5"
                  />
                  <span className="text-xs font-normal text-muted-foreground">
                    Leave blank if unmeasured; 0 means immediate.
                  </span>
                </label>
              )}
            </div>
            <label className="block text-sm font-medium">
              Notes
              <Textarea
                className="mt-1"
                name="notes"
                maxLength={10000}
                placeholder="What happened? What needs to happen next?"
              />
            </label>
            {log.error && (
              <p role="alert" className="text-sm text-red-700">
                {log.error.message}
              </p>
            )}
            <Button type="submit">
              {log.isPending ? "Logging…" : "Log activity"}
            </Button>
          </fieldset>
        </form>
      )}
      {success && (
        <p role="status" className="text-sm text-emerald-700">
          Activity logged.
        </p>
      )}
      {activities.isPending ? (
        <p role="status">Loading activity…</p>
      ) : activities.error ? (
        <CrmError
          error={activities.error}
          retry={() => void activities.refetch()}
        />
      ) : (
        <>
          {!items.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No calls or leads logged yet.
            </p>
          )}
          <ol className="divide-y">
            {items.map((item) => (
              <li key={item.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {item.direction === "inbound" ? (
                      <PhoneIncoming className="h-4 w-4 text-teal-700" />
                    ) : (
                      <PhoneOutgoing className="h-4 w-4 text-slate-500" />
                    )}
                    {label(item.direction)} · {label(item.outcome)}
                  </div>
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={item.occurred_at}
                  >
                    {new Date(item.occurred_at).toLocaleString()}
                  </time>
                </div>
                {item.direction === "inbound" && (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-900">
                    <Clock3 className="h-4 w-4" />
                    {item.response_time_minutes === null
                      ? "Response time not recorded"
                      : `${item.response_time_minutes} min response`}
                  </p>
                )}
                {item.notes && (
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                    {item.notes}
                  </p>
                )}
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  Logged by{" "}
                  {item.logged_by === user?.id ? "you" : item.logged_by}
                </p>
              </li>
            ))}
          </ol>
          {activities.hasNextPage && (
            <Button
              variant="outline"
              disabled={activities.isFetchingNextPage}
              onClick={() => void activities.fetchNextPage()}
            >
              {activities.isFetchingNextPage
                ? "Loading…"
                : "Load older activity"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

export default function CompanyDetail() {
  const [, params] = useRoute("/companies/:id");
  const [, legacyParams] = useRoute("/leadgen/companies/:id");
  const id = params?.id ?? legacyParams?.id;
  const query = useQuery<Company>({
    queryKey: ["company-crm", "company", id],
    queryFn: () => apiFetch(`/api/companies/${id}`),
    enabled: Boolean(id),
  });
  const { role } = useAuth();
  if (query.isPending) return <p role="status">Loading company…</p>;
  if (query.error)
    return <CrmError error={query.error} retry={() => void query.refetch()} />;
  const company = query.data;
  return (
    <div className="space-y-5">
      <Link
        href="/companies"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Company pipeline
      </Link>
      <CrmHeader
        title={company.name}
        description={
          [
            company.industry,
            [company.city, company.state].filter(Boolean).join(", "),
            company.contact_name,
          ]
            .filter(Boolean)
            .join(" · ") ||
          "Company details, trial delivery, and every conversation."
        }
      />
      <StageBadge stage={company.stage} />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <CompanyForm
          key={company.id}
          company={company}
          readOnly={role === "viewer"}
        />
        <ActivityLog company={company} readOnly={role === "viewer"} />
      </div>
    </div>
  );
}
