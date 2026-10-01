import { PageTitle, PageDescription } from "@/components/page-layout";
import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText, CheckCircle, AlertCircle, X, Download, ChevronRight, Plus, ArrowLeft, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Link } from "wouter";
import { PERSON_FIELDS, detectDecisionMakers, mapDecisionMakers, type PersonMapping } from "@/lib/decision-maker-import";
import { parseCSV } from "@/lib/csv";
import { parseXlsx } from "@/lib/xlsx";

const LEAD_FIELDS = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "state", label: "State" },
  { key: "city", label: "City" },
  { key: "timezone", label: "IANA Timezone" },
  { key: "title", label: "Job Title" },
  { key: "source", label: "Source" },
  { key: "status", label: "Status" },
  { key: "disposition", label: "Disposition" },
  { key: "contactAttempts", label: "Times Contacted" },
];

const COMPANY_FIELDS = [
  ["name", "Company Name"], ["phone", "Phone"], ["email", "Email"], ["website", "Website"],
  ["city", "City"], ["state", "State"], ["industry", "Industry"], ["contact_name", "Contact Name"],
  ["fit_notes", "Fit Notes"], ["source", "Source"], ["stage", "Stage"], ["needs_verification", "Needs Verification"],
  ["address", "Address"], ["postal_code", "Postal Code"], ["country", "Country"], ["tags", "Tags"],
  ["trial_type", "Trial Type"], ["trial_start_date", "Trial Start Date"], ["trial_end_date", "Trial End Date"],
  ["trial_capacity_slot", "Trial Capacity Slot"], ["coverage_hours", "Coverage Hours"], ["coverage_timezone", "Coverage Timezone"],
  ["expected_daily_leads", "Expected Daily Leads"], ["trial_success_criteria", "Trial Success Criteria"], ["trial_results", "Trial Results"],
  ["proposed_monthly_price", "Proposed Monthly Price"], ["currency", "Currency"], ["next_action", "Next Action"],
  ["next_follow_up_at", "Next Follow Up At"], ["close_call_at", "Close Call At"], ["close_notes", "Close Notes"],
].map(([key, label]) => ({ key, label }));

export default function LeadImport({ companyMode = false }: { companyMode?: boolean }) {
  const query = new URLSearchParams(window.location.search);
  const clientAccountId = companyMode ? null : query.get("clientAccountId");
  const clientName = companyMode ? null : query.get("clientName");
  const fields = companyMode ? COMPANY_FIELDS : LEAD_FIELDS;
  const noun = companyMode ? "companies" : "contacts";
  const queryClient = useQueryClient();
  const [personMappings, setPersonMappings] = useState<PersonMapping[]>([{}]);
  const [progress, setProgress] = useState(0);
  function downloadTemplate() {
    const blob = new Blob([[...fields.map(field => field.label), ...(companyMode ? ["Decision Maker 1 Name", "Decision Maker 1 Role", "Decision Maker 1 Email", "Decision Maker 1 Phone", "Decision Maker 2 Name", "Decision Maker 2 Role", "Decision Maker 2 Email", "Decision Maker 2 Phone"] : [])].join(",") + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = companyMode ? "companies-template.csv" : "leads-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "map" | "preview" | "done">("upload");
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [customMappings, setCustomMappings] = useState<Array<{ id: string; name: string; column: string }>>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<{ imported: number; failed: number; errors: string[] } | null>(null);
  const [fileError, setFileError] = useState("");

  const importMutation = useMutation({
    mutationFn: async (leads: object[]) => {
      if (companyMode) {
        const totals = { imported: 0, failed: 0, errors: [] as string[] };
        setProgress(0);
        for (let offset = 0; offset < leads.length; offset += 20) {
          try {
            const batch = await apiFetch("/api/companies/import", { method: "POST", body: JSON.stringify({ companies: leads.slice(offset, offset + 20) }) });
            totals.imported += batch.imported; totals.failed += batch.failed;
            totals.errors.push(...batch.errors.map((error: string) => error.replace(/^Record (\d+):/, (_, n) => "Record " + (Number(n) + offset) + ":")));
            setProgress(Math.min(offset + 20, leads.length));
          } catch (error) {
            totals.failed += leads.length - offset;
            totals.errors.push("Import stopped at record " + (offset + 1) + ". Check Companies before retrying: the last batch may have saved. " + String(error));
            break;
          }
        }
        return totals;
      }
      return await apiFetch("/api/leads/import", {
        method: "POST",
        body: JSON.stringify({ leads, clientAccountId: clientAccountId || undefined }),
      });
    },
    onSuccess: (data) => { setResult(data); setStep("done"); void queryClient.invalidateQueries(); },
  });

  async function handleFile(file: File) {
    setFileError("");
    if (file.size > 10 * 1024 * 1024) {
      setFileError("The file is larger than the 10 MB limit.");
      return;
    }
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setFileError("Choose a .csv or .xlsx file.");
      return;
    }
    setFileName(file.name);
    try {
      if (/\.xlsx$/i.test(file.name)) {
        finishParsing(await parseXlsx(await file.arrayBuffer()));
        return;
      }
      const text = await file.text();
      finishParsing(parseCSV(text));
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "The file could not be read.");
      setParsed(null);
      setStep("upload");
    }
  }

  function finishParsing(p: { headers: string[]; rows: string[][] }) {
      p = { ...p, rows: p.rows.filter((row) => row.some((cell) => cell.trim())) };
      if (!p.headers.length) throw new Error("The file does not contain a header row.");
      if (!p.rows.length) throw new Error("The file does not contain any data rows.");
      setParsed(p);
      const autoMap: Record<string, string> = {};
      fields.forEach((f) => {
        const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
        const aliases = [f.key, f.label, ...(companyMode && f.key === "name" ? ["company", "business name", "business"] : [])].map(normalize);
        const match = p.headers.find(h => h.trim() && aliases.includes(normalize(h)));
        if (match) autoMap[f.key] = match;
      });
      setMapping(autoMap);
      setCustomMappings([]);
      setPersonMappings(companyMode ? detectDecisionMakers(p.headers) : [{}]);
      setStep("map");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function mapRow(row: string[]) {
    if (!parsed) return {};
    const lead: Record<string, unknown> = {};
    fields.forEach((field) => {
      const column = mapping[field.key];
      if (!column) return;
      const index = parsed.headers.indexOf(column);
      if (index !== -1) lead[field.key] = row[index] ?? "";
    });
    if (lead.contactAttempts) {
      lead.contactAttempts = Math.max(0, Number.parseInt(String(lead.contactAttempts), 10) || 0);
    }
    lead.customFields = Object.fromEntries(
      customMappings
        .filter((field) => field.name.trim() && field.column)
        .map((field) => [field.name.trim(), row[parsed.headers.indexOf(field.column)] ?? ""]),
    );
    if (!companyMode) {
      for (const key of ['state', 'city', 'timezone']) {
        if (lead[key]) (lead.customFields as Record<string, unknown>)[key] = lead[key];
        delete lead[key];
      }
    }
    if (companyMode) { lead.custom_fields = lead.customFields; delete lead.customFields; lead.contacts = mapDecisionMakers(parsed.headers, row, personMappings); }
    return lead;
  }

  function getPreviewLeads() {
    if (!parsed) return [];
    return parsed.rows.slice(0, 5).map(mapRow);
  }

  function doImport() {
    if (!parsed) return;
    const leads = parsed.rows.map(mapRow);
    importMutation.mutate(leads);
  }

  const STEPS = ["Upload", "Map Columns", "Preview", "Done"];
  const stepIdx = ["upload", "map", "preview", "done"].indexOf(step);

  return (

      <div className="page-stack">
        <div>
          {clientAccountId && <Link href={`/sub-accounts/${clientAccountId}`} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to {clientName || "client workspace"}</Link>}
          <PageTitle>{companyMode ? "Import Companies" : clientName ? `Upload leads for ${clientName}` : "Import Leads"}</PageTitle>
          <PageDescription>{clientName ? "Every imported lead will be assigned only to this client account." : `Upload a CSV or XLSX file to bulk-import ${noun} into VictorySync`}</PageDescription>
          {clientAccountId && <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"><ShieldCheck className="h-3.5 w-3.5" /> Client-scoped import</div>}
        </div>

        {companyMode && <p className="text-sm text-muted-foreground">Imports create new companies. All fields are optional. Missing names become ?Unnamed company? and are flagged for verification. Use YYYY-MM-DD for trial dates and timestamps with a timezone for follow-ups. Tags can be separated by commas or semicolons. Existing records are never overwritten.</p>}
        {/* Steps */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 ${i < stepIdx ? "text-green-600" : i === stepIdx ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < stepIdx ? "bg-green-100" : i === stepIdx ? "bg-primary/15" : "bg-muted"}`}>
                  {i < stepIdx ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                <span className="text-xs font-medium hidden sm:block">{s}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground/40" />}
            </div>
          ))}
        </div>

        {step === "upload" && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-8">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/20"}`}
            >
              <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? "text-primary" : "text-muted-foreground/40"}`} />
              <p className="font-semibold text-foreground mb-1">Drop your CSV or XLSX file here</p>
              <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
              <span className="text-xs bg-muted px-3 py-1.5 rounded-full text-muted-foreground">Supports .csv and .xlsx files up to 10MB</span>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
            {fileError && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 flex-shrink-0" /> {fileError}
              </div>
            )}
            <div className="mt-4 flex justify-center">
              <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Download className="w-4 h-4" /> Download CSV template
              </button>
            </div>
          </div>
        )}

        {step === "map" && parsed && (
          <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-3">
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <div className="font-semibold text-foreground text-sm">{fileName}</div>
                <div className="text-xs text-muted-foreground">{parsed.rows.length} rows detected · {parsed.headers.length} columns</div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">Map the columns you want to import. All fields are optional; missing values stay blank.</p>
              <div className="space-y-3">
                {fields.map((f) => (
                  <div key={f.key} className="flex items-center gap-4">
                    <div className="w-32 text-sm font-medium text-foreground flex-shrink-0">
                      {f.label}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <select
                      value={mapping[f.key] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                      className="workspace-control flex-1 px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                    >
                      <option value="">— Skip this field —</option>
                      {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {companyMode && <section className="border-t border-border pt-4 space-y-4" aria-label="Decision-maker column mapping">
                <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Decision-makers</h2><p className="text-xs text-muted-foreground">Map each person's columns to save them under the company's People tab. All fields are optional. People without names are labeled Unnamed contact and flagged for verification. Empty people are skipped.</p></div><button type="button" disabled={personMappings.length >= 30} onClick={() => setPersonMappings(groups => [...groups, {}])} className="shrink-0 rounded-md border px-3 py-2 text-xs disabled:opacity-40">Add decision-maker</button></div>
                <p className="text-xs text-muted-foreground">Each spreadsheet row creates one company. Add a mapping group for each decision-maker on that row. Generic Email and Phone columns default to company fields; map them here if they belong to a person.</p>
                {personMappings.map((personMapping, index) => <fieldset key={index} className="rounded-lg border p-3 space-y-3"><legend className="px-1 text-sm font-medium">Decision-maker {index + 1}</legend><div className="grid gap-3 sm:grid-cols-2">{PERSON_FIELDS.map(([key, title]) => <label key={key} className="text-xs font-medium">{title}<select aria-label={`Decision-maker ${index + 1} ${title}`} value={personMapping[key] ?? ""} onChange={event => setPersonMappings(groups => groups.map((group, item) => item === index ? { ...group, [key]: event.target.value } : group))} className="workspace-control mt-1 block w-full min-w-0 rounded-md border bg-white px-2 py-2"><option value="">Skip this field</option>{parsed.headers.map(header => <option key={header} value={header}>{header}</option>)}</select></label>)}</div><button type="button" aria-label={`Remove decision-maker ${index + 1}`} onClick={() => setPersonMappings(groups => groups.filter((_, item) => item !== index))} className="text-xs text-muted-foreground hover:text-red-600">Remove decision-maker</button></fieldset>)}
              </section>}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Custom fields</p>
                    <p className="text-xs text-muted-foreground">Choose a spreadsheet column and name its CRM field.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCustomMappings((fields) => [...fields, { id: crypto.randomUUID(), name: "", column: "" }])}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add field
                  </button>
                </div>
                <div className="space-y-2">
                  {customMappings.map((field) => (
                    <div key={field.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <input
                        value={field.name}
                        onChange={(e) => setCustomMappings((fields) => fields.map((item) => item.id === field.id ? { ...item, name: e.target.value } : item))}
                        placeholder="CRM field name"
                        className="workspace-control px-3 py-2 text-sm border border-border rounded-lg"
                      />
                      <select
                        value={field.column}
                        onChange={(e) => setCustomMappings((fields) => fields.map((item) => item.id === field.id ? { ...item, column: e.target.value } : item))}
                        className="workspace-control px-3 py-2 text-sm border border-border rounded-lg bg-background"
                      >
                        <option value="">Select file column</option>
                        {parsed.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                      </select>
                      <button
                        type="button"
                        aria-label={`Remove ${field.name || "custom field"}`}
                        onClick={() => setCustomMappings((fields) => fields.filter((item) => item.id !== field.id))}
                        className="p-2 text-muted-foreground hover:text-red-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2 justify-end">
              <button onClick={() => setStep("upload")} className="px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:bg-muted">Back</button>
              <button
                onClick={() => setStep("preview")}
                className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40"
              >
                Preview Import
              </button>
            </div>
          </div>
        )}

        {step === "preview" && parsed && (
          <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <div className="font-semibold text-foreground text-sm">Preview (first 5 rows)</div>
              <div className="text-xs text-muted-foreground mt-0.5">{parsed.rows.length} {noun} will be imported</div>
            </div>
            <div className="overflow-x-auto">
              <table className="workspace-table w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {fields.filter((f) => mapping[f.key]).map((f) => (
                      <th key={f.key} className="text-left text-xs font-semibold text-muted-foreground px-4 py-2">{f.label}</th>
                    ))}
                    {companyMode && <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2">Decision-makers</th>}
                    {customMappings.filter((field) => field.name.trim() && field.column).map((field) => (
                      <th key={field.id} className="text-left text-xs font-semibold text-muted-foreground px-4 py-2">{field.name.trim()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getPreviewLeads().map((lead, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                      {fields.filter((f) => mapping[f.key]).map((f) => (
                        <td key={f.key} className="px-4 py-2 text-xs text-foreground">{String(lead[f.key] || "") || <span className="text-muted-foreground">—</span>}</td>
                      ))}
                      {companyMode && <td className="px-4 py-2 text-xs min-w-52">{(lead.contacts as Array<{ name: string; role: string; email: string; phone: string }>).map((person, index) => <div key={index} className="mb-2"><span className="font-medium">{person.name || "Unnamed contact"}</span>{[person.role, person.email, person.phone].filter(Boolean).map((value, item) => <div key={item} className="text-muted-foreground">{value}</div>)}</div>)}</td>}
                      {customMappings.filter((field) => field.name.trim() && field.column).map((field) => (
                        <td key={field.id} className="px-4 py-2 text-xs text-foreground">
                          {String(((companyMode ? lead.custom_fields : lead.customFields) as Record<string, string>)[field.name.trim()] || "") || <span className="text-muted-foreground">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {importMutation.error && (
              <div className="mx-6 my-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {String(importMutation.error)}
              </div>
            )}
            <div className="px-6 py-4 flex gap-2 justify-end border-t border-border">
              <button onClick={() => setStep("map")} className="px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:bg-muted">Back</button>
              <button
                onClick={doImport}
                disabled={importMutation.isPending}
                className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40"
              >
                {importMutation.isPending ? `Importing... ${companyMode ? progress + "/" + parsed.rows.length : ""}` : `Import ${parsed.rows.length} ${companyMode ? "Companies" : "Contacts"}`}
              </button>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-8 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${result.failed === 0 ? "bg-green-100" : "bg-amber-100"}`}>
              {result.failed === 0 ? <CheckCircle className="w-8 h-8 text-green-600" /> : <AlertCircle className="w-8 h-8 text-amber-600" />}
            </div>
            <h2 className="text-lg font-bold text-foreground mb-1">{result.failed ? "Import finished with issues" : "Import Complete!"}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Successfully imported <span className="font-semibold text-green-600">{result.imported}</span> {noun}
              {result.failed > 0 && <>, <span className="font-semibold text-red-500">{result.failed}</span> failed or unconfirmed</>}
            </p>
            {result.errors.length > 0 && (
              <div className="text-left bg-red-50 border border-red-200 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div key={i} className="text-xs text-red-600 flex items-start gap-1.5 mb-1">
                    <X className="w-3 h-3 mt-0.5 flex-shrink-0" />{e}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <Link href={companyMode ? "/companies" : clientAccountId ? `/sub-accounts/${clientAccountId}` : "/leads"} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90">
                {companyMode ? "View Companies" : clientAccountId ? "Return to Client Workspace" : "View Contacts"}
              </Link>
              <button
                onClick={() => { setStep("upload"); setParsed(null); setMapping({}); setCustomMappings([]); setPersonMappings([{}]); setResult(null); setFileName(""); }}
                className="px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:bg-muted"
              >
                Import More
              </button>
            </div>
          </div>
        )}
      </div>

  );
}
