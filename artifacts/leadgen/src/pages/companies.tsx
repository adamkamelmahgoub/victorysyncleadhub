import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Plus, Search, Phone, MapPin, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CrmHeader, CrmError, CompanyLink } from "@/components/company-crm";
import {
  COMPANY_STAGES,
  companiesKey,
  displayDate,
  label,
  stageColors,
  useCompanies,
  type Company,
} from "@/lib/company-crm";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function Companies() {
  const query = useCompanies();
  const [search, setSearch] = useState("");
  const [verification, setVerification] = useState(false);
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { role } = useAuth();
  const create = useMutation({
    mutationFn: (data: Record<string, unknown>): Promise<Company> =>
      apiFetch("/api/companies", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (company) => {
      void qc.invalidateQueries({ queryKey: companiesKey });
      navigate(`/companies/${company.id}`);
    },
  });
  const rows = useMemo(
    () =>
      (query.data ?? []).filter(
        (company) =>
          (!verification || company.needs_verification) &&
          [
            company.name,
            company.contact_name,
            company.city,
            company.state,
            company.industry,
            company.phone,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [query.data, search, verification],
  );
  return (
    <div className="space-y-5">
      <CrmHeader
        title="Every company. One next step."
        description="From the first conversation to a three-day trial and a lasting client relationship."
        action={
          role !== "viewer" && (
            <Button
              onClick={() => {
                create.reset();
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add company
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-white p-4">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search companies"
            placeholder="Search company, owner, city, industry…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={verification}
            onChange={(e) => setVerification(e.target.checked)}
          />
          Needs verification
        </label>
        {!query.isPending && !query.isError && (
          <span className="text-sm text-muted-foreground sm:ml-auto">
            {rows.length} of {query.data?.length} companies
          </span>
        )}
      </div>
      {query.isPending ? (
        <p role="status">Loading companies…</p>
      ) : query.error ? (
        <CrmError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          {!rows.length && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              {search || verification
                ? "No companies match these filters."
                : "Add your first prospect company to start the pipeline."}
            </p>
          )}
          <div
            className="flex gap-3 overflow-x-auto pb-5"
            aria-label="Company pipeline grouped by stage"
            tabIndex={0}
          >
            {COMPANY_STAGES.map((stage) => {
              const companies = rows.filter(
                (company) => company.stage === stage,
              );
              return (
                <section
                  key={stage}
                  className="w-64 shrink-0 rounded-xl border bg-slate-100/70"
                  aria-label={label(stage)}
                >
                  <div
                    className="flex items-center justify-between rounded-t-xl border-t-[3px] p-4"
                    style={{ borderTopColor: stageColors[stage] }}
                  >
                    <h2 className="text-sm font-semibold">{label(stage)}</h2>
                    <span className="rounded bg-white px-2 py-0.5 text-xs">
                      {companies.length}
                    </span>
                  </div>
                  <div className="space-y-3 px-3 pb-3">
                    {companies.map((company) => (
                      <article
                        key={company.id}
                        className="rounded-lg border bg-white p-4 shadow-sm"
                      >
                        <CompanyLink id={company.id}>
                          {company.name}
                        </CompanyLink>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {company.industry || "Industry not recorded"}
                        </p>
                        {company.contact_name && (
                          <p className="mt-3 text-sm">{company.contact_name}</p>
                        )}
                        {company.phone && (
                          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {company.phone}
                          </p>
                        )}
                        {(company.city || company.state) && (
                          <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {[company.city, company.state]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        )}
                        {company.trial_start_date && (
                          <p className="mt-3 border-t pt-3 text-xs leading-5">
                            <strong>
                              {label(company.trial_type ?? "trial")} trial
                            </strong>
                            <br />
                            {displayDate(company.trial_start_date)} –{" "}
                            {displayDate(company.trial_end_date)}
                          </p>
                        )}
                        {company.needs_verification && (
                          <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-800">
                            <ShieldQuestion className="h-3.5 w-3.5" />
                            Needs verification
                          </p>
                        )}
                      </article>
                    ))}
                    {!companies.length && (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        No companies
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a prospect company</DialogTitle>
            <DialogDescription>
              Start with a name. Add trial dates and activity on the company
              page.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              create.mutate(Object.fromEntries(form.entries()));
            }}
          >
            {[
              { name: "name", label: "Company name", required: true },
              { name: "contact_name", label: "Owner / GM" },
              { name: "phone", label: "Phone" },
              {
                name: "industry",
                label: "Industry",
                placeholder: "HVAC, Roofing, Plumbing…",
              },
            ].map((field) => (
              <label key={field.name} className="block text-sm font-medium">
                {field.label}
                <Input
                  className="mt-1"
                  name={field.name}
                  required={field.required}
                  maxLength={500}
                  placeholder={field.placeholder}
                />
              </label>
            ))}
            {create.error && (
              <p role="alert" className="text-sm text-red-700">
                {create.error.message}
              </p>
            )}
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create company"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
