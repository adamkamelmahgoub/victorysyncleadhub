import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiFetch } from "@/lib/api";
import {
  COMPANY_STAGES,
  label,
  trialEndDate,
  displayDate,
  useCompanies,
  validateCompany,
  type Company,
  type CompanyContact,
} from "@/lib/company-crm";

const emptyCompany: Company = {
  id: "",
  name: "",
  phone: "",
  city: "",
  state: "",
  industry: "",
  contact_name: "",
  fit_notes: "",
  source: "",
  stage: "new",
  needs_verification: false,
  trial_type: null,
  trial_start_date: null,
  trial_end_date: null,
  trial_capacity_slot: null,
  created_at: "",
  updated_at: "",
  email: "",
  website: "",
  address: "",
  postal_code: "",
  country: "",
  tags: [],
  contacts: [],
  custom_fields: {},
  next_action: "",
  next_follow_up_at: null,
  coverage_hours: "",
  coverage_timezone: "",
  expected_daily_leads: null,
  trial_success_criteria: "",
  trial_results: "",
  proposed_monthly_price: null,
  currency: "USD",
  close_call_at: null,
  close_notes: "",
};
export const crmSelect =
  "h-9 w-full rounded-md border border-input bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50";
export const toLocalDateTime = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

export function CompanyEditor({
  company,
  readOnly = false,
  onSaved,
  initialTab = "overview",
}: {
  company?: Company;
  readOnly?: boolean;
  onSaved?: (company: Company) => void;
  initialTab?: string;
}) {
  const [draft, setDraft] = useState<Company>(() => ({
    ...emptyCompany,
    ...company,
  }));
  const [tab, setTab] = useState(initialTab);
  const [saved, setSaved] = useState(false);
  const [properties, setProperties] = useState(() =>
    Object.entries(company?.custom_fields ?? {}).map(([name, value]) => ({
      name,
      value,
    })),
  );
  const [tagInput, setTagInput] = useState("");
  const [localError, setLocalError] = useState("");
  const qc = useQueryClient();
  const companies = useCompanies();
  function update<K extends keyof Company>(key: K, value: Company[K]) {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  }
  const save = useMutation({
    mutationFn: async () => {
      const end = draft.trial_start_date
        ? trialEndDate(draft.trial_start_date)
        : null;
      const names = properties.map((field) => field.name.trim());
      if (new Set(names).size !== names.length)
        throw new Error("Custom field names must be unique.");
      const pendingTags = tagInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const payload = validateCompany({
        ...draft,
        tags: [...(draft.tags ?? []), ...pendingTags],
        custom_fields: Object.fromEntries(
          properties.map((field) => [field.name, field.value]),
        ),
        trial_end_date: end,
        trial_capacity_slot: end
          ? draft.trial_type === "inbound"
            ? "solo-inbound"
            : "outbound"
          : null,
      });
      return apiFetch(
        company ? `/api/companies/${company.id}` : "/api/companies",
        { method: company ? "PATCH" : "POST", body: JSON.stringify(payload) },
      ) as Promise<Company>;
    },
    onSuccess: (savedCompany) => {
      setDraft({ ...emptyCompany, ...savedCompany });
      setTagInput("");
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ["company-crm"] });
      onSaved?.(savedCompany);
    },
  });
  function textField(
    field: keyof Company,
    title: string,
    type = "text",
    placeholder?: string,
  ) {
    return (
      <label
        className="block space-y-1.5 text-xs font-medium text-slate-600"
        key={field}
      >
        {title}
        <Input
          aria-label={title}
          type={type}
          value={String(draft[field] ?? "")}
          onChange={(event) => update(field, event.target.value as never)}
          placeholder={placeholder}
          maxLength={500}
          required={field === "name"}
          className="h-9 font-normal text-foreground"
        />
      </label>
    );
  }
  function notesField(field: keyof Company, title: string) {
    return (
      <label className="block space-y-1.5 text-xs font-medium text-slate-600">
        {title}
        <Textarea
          aria-label={title}
          value={String(draft[field] ?? "")}
          maxLength={10000}
          onChange={(event) => update(field, event.target.value as never)}
          rows={3}
          className="font-normal text-foreground"
        />
      </label>
    );
  }
  function dateTimeField(
    field: "next_follow_up_at" | "close_call_at",
    title: string,
  ) {
    return (
      <label className="block space-y-1.5 text-xs font-medium text-slate-600">
        {title}
        <Input
          aria-label={title}
          type="datetime-local"
          value={toLocalDateTime(draft[field])}
          onChange={(event) =>
            update(
              field,
              event.target.value
                ? new Date(event.target.value).toISOString()
                : null,
            )
          }
          className="h-9 font-normal"
        />
      </label>
    );
  }
  let trialEnd = "";
  let dateError = "";
  if (draft.trial_start_date) {
    try {
      trialEnd = trialEndDate(draft.trial_start_date);
    } catch (error) {
      dateError = (error as Error).message;
    }
  }
  const conflicts = (companies.data ?? []).filter(
    (other) =>
      other.id !== company?.id &&
      other.trial_type === "inbound" &&
      ["trial_booked", "trial_active"].includes(other.stage) &&
      other.trial_start_date &&
      other.trial_end_date &&
      draft.trial_start_date &&
      trialEnd &&
      other.trial_start_date <= trialEnd &&
      other.trial_end_date >= draft.trial_start_date,
  );
  const blocked =
    draft.trial_type === "inbound" &&
    ["trial_booked", "trial_active"].includes(draft.stage) &&
    conflicts.length > 0;
  function updateContact(
    index: number,
    field: keyof CompanyContact,
    value: string,
  ) {
    update(
      "contacts",
      (draft.contacts ?? []).map((contact, i) =>
        i === index ? { ...contact, [field]: value } : contact,
      ),
    );
  }
  const changed = () => {
    setSaved(false);
    setLocalError("");
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(false);
        setLocalError("");
        save.mutate();
      }}
      onChange={changed}
      className="flex min-h-0 flex-col"
    >
      <fieldset disabled={readOnly || save.isPending} className="min-w-0">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-5 h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent px-0 pb-2">
            {[
              ["overview", "Overview"],
              ["contacts", "People"],
              ["trial", "Trial & sales"],
              ["followup", "Follow-up"],
              ["properties", "Properties"],
            ].map(([value, title]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="text-xs data-[state=active]:bg-blue-50 data-[state=active]:text-primary data-[state=active]:shadow-none"
              >
                {title}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="overview" className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {textField("name", "Company name")}
              {textField(
                "industry",
                "Industry",
                "text",
                "HVAC, roofing, plumbing…",
              )}
              {textField("phone", "Company phone", "tel")}
              {textField("email", "Company email", "email")}
              {textField("website", "Website", "url", "https://")}
              {textField("contact_name", "Primary owner / GM")}
              <label className="block space-y-1.5 text-xs font-medium text-slate-600">
                Stage
                <select
                  aria-label="Stage"
                  className={crmSelect}
                  value={draft.stage}
                  onChange={(event) =>
                    update("stage", event.target.value as Company["stage"])
                  }
                >
                  {COMPANY_STAGES.map((stage) => (
                    <option key={stage} value={stage}>
                      {label(stage)}
                    </option>
                  ))}
                </select>
              </label>
              {textField(
                "source",
                "Source",
                "text",
                "Referral, website, outbound…",
              )}
            </div>
            <div className="border-t pt-4">
              <h3 className="mb-3 text-sm font-semibold">Business address</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {textField("address", "Street address")}
                {textField("city", "City")}
                {textField("state", "State / region")}
                {textField("postal_code", "Postal code")}
                {textField("country", "Country")}
              </div>
            </div>
            {notesField("fit_notes", "Fit notes")}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.needs_verification}
                onChange={(event) =>
                  update("needs_verification", event.target.checked)
                }
              />
              Needs verification
            </label>
          </TabsContent>
          <TabsContent value="contacts" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Company contacts</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Owners, decision makers, dispatchers, and billing contacts.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={(draft.contacts?.length ?? 0) >= 30}
                onClick={() =>
                  update("contacts", [
                    ...(draft.contacts ?? []),
                    { name: "", role: "", email: "", phone: "" },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add person
              </Button>
            </div>
            {!draft.contacts?.length && (
              <p className="border-y py-8 text-center text-sm text-muted-foreground">
                No additional people yet.
              </p>
            )}
            {(draft.contacts ?? []).map((contact, index) => (
              <div className="space-y-3 border-b pb-4" key={index}>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold">Contact {index + 1}</h4>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove contact ${index + 1}`}
                    onClick={() =>
                      update(
                        "contacts",
                        draft.contacts?.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["name", "role", "email", "phone"] as const).map(
                    (field) => (
                      <label key={field} className="text-xs text-slate-600">
                        {label(field)}
                        <Input
                          aria-label={`Contact ${index + 1} ${field}`}
                          type={field === "email" ? "email" : "text"}
                          value={contact[field]}
                          maxLength={500}
                          required={field === "name"}
                          onChange={(event) =>
                            updateContact(index, field, event.target.value)
                          }
                          className="mt-1 h-9"
                        />
                      </label>
                    ),
                  )}
                </div>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="trial" className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-medium text-slate-600">
                Trial type
                <select
                  aria-label="Trial type"
                  className={crmSelect}
                  value={draft.trial_type ?? ""}
                  onChange={(event) =>
                    update(
                      "trial_type",
                      (event.target.value || null) as Company["trial_type"],
                    )
                  }
                >
                  <option value="">Not selected</option>
                  <option value="inbound">Inbound call / lead coverage</option>
                  <option value="outbound">Outbound cold calling</option>
                </select>
              </label>
              <label className="space-y-1.5 text-xs font-medium text-slate-600">
                Trial start
                <Input
                  type="date"
                  aria-label="Trial start date"
                  className="h-9"
                  value={draft.trial_start_date ?? ""}
                  onChange={(event) =>
                    update("trial_start_date", event.target.value || null)
                  }
                />
              </label>
            </div>
            <p className="border-l-2 border-primary pl-3 text-xs leading-5 text-slate-600">
              Ends {displayDate(trialEnd || null)} · 3 business days
              <br />
              {draft.trial_type === "inbound"
                ? "One inbound trial at a time."
                : "Outbound trials have separate capacity."}{" "}
              Weekends excluded; holidays included.
            </p>
            {dateError && (
              <p role="alert" className="text-sm text-red-700">
                {dateError}
              </p>
            )}
            {blocked && (
              <p role="alert" className="text-sm text-amber-800">
                Overlaps {conflicts.map((item) => item.name).join(", ")}. Choose
                another start date.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {textField(
                "coverage_hours",
                "Coverage hours",
                "text",
                "Mon–Fri, 9am–5pm",
              )}
              {textField(
                "coverage_timezone",
                "Coverage timezone",
                "text",
                "America/New_York",
              )}
              <label className="space-y-1.5 text-xs font-medium text-slate-600">
                Expected leads / day
                <Input
                  aria-label="Expected leads / day"
                  type="number"
                  min={0}
                  step={1}
                  value={draft.expected_daily_leads ?? ""}
                  onChange={(event) =>
                    update(
                      "expected_daily_leads",
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                    )
                  }
                  className="h-9"
                />
              </label>
            </div>
            {notesField("trial_success_criteria", "Trial success criteria")}
            {notesField("trial_results", "Trial results & delivery notes")}
            <div className="border-t pt-4">
              <h3 className="mb-3 text-sm font-semibold">Commercial details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-xs font-medium text-slate-600">
                  Proposed monthly price
                  <Input
                    aria-label="Proposed monthly price"
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.proposed_monthly_price ?? ""}
                    onChange={(event) =>
                      update(
                        "proposed_monthly_price",
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                      )
                    }
                    className="h-9"
                  />
                </label>
                {textField("currency", "Currency", "text", "USD")}
                {dateTimeField("close_call_at", "Close call (local time)")}
              </div>
            </div>
            {notesField("close_notes", "Close decision / objections")}
          </TabsContent>
          <TabsContent value="followup" className="space-y-4">
            <h3 className="text-sm font-semibold">Next action</h3>
            {textField(
              "next_action",
              "What needs to happen next?",
              "text",
              "Call the owner to review trial results",
            )}
            {dateTimeField("next_follow_up_at", "Follow-up (local time)")}
            <p className="text-xs text-muted-foreground">
              This date appears in your company list and follow-up view. Use
              tasks below for multiple callbacks, reminders, and assignments.
            </p>
          </TabsContent>
          <TabsContent value="properties" className="space-y-5">
            <div>
              <h3 className="mb-3 text-sm font-semibold">Tags</h3>
              <div className="mb-3 flex flex-wrap gap-2">
                {(draft.tags ?? []).map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() =>
                      update(
                        "tags",
                        draft.tags?.filter((item) => item !== tag),
                      )
                    }
                    className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800"
                    aria-label={`Remove tag ${tag}`}
                  >
                    {tag} ×
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  aria-label="New tags"
                  placeholder="Separate tags with commas"
                  value={tagInput}
                  maxLength={1800}
                  onChange={(event) => setTagInput(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    update("tags", [
                      ...new Set([
                        ...(draft.tags ?? []),
                        ...tagInput
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      ]),
                    ]);
                    setTagInput("");
                  }}
                >
                  Add tags
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between border-t pt-4">
              <h3 className="text-sm font-semibold">Custom properties</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={properties.length >= 30}
                onClick={() => {
                  setProperties([...properties, { name: "", value: "" }]);
                  setSaved(false);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add property
              </Button>
            </div>
            {properties.map((field, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  aria-label={`Property ${index + 1} name`}
                  placeholder="Property name"
                  maxLength={60}
                  value={field.name}
                  onChange={(event) =>
                    setProperties(
                      properties.map((item, i) =>
                        i === index
                          ? { ...item, name: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <Input
                  aria-label={`Property ${index + 1} value`}
                  placeholder="Value"
                  maxLength={2000}
                  value={field.value}
                  onChange={(event) =>
                    setProperties(
                      properties.map((item, i) =>
                        i === index
                          ? { ...item, value: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove property ${index + 1}`}
                  onClick={() => {
                    setProperties(properties.filter((_, i) => i !== index));
                    setSaved(false);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </fieldset>
      {(save.error || localError) && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {save.error?.message || localError}
        </p>
      )}
      <div className="sticky bottom-0 mt-5 flex items-center gap-3 border-t bg-white py-4">
        {!readOnly && (
          <Button
            type="submit"
            disabled={save.isPending || !!dateError || blocked}
          >
            {save.isPending
              ? "Saving…"
              : company
                ? "Save changes"
                : "Create company"}
          </Button>
        )}
        {saved && (
          <p role="status" className="text-xs text-emerald-700">
            Saved.
          </p>
        )}
        <p className="ml-auto text-xs text-muted-foreground">
          {readOnly ? "Read-only access" : "Changes save across all tabs"}
        </p>
      </div>
    </form>
  );
}
