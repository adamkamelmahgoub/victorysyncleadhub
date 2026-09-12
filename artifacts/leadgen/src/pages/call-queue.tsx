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
const inputStyle =
  "rounded border border-border bg-background px-3 py-2 text-sm";
function CallCard({ lead }: { lead: Lead }) {
  const cache = useQueryClient();
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
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
        description: saved.disposition === 'not_interested' && saved.revisit_at
          ? `Attempt limit reached. Revisit on ${new Date(saved.revisit_at).toLocaleDateString()}.`
          : 'Disposition and next action saved.',
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
    <article className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link
            href={`/leads/${lead.id}`}
            className="font-semibold hover:underline"
          >
            {lead.first_name} {lead.last_name}
          </Link>
          <p className="text-sm text-muted-foreground">
            {lead.company || "No company"} · {lead.attempt_count} attempts
          </p>
        </div>
        <div className="text-right">
          <a className="font-semibold text-primary" href={`tel:${lead.phone}`}>
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
          Due {new Date(lead.queue_due_at ?? lead.next_action_at).toLocaleString()}
        </p>
      )}
      {lead.email_context && <details className="rounded border border-border p-3 text-sm"><summary className="cursor-pointer font-medium">Email to reference on this call</summary><p className="mt-2 whitespace-pre-wrap">{lead.email_context}</p></details>}
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 min-w-48 text-xs">
          Optional notes
          <input
            aria-label="Call notes"
            className={`${inputStyle} mt-1 w-full`}
            value={notes}
            maxLength={10000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="text-xs">
          Next action ({Intl.DateTimeFormat().resolvedOptions().timeZone})
          <input
            aria-label="Next action"
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
      <div className="flex flex-wrap gap-2">
        {DISPOSITIONS.map((d) => (
          <button
            key={d}
            disabled={log.isPending}
            onClick={() => record(d)}
            className={`rounded border px-3 py-2 text-sm disabled:opacity-50 ${d === "dnc" ? "border-red-300 text-red-700" : "border-border hover:bg-muted"}`}
          >
            {d.replaceAll("_", " ")}
          </button>
        ))}
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
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Discovery fields
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
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
          <label className="text-xs">
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
          <label className="text-xs">
            After-hours coverage
            <input
              className={`${inputStyle} block w-full`}
              value={coverage}
              onChange={(e) => setCoverage(e.target.value)}
            />
          </label>
          <label className="text-xs">
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
  const { data, isLoading, error, refetch } = useQuery<Queue>({
    queryKey: ["call-queue", timezone],
    queryFn: () =>
      apiFetch(
        `/outreach/queue${timezone ? `?timezone=${encodeURIComponent(timezone)}` : ""}`,
      ),
    refetchInterval: 30000,
  });
  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Call queue</h1>
          <p className="text-sm text-muted-foreground">
            Due callbacks and retries first, then fresh leads. Local calling
            hours: 7 AM–6 PM.
          </p>
        </div>
        <div className="flex gap-2">
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
          <button className={inputStyle} onClick={() => refetch()}>
            Refresh
          </button>
        </div>
      </div>
      {isLoading && <p role="status">Loading call queue…</p>}
      {error && (
        <p role="alert" className="text-red-600">
          {error.message}
        </p>
      )}
      {!!data?.needsTimezone && (
        <aside className="rounded border border-amber-300 bg-amber-50 p-4">
          <button
            onClick={() => setReview(!review)}
            className="text-sm font-medium"
          >
            {data.needsTimezone} leads need a timezone ·{" "}
            {review ? "Hide" : "Review"}
          </button>
          {review && <TimezoneReview />}
        </aside>
      )}
      {data && (
        <>
          {(["due", "fresh"] as const).map((section) => (
            <section key={section} className="space-y-3">
              <h2 className="text-lg font-semibold">
                {section === "due" ? "Due callbacks & retries" : "Fresh leads"}{" "}
                <span className="text-muted-foreground">
                  ({data[section].length}
                  {data[section].length === 100 ? "+" : ""})
                </span>
              </h2>
              {data[section].length ? (
                data[section].map((l) => <CallCard key={l.id} lead={l} />)
              ) : (
                <p className="rounded border border-dashed p-6 text-sm text-muted-foreground">
                  No eligible leads in this section during local calling hours.
                </p>
              )}
            </section>
          ))}
          <p className="text-xs text-muted-foreground">
            Updated {new Date(data.asOf).toLocaleTimeString()}. Up to 100 leads
            per section; more appear as calls are resolved.
          </p>
        </>
      )}
    </main>
  );
}
