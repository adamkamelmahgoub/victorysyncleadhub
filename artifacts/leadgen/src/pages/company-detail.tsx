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
import { CompanyEditor } from "@/components/company-editor";
import { CompanyTasks, CompanyFiles } from "@/components/company-work";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
export function ActivityLog({
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
      <Tabs
        defaultValue="details"
        key={company.id}
        className="rounded-lg border bg-white p-5"
      >
        <TabsList className="mb-5">
          <TabsTrigger value="details">Company details</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <div className="max-w-3xl">
            <CompanyEditor company={company} readOnly={role === "viewer"} />
          </div>
        </TabsContent>
        <TabsContent value="activity">
          <ActivityLog company={company} readOnly={role === "viewer"} />
        </TabsContent>
        <TabsContent value="tasks">
          <CompanyTasks companyId={company.id} readOnly={role === "viewer"} />
        </TabsContent>
        <TabsContent value="files">
          <CompanyFiles companyId={company.id} readOnly={role === "viewer"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
