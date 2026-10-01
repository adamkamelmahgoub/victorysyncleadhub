import {
  PageHeader,
  PageEmpty,
  workspaceInput,
} from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Phone, RefreshCw, Search, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  DISPOSITIONS,
  TIMEZONES,
  terminal,
  type Disposition,
} from "../../../../lib/outreach";

type Lead = {
  id: string | number;
  first_name: string;
  last_name: string;
  company: string | null;
  phone: string;
  timezone: string;
  attempt_count: number;
  next_action_at: string;
  queue_due_at?: string;
  email_context?: string | null;
  avg_job_value: string | null;
  missed_calls_per_week: number | null;
  after_hours_coverage: string | null;
  uses_answering_service: boolean | null;
};
type Queue = {
  due: Lead[];
  fresh: Lead[];
  needsTimezone: number;
  asOf: string;
};
const inputStyle = workspaceInput;
function CallCard({ lead }: { lead: Lead }) {
  const cache = useQueryClient();
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [disposition, setDisposition] = useState<Disposition>("no_answer");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [job, setJob] = useState(lead.avg_job_value ?? "");
  const [missed, setMissed] = useState(
    String(lead.missed_calls_per_week ?? ""),
  );
  const [coverage, setCoverage] = useState(lead.after_hours_coverage ?? "");
  const [answering, setAnswering] = useState(
    lead.uses_answering_service === null
      ? ""
      : String(lead.uses_answering_service),
  );
  // Keep the same request ID after a lost response. Changing the payload makes a new action.
  const pending = useRef<{
    signature: string;
    id: string;
    body: {
      disposition: Disposition;
      notes: string;
      nextActionAt: string | null;
    };
  } | null>(null);
  const log = useMutation({
    mutationFn: (body: unknown) =>
      apiFetch(`/leads/${lead.id}/calls`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async (saved) => {
      toast({
        title: "Call logged",
        description:
          saved.disposition === "not_interested" && saved.revisit_at
            ? `Attempt limit reached. Revisit on ${new Date(saved.revisit_at).toLocaleDateString()}.`
            : "Disposition and next action saved.",
      });
      pending.current = null;
      await cache.invalidateQueries();
    },
    onError: (e: Error) => setError(e.message),
  });
  const discovery = useMutation({
    mutationFn: () =>
      apiFetch(`/leads/${lead.id}/outreach`, {
        method: "PATCH",
        body: JSON.stringify({
          avgJobValue: job === "" ? null : Number(job),
          missedCallsPerWeek: missed === "" ? null : Number(missed),
          afterHoursCoverage: coverage || null,
          usesAnsweringService: answering === "" ? null : answering === "true",
        }),
      }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["call-queue"] }),
  });
  function record(disposition: Disposition) {
    setError("");
    if (
      ["callback_scheduled", "meeting_booked"].includes(disposition) &&
      !next
    ) {
      setError("Choose the callback or meeting follow-up time first.");
      return;
    }
    const nextActionAt = terminal(disposition)
      ? null
      : next
        ? new Date(next).toISOString()
        : new Date(Date.now() + 86400000).toISOString();
    if (nextActionAt && Date.parse(nextActionAt) <= Date.now()) {
      setError("Next action must be in the future.");
      return;
    }
    const body = { disposition, notes, nextActionAt };
    const signature = JSON.stringify({ disposition, notes, next });
    // Default next-action timestamps must also survive a network retry.
    if (!pending.current || pending.current.signature !== signature)
      pending.current = { signature, id: crypto.randomUUID(), body };
    log.mutate({ ...pending.current.body, requestId: pending.current.id });
  }
  return (
    <article className="workspace-panel p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link
            href={`/leads/${lead.id}`}
            className="text-xl font-semibold tracking-tight hover:underline"
          >
            {lead.first_name} {lead.last_name}
          </Link>
          <p className="text-sm text-muted-foreground">
            {lead.company || "No company"} · {lead.attempt_count} attempts
          </p>
        </div>
        <div className="text-right">
          <a
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-50 px-3 text-sm font-semibold text-primary"
            href={`tel:${lead.phone}`}
          >
            <Phone className="h-4 w-4" />
            {lead.phone}
          </a>
          <p className="text-xs text-muted-foreground">
            {new Intl.DateTimeFormat("en-US", {
              timeZone: lead.timezone,
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date())}{" "}
            · {lead.timezone}
          </p>
        </div>
      </div>
      {(lead.attempt_count > 0 || lead.email_context) && (
        <p className="text-xs text-muted-foreground">
          Due{" "}
          {new Date(lead.queue_due_at ?? lead.next_action_at).toLocaleString()}
        </p>
      )}
      {lead.email_context && (
        <details className="rounded border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Email to reference on this call
          </summary>
          <p className="mt-2 whitespace-pre-wrap">{lead.email_context}</p>
        </details>
      )}
      <div className="grid gap-4">
        <label className="min-w-0 text-sm font-medium">
          Call notes
          <Textarea
            rows={3}
            placeholder="Capture the conversation and next steps..."
            aria-label="Call notes"
            className={`${inputStyle} mt-1 w-full`}
            value={notes}
            maxLength={10000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="text-sm font-medium">
          {disposition === "meeting_booked" ? "Meeting date and time" : "Next action"} ({Intl.DateTimeFormat().resolvedOptions().timeZone})
          <input
            aria-label={disposition === "meeting_booked" ? "Meeting date and time" : "Next action"}
            type="datetime-local"
            className={`${inputStyle} mt-1 block`}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        Retry defaults to tomorrow. Callbacks and meeting follow-ups require a
        time. Terminal outcomes clear the next action.
      </p>
      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="space-y-2 text-sm font-medium">
          Call outcome
          <select
            aria-label="Call outcome"
            className={inputStyle}
            value={disposition}
            onChange={(e) => setDisposition(e.target.value as Disposition)}
            disabled={log.isPending}
          >
            {DISPOSITIONS.map((d) => (
              <option key={d} value={d}>
                {d === "dnc"
                  ? "Do not call"
                  : d
                      .replaceAll("_", " ")
                      .replace(/^./, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </label>
        <Button disabled={log.isPending} onClick={() => record(disposition)}>
          {log.isPending ? "Saving..." : "Save call outcome"}
        </Button>
        {terminal(disposition) && (
          <p className="text-xs text-amber-800 sm:col-span-2">
            This outcome clears the next action
            {disposition === "dnc"
              ? " and marks this contact as do not call"
              : ""}
            .
          </p>
        )}
      </div>
      {log.isPending && (
        <p role="status" className="text-sm">
          Saving call…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <details className="rounded-xl border border-border p-4">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Discovery fields
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Average job value ($)
            <input
              className={`${inputStyle} block w-full`}
              type="number"
              min="0"
              step="0.01"
              value={job}
              onChange={(e) => setJob(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Missed calls per week
            <input
              className={`${inputStyle} block w-full`}
              type="number"
              min="0"
              step="1"
              value={missed}
              onChange={(e) => setMissed(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            After-hours coverage
            <input
              className={`${inputStyle} block w-full`}
              value={coverage}
              onChange={(e) => setCoverage(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium">
            Uses answering service
            <select
              className={`${inputStyle} block w-full`}
              value={answering}
              onChange={(e) => setAnswering(e.target.value)}
            >
              <option value="">Unknown</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <button
            className={inputStyle}
            disabled={discovery.isPending}
            onClick={() => discovery.mutate()}
          >
            Save discovery
          </button>
          {discovery.isSuccess && (
            <span role="status" className="text-sm">
              Discovery saved
            </span>
          )}
        </div>
      </details>
    </article>
  );
}
function TimezoneReview() {
  const cache = useQueryClient();
  const {
    data = [],
    isLoading,
    error,
  } = useQuery<
    Array<Pick<Lead, "id" | "first_name" | "last_name" | "company" | "phone">>
  >({
    queryKey: ["timezone-review"],
    queryFn: () => apiFetch("/outreach/needs-timezone"),
  });
  const save = useMutation({
    mutationFn: ({ id, timezone }: { id: string | number; timezone: string }) =>
      apiFetch(`/leads/${id}/outreach`, {
        method: "PATCH",
        body: JSON.stringify({ timezone }),
      }),
    onSuccess: () => cache.invalidateQueries(),
  });
  return (
    <div className="mt-3 space-y-2">
      {isLoading && <p>Loading…</p>}
      {error && <p role="alert">{error.message}</p>}
      {data.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-3">
          <Link href={`/leads/${l.id}`} className="text-sm hover:underline">
            {l.first_name} {l.last_name} · {l.company} · {l.phone}
          </Link>
          <select
            aria-label={`Timezone for ${l.first_name} ${l.last_name}`}
            className={inputStyle}
            value=""
            disabled={save.isPending}
            onChange={(e) =>
              save.mutate({ id: l.id, timezone: e.target.value })
            }
          >
            <option value="" disabled>
              Choose timezone
            </option>
            {TIMEZONES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
export default function CallQueue() {
  const [timezone, setTimezone] = useState("");
  const [review, setReview] = useState(false);
  const [section, setSection] = useState<"due" | "fresh">("due");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery<Queue>({
    queryKey: ["call-queue", timezone],
    queryFn: () =>
      apiFetch(
        `/outreach/queue${timezone ? `?timezone=${encodeURIComponent(timezone)}` : ""}`,
      ),
    refetchInterval: 30000,
  });
  const leads = (data?.[section] ?? []).filter((lead) =>
    [lead.first_name, lead.last_name, lead.company, lead.phone]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const selected =
    leads.find((lead) => String(lead.id) === selectedId) ?? leads[0];
  return (
    <div className="page-stack">
      <PageHeader
        title="Call queue"
        description="Work through callbacks and new leads, one conversation at a time."
        actions={
          <Button variant="outline" onClick={() => void refetch()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Due callbacks & retries", data?.due.length],
          ["Fresh leads", data?.fresh.length],
          ["Need timezone", data?.needsTimezone],
        ].map(([title, value]) => (
          <div key={title} className="workspace-panel p-3 sm:p-5">
            <p className="text-xs sm:text-sm text-muted-foreground">{title}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {value ?? "-"}
            </p>
          </div>
        ))}
      </div>
      {!!data?.needsTimezone && (
        <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <button
            aria-expanded={review}
            onClick={() => setReview(!review)}
            className="flex items-center gap-2 text-sm font-medium text-amber-900"
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform ${review ? "rotate-90" : ""}`}
            />
            {data.needsTimezone} leads need a timezone -{" "}
            {review ? "Hide review" : "Review leads"}
          </button>
          {review && <TimezoneReview />}
        </aside>
      )}
      <div className="workspace-panel flex flex-wrap items-center justify-between gap-3 p-3">
        <div
          role="group"
          aria-label="Call queue section"
          className="flex flex-wrap gap-1"
        >
          {(["due", "fresh"] as const).map((value) => (
            <Button
              key={value}
              variant="ghost"
              aria-pressed={section === value}
              className={
                section === value
                  ? "bg-blue-50 text-blue-700"
                  : "text-muted-foreground"
              }
              onClick={() => setSection(value)}
            >
              {value === "due" ? "Callbacks & retries" : "Fresh leads"}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="shrink-0">Timezone</span>
          <select
            aria-label="Filter timezone"
            className={inputStyle}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            <option value="">All timezones</option>
            {TIMEZONES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      {isLoading && (
        <div
          role="status"
          className="workspace-panel p-8 text-sm text-muted-foreground"
        >
          Loading call queue...
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error.message}
        </div>
      )}
      {data && (
        <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
          <section
            aria-label="Queued leads"
            className="workspace-panel overflow-hidden"
          >
            <div className="space-y-3 border-b p-4">
              <div className="flex justify-between text-sm">
                <h2 className="font-semibold">
                  {section === "due" ? "Up next" : "New conversations"}
                </h2>
                <span className="text-muted-foreground">
                  {leads.length} leads{data[section].length === 100 ? "+" : ""}
                </span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  aria-label="Search queued leads"
                  className={inputStyle + " pl-9"}
                  placeholder="Search name, company, phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2 lg:max-h-[640px]">
              {leads.map((lead) => (
                <button
                  key={lead.id}
                  aria-pressed={selected?.id === lead.id}
                  onClick={() => setSelectedId(String(lead.id))}
                  className={`mb-1 flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors ${selected?.id === lead.id ? "bg-blue-50 ring-1 ring-inset ring-blue-100" : "hover:bg-slate-50"}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-white text-xs font-semibold text-primary">
                    {lead.first_name?.[0]}
                    {lead.last_name?.[0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {lead.first_name} {lead.last_name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {lead.company || lead.phone}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {lead.attempt_count} attempts
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </button>
              ))}
              {!leads.length && (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {search
                    ? "No leads match your search."
                    : "No eligible leads in this queue."}
                </p>
              )}
            </div>
          </section>
          <section aria-label="Call workspace" className="min-w-0">
            {[...data.due, ...data.fresh]
              .filter(
                (lead, index, all) =>
                  all.findIndex(
                    (item) => String(item.id) === String(lead.id),
                  ) === index,
              )
              .map((lead) => (
                <div
                  key={lead.id}
                  hidden={String(selected?.id) !== String(lead.id)}
                >
                  <CallCard lead={lead} />
                </div>
              ))}
            {!selected && (
              <PageEmpty
                title={search ? "No matching leads" : "Queue complete"}
                description={
                  search
                    ? "Try a different name, company, or phone number."
                    : "Switch queues or check back during local calling hours: 7 AM to 6 PM."
                }
              />
            )}
          </section>
        </div>
      )}
      {data && (
        <p className="text-xs text-muted-foreground">
          Updated {new Date(data.asOf).toLocaleTimeString()} - Local calling
          hours: 7 AM to 6 PM - Up to 100 leads per queue; more appear as calls
          are resolved.
        </p>
      )}
    </div>
  );
}
