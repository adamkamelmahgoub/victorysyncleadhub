import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  List,
  Columns3,
  Download,
  SlidersHorizontal,
  ArrowUpDown,
  ExternalLink,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CompanyEditor, crmSelect } from "@/components/company-editor";
import { CompanyTasks, CompanyFiles } from "@/components/company-work";
import { ActivityLog } from "@/pages/company-detail";
import { CrmHeader, CrmError, StageBadge } from "@/components/company-crm";
import {
  COMPANY_STAGES,
  displayDate,
  label,
  stageColors,
  useCompanies,
  type Company,
} from "@/lib/company-crm";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

type SavedView = {
  name: string;
  search: string;
  stage: string;
  scope: string;
  sort: string;
};
const columnOptions = [
  "industry",
  "contact",
  "next_action",
  "trial",
  "value",
] as const;
function csvValue(value: unknown) {
  const text = String(value ?? "");
  return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`;
}
export default function CompanyWorkspace() {
  const query = useCompanies();
  const { role, user } = useAuth();
  const readOnly = role === "viewer";
  const qc = useQueryClient();
  const queryString = useSearch();
  const [search, setSearch] = useState(
    () => new URLSearchParams(queryString).get("q") ?? "",
  );
  const [stage, setStage] = useState("all");
  const [scope, setScope] = useState("all");
  const [sort, setSort] = useState("name");
  const [view, setView] = useState<"table" | "board">("table");
  const [columns, setColumns] = useState<string[]>([...columnOptions]);
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveView, setSaveView] = useState(false);
  const [bulkStage, setBulkStage] = useState("contacted");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const text = new URLSearchParams(queryString).get("q");
    if (text !== null) setSearch(text);
  }, [queryString]);
  const preferenceKey = `victorysync.company-views.${user?.id ?? "anonymous"}`;
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(preferenceKey) ?? "[]");
      setSavedViews(
        Array.isArray(value)
          ? value.filter(
              (item) =>
                item &&
                typeof item.name === "string" &&
                typeof item.search === "string" &&
                typeof item.stage === "string" &&
                typeof item.scope === "string" &&
                typeof item.sort === "string",
            )
          : [],
      );
    } catch {
      setSavedViews([]);
    }
  }, [preferenceKey]);
  const rows = useMemo(() => {
    const text = search.toLowerCase();
    return (query.data ?? [])
      .filter((company) => {
        const haystack = [
          company.name,
          company.industry,
          company.contact_name,
          company.phone,
          company.email,
          company.city,
          company.state,
          ...(company.tags ?? []),
          ...(company.contacts ?? []).map(
            (contact) => `${contact.name} ${contact.email}`,
          ),
          ...Object.values(company.custom_fields ?? {}),
        ]
          .join(" ")
          .toLowerCase();
        return (
          haystack.includes(text) &&
          (stage === "all" || company.stage === stage) &&
          (scope === "all" ||
            (scope === "trials" &&
              ["trial_booked", "trial_active"].includes(company.stage)) ||
            (scope === "close" && company.stage === "trial_completed") ||
            (scope === "verification" && company.needs_verification) ||
            (scope === "due" &&
              !!company.next_follow_up_at &&
              new Date(company.next_follow_up_at) <= new Date()))
        );
      })
      .sort((a, b) =>
        sort === "stage"
          ? COMPANY_STAGES.indexOf(a.stage) - COMPANY_STAGES.indexOf(b.stage) ||
            a.name.localeCompare(b.name)
          : sort === "newest"
            ? b.created_at.localeCompare(a.created_at)
            : sort === "followup"
              ? (a.next_follow_up_at ?? "9999").localeCompare(
                  b.next_follow_up_at ?? "9999",
                )
              : a.name.localeCompare(b.name),
      );
  }, [query.data, search, stage, scope, sort]);
  const company = query.data?.find((row) => row.id === active);
  const updateStage = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) =>
          apiFetch(`/api/companies/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ stage: bulkStage }),
          }),
        ),
      );
      const failed = results.filter(
        (item): item is PromiseRejectedResult => item.status === "rejected",
      );
      return { updated: results.length - failed.length, failed };
    },
    onSuccess: (result) => {
      setNotice(
        `${result.updated} companies updated.${result.failed.length ? ` ${result.failed.length} could not be updated: ${result.failed[0].reason instanceof Error ? result.failed[0].reason.message : "Review trial dates and capacity."}` : ""}`,
      );
      setSelected([]);
      void qc.invalidateQueries({ queryKey: ["company-crm"] });
    },
  });
  const visibleSelected = selected.filter((id) =>
    rows.some((company) => company.id === id),
  );
  function exportCsv() {
    const keys = [
      "name",
      "phone",
      "email",
      "website",
      "contact_name",
      "city",
      "state",
      "industry",
      "source",
      "stage",
      "needs_verification",
      "trial_type",
      "trial_start_date",
      "trial_end_date",
      "next_action",
      "next_follow_up_at",
      "proposed_monthly_price",
      "currency",
    ];
    const csv = [
      keys.join(","),
      ...rows.map((company) =>
        keys.map((key) => csvValue(company[key as keyof Company])).join(","),
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "victorysync-companies.csv";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="space-y-4">
      <CrmHeader
        title="Companies"
        description="Your prospect book, conversations, trials, and next steps."
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={exportCsv}
              disabled={!rows.length}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            {!readOnly && (
              <Button size="sm" onClick={() => setCreate(true)}>
                <Plus className="h-4 w-4" />
                Add company
              </Button>
            )}
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-1">
        {[
          ["all", "All companies"],
          ["due", "Follow-up due"],
          ["trials", "In trial / booked"],
          ["close", "Awaiting close"],
          ["verification", "To verify"],
        ].map(([value, title]) => (
          <button
            key={value}
            onClick={() => setScope(value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${scope === value ? "bg-slate-200/70 text-slate-900" : "text-slate-500 hover:bg-slate-100"}`}
          >
            {title}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">
          {rows.length} {rows.length === 1 ? "company" : "companies"}
        </span>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              aria-label="Search companies"
              placeholder="Search companies, people, tags…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 pl-8 text-xs"
            />
          </div>
          <select
            aria-label="Filter stage"
            className={`${crmSelect} w-auto max-w-44 text-xs`}
            value={stage}
            onChange={(event) => setStage(event.target.value)}
          >
            <option value="all">All stages</option>
            {COMPANY_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {label(stage)}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
            <select
              aria-label="Sort companies"
              className={`${crmSelect} w-auto text-xs`}
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="name">Name</option>
              <option value="stage">Stage</option>
              <option value="followup">Next follow-up</option>
              <option value="newest">Newest first</option>
            </select>
          </div>
          <details className="relative">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border px-2.5 text-xs">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Columns
            </summary>
            <div className="absolute right-0 top-10 z-20 min-w-44 space-y-2 rounded-lg border bg-white p-3 shadow-lg">
              {columnOptions.map((column) => (
                <label key={column} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={columns.includes(column)}
                    onChange={(event) =>
                      setColumns(
                        event.target.checked
                          ? [...columns, column]
                          : columns.filter((item) => item !== column),
                      )
                    }
                  />
                  {label(column)}
                </label>
              ))}
            </div>
          </details>
          <div className="ml-auto flex rounded-md border p-0.5">
            {(
              [
                ["table", List],
                ["board", Columns3],
              ] as const
            ).map(([value, Icon]) => (
              <button
                key={value}
                aria-label={`${label(value)} view`}
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={`rounded px-2.5 py-1.5 ${view === value ? "bg-blue-50 text-primary" : "text-slate-400"}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b bg-slate-50/50 px-3 py-2">
          <select
            aria-label="Saved views"
            value=""
            className="max-w-48 bg-transparent text-xs text-slate-500"
            onChange={(event) => {
              const saved = savedViews[Number(event.target.value)];
              if (saved) {
                setSearch(saved.search);
                setStage(saved.stage);
                setScope(saved.scope);
                setSort(saved.sort);
              }
            }}
          >
            <option value="">Saved views</option>
            {savedViews.map((saved, index) => (
              <option key={index} value={index}>
                {saved.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setSaveView(true)}
            className="text-xs text-primary"
          >
            Save current view
          </button>
          {(search || stage !== "all" || scope !== "all") && (
            <button
              className="text-xs text-slate-500 underline"
              onClick={() => {
                setSearch("");
                setStage("all");
                setScope("all");
              }}
            >
              Clear filters
            </button>
          )}
          {visibleSelected.length > 0 && !readOnly && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs">{visibleSelected.length} selected</span>
              <select
                aria-label="Bulk stage"
                className="max-w-36 rounded border bg-white px-2 py-1 text-xs"
                value={bulkStage}
                onChange={(event) => setBulkStage(event.target.value)}
              >
                {COMPANY_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {label(stage)}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={updateStage.isPending}
                onClick={() => updateStage.mutate(visibleSelected)}
              >
                Update stage
              </Button>
            </div>
          )}
        </div>
        {notice && (
          <p
            role="status"
            className="border-b px-4 py-3 text-xs text-slate-600"
          >
            {notice}
          </p>
        )}
        {query.isPending ? (
          <p role="status" className="p-8 text-sm">
            Loading companies…
          </p>
        ) : query.error ? (
          <div className="p-4">
            <CrmError error={query.error} retry={() => void query.refetch()} />
          </div>
        ) : !rows.length ? (
          <div className="py-20 text-center">
            <p className="text-sm font-medium">
              {query.data?.length
                ? "No companies match this view."
                : "Your company workspace is ready."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {query.data?.length
                ? "Try changing a filter or search."
                : "Add a company to track its people, trials, and follow-ups."}
            </p>
          </div>
        ) : view === "table" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      aria-label="Select all visible companies"
                      type="checkbox"
                      checked={
                        visibleSelected.length === rows.length &&
                        rows.length > 0
                      }
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? rows.map((company) => company.id)
                            : [],
                        )
                      }
                    />
                  </th>
                  <th className="min-w-52 px-3 py-3 font-medium">Company</th>
                  <th className="px-3 py-3 font-medium">Stage</th>
                  {columns.map((column) => (
                    <th key={column} className="px-3 py-3 font-medium">
                      {label(column)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((company) => (
                  <tr key={company.id} className="group hover:bg-blue-50/30">
                    <td className="px-3 py-4">
                      <input
                        type="checkbox"
                        aria-label={`Select ${company.name}`}
                        checked={selected.includes(company.id)}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? [...selected, company.id]
                              : selected.filter((id) => id !== company.id),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-4">
                      <button
                        onClick={() => setActive(company.id)}
                        className="text-left text-[13px] font-semibold text-slate-800 hover:text-primary"
                      >
                        {company.name}
                      </button>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {[company.city, company.state]
                          .filter(Boolean)
                          .join(", ") ||
                          company.website ||
                          "Location not added"}
                      </p>
                      {!!company.tags?.length && (
                        <p className="mt-1 text-[10px] text-blue-600">
                          {company.tags.slice(0, 3).join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-4">
                      <StageBadge stage={company.stage} />
                    </td>
                    {columns.map((column) => (
                      <td
                        key={column}
                        className="max-w-56 px-3 py-4 text-slate-600"
                      >
                        {column === "industry" ? (
                          company.industry || "—"
                        ) : column === "contact" ? (
                          <>
                            <p>
                              {company.contact_name ||
                                company.contacts?.[0]?.name ||
                                "—"}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-400">
                              {company.email || company.phone}
                            </p>
                          </>
                        ) : column === "next_action" ? (
                          <>
                            <p className="line-clamp-2">
                              {company.next_action || "—"}
                            </p>
                            {company.next_follow_up_at && (
                              <p
                                className={`mt-1 text-[11px] ${new Date(company.next_follow_up_at) < new Date() ? "text-amber-700" : "text-slate-400"}`}
                              >
                                {new Date(
                                  company.next_follow_up_at,
                                ).toLocaleString()}
                              </p>
                            )}
                          </>
                        ) : column === "trial" ? (
                          company.trial_start_date ? (
                            <>
                              <p>{label(company.trial_type ?? "trial")}</p>
                              <p className="mt-1 text-[11px] text-slate-400">
                                {displayDate(company.trial_start_date)}
                              </p>
                            </>
                          ) : (
                            "—"
                          )
                        ) : company.proposed_monthly_price != null ? (
                          `${company.currency ?? "USD"} ${Number(company.proposed_monthly_price).toLocaleString()} / mo`
                        ) : (
                          "—"
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            className="flex gap-3 overflow-x-auto p-3"
            aria-label="Company pipeline grouped by stage"
            tabIndex={0}
          >
            {COMPANY_STAGES.map((stage) => (
              <section key={stage} className="w-56 shrink-0">
                <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: stageColors[stage] }}
                  />
                  {label(stage)}
                  <span className="ml-auto text-slate-400">
                    {rows.filter((company) => company.stage === stage).length}
                  </span>
                </h2>
                <div className="min-h-32 space-y-2 rounded-lg bg-slate-50 p-2">
                  {rows
                    .filter((company) => company.stage === stage)
                    .map((company) => (
                      <button
                        key={company.id}
                        onClick={() => setActive(company.id)}
                        className="w-full rounded-md border bg-white p-3 text-left hover:border-blue-300"
                      >
                        <p className="text-xs font-semibold">{company.name}</p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {company.industry}
                        </p>
                        {company.next_action && (
                          <p className="mt-3 line-clamp-2 border-t pt-2 text-[11px] text-slate-500">
                            {company.next_action}
                          </p>
                        )}
                      </button>
                    ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add company</DialogTitle>
            <DialogDescription>
              Capture the company, its people, and your next step in one place.
            </DialogDescription>
          </DialogHeader>
          <CompanyEditor
            onSaved={(company) => {
              setCreate(false);
              setActive(company.id);
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={saveView} onOpenChange={setSaveView}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this view</DialogTitle>
            <DialogDescription>
              Filters and sort order are saved in this browser for your account.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const name = String(
                new FormData(event.currentTarget).get("name") ?? "",
              ).trim();
              if (!name) return;
              const next = [
                ...savedViews.filter((item) => item.name !== name),
                { name, search, stage, scope, sort },
              ].slice(-20);
              try {
                localStorage.setItem(preferenceKey, JSON.stringify(next));
                setSavedViews(next);
                setSaveView(false);
              } catch {
                setNotice(
                  "Browser storage is unavailable; the view could not be saved.",
                );
              }
            }}
          >
            <Input
              name="name"
              aria-label="View name"
              placeholder="e.g. HVAC follow-ups"
              maxLength={60}
              required
            />
            <Button type="submit">Save view</Button>
          </form>
        </DialogContent>
      </Dialog>
      <Sheet
        open={!!active}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto bg-white sm:max-w-[700px]">
          <SheetHeader className="mb-5 pr-5">
            <SheetTitle>{company?.name ?? "Company"}</SheetTitle>
            <SheetDescription>
              {company
                ? [company.industry, company.city, company.state]
                    .filter(Boolean)
                    .join(" · ")
                : "Loading company…"}
            </SheetDescription>
            {company && (
              <Link
                href={`/companies/${company.id}`}
                className="inline-flex items-center gap-1 text-xs text-primary"
              >
                Open full record
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </SheetHeader>
          {company && (
            <Tabs defaultValue="details" key={company.id}>
              <TabsList className="mb-5">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                <TabsTrigger value="files">Files</TabsTrigger>
              </TabsList>
              <TabsContent value="details">
                <CompanyEditor company={company} readOnly={readOnly} />
              </TabsContent>
              <TabsContent value="activity">
                <ActivityLog company={company} readOnly={readOnly} />
              </TabsContent>
              <TabsContent value="tasks">
                <CompanyTasks companyId={company.id} readOnly={readOnly} />
              </TabsContent>
              <TabsContent value="files">
                <CompanyFiles companyId={company.id} readOnly={readOnly} />
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
