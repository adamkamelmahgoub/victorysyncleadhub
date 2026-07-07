import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, FileText, CheckCircle, AlertCircle, X, Download, ChevronRight } from "lucide-react";

const LEAD_FIELDS = [
  { key: "firstName", label: "First Name", required: true },
  { key: "lastName", label: "Last Name", required: true },
  { key: "email", label: "Email", required: true },
  { key: "phone", label: "Phone", required: false },
  { key: "company", label: "Company", required: false },
  { key: "title", label: "Job Title", required: false },
  { key: "source", label: "Source", required: false },
  { key: "status", label: "Status", required: false },
];

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = (lines[0] ?? "").split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) =>
    line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""))
  );
  return { headers, rows };
}

function downloadTemplate() {
  const csv = "First Name,Last Name,Email,Phone,Company,Job Title,Source,Status\nJane,Smith,jane@acme.com,+15551234567,Acme Corp,CEO,LinkedIn,new\nJohn,Doe,john@startup.io,,Startup IO,CTO,Webinar,new";
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "leads-template.csv";
  a.click();
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function LeadImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "map" | "preview" | "done">("upload");
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<{ imported: number; failed: number; errors: string[] } | null>(null);

  const importMutation = useMutation({
    mutationFn: async (leads: object[]) => {
      const res = await fetch(`${BASE}/api/leads/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => { setResult(data); setStep("done"); },
  });

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const p = parseCSV(text);
      setParsed(p);
      // Auto-map headers
      const autoMap: Record<string, string> = {};
      LEAD_FIELDS.forEach((f) => {
        const match = p.headers.find((h) => h.toLowerCase().replace(/\s+/g, "").includes(f.key.toLowerCase()) || f.label.toLowerCase().includes(h.toLowerCase()));
        if (match) autoMap[f.key] = match;
      });
      setMapping(autoMap);
      setStep("map");
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function getPreviewLeads() {
    if (!parsed) return [];
    return parsed.rows.slice(0, 5).map((row) => {
      const lead: Record<string, string> = {};
      LEAD_FIELDS.forEach((f) => {
        const col = mapping[f.key];
        if (col) {
          const idx = parsed.headers.indexOf(col);
          if (idx !== -1) lead[f.key] = row[idx] ?? "";
        }
      });
      return lead;
    });
  }

  function doImport() {
    if (!parsed) return;
    const leads = parsed.rows.map((row) => {
      const lead: Record<string, string> = {};
      LEAD_FIELDS.forEach((f) => {
        const col = mapping[f.key];
        if (col) {
          const idx = parsed.headers.indexOf(col);
          if (idx !== -1) lead[f.key] = row[idx] ?? "";
        }
      });
      return lead;
    }).filter((l) => l.email && l.firstName && l.lastName);
    importMutation.mutate(leads);
  }

  const STEPS = ["Upload", "Map Columns", "Preview", "Done"];
  const stepIdx = ["upload", "map", "preview", "done"].indexOf(step);

  return (

      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Import Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Upload a CSV file to bulk-import contacts into VictorySync</p>
        </div>

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
              <p className="font-semibold text-foreground mb-1">Drop your CSV file here</p>
              <p className="text-sm text-muted-foreground mb-4">or click to browse</p>
              <span className="text-xs bg-muted px-3 py-1.5 rounded-full text-muted-foreground">Supports .csv files up to 10MB</span>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
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
              <p className="text-sm text-muted-foreground">Map your CSV columns to VictorySync fields:</p>
              <div className="space-y-3">
                {LEAD_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-4">
                    <div className="w-32 text-sm font-medium text-foreground flex-shrink-0">
                      {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <select
                      value={mapping[f.key] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                      className="flex-1 px-3 py-2 text-sm border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                    >
                      <option value="">— Skip this field —</option>
                      {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2 justify-end">
              <button onClick={() => setStep("upload")} className="px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:bg-muted">Back</button>
              <button
                onClick={() => setStep("preview")}
                disabled={!mapping.firstName || !mapping.lastName || !mapping.email}
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
              <div className="text-xs text-muted-foreground mt-0.5">{parsed.rows.length} total contacts will be imported</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {LEAD_FIELDS.filter((f) => mapping[f.key]).map((f) => (
                      <th key={f.key} className="text-left text-xs font-semibold text-muted-foreground px-4 py-2">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {getPreviewLeads().map((lead, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                      {LEAD_FIELDS.filter((f) => mapping[f.key]).map((f) => (
                        <td key={f.key} className="px-4 py-2 text-xs text-foreground">{lead[f.key] || <span className="text-muted-foreground">—</span>}</td>
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
                {importMutation.isPending ? "Importing..." : `Import ${parsed.rows.length} Contacts`}
              </button>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-8 text-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${result.failed === 0 ? "bg-green-100" : "bg-amber-100"}`}>
              {result.failed === 0 ? <CheckCircle className="w-8 h-8 text-green-600" /> : <AlertCircle className="w-8 h-8 text-amber-600" />}
            </div>
            <h2 className="text-lg font-bold text-foreground mb-1">Import Complete!</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Successfully imported <span className="font-semibold text-green-600">{result.imported}</span> contacts
              {result.failed > 0 && <>, <span className="font-semibold text-red-500">{result.failed}</span> failed</>}
            </p>
            {result.errors.length > 0 && (
              <div className="text-left bg-red-50 border border-red-200 rounded-lg p-3 mb-4 max-h-32 overflow-y-auto">
                {result.errors.slice(0, 5).map((e, i) => (
                  <div key={i} className="text-xs text-red-600 flex items-start gap-1.5 mb-1">
                    <X className="w-3 h-3 mt-0.5 flex-shrink-0" />{e}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <a href={`${BASE}/leads`} className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90">
                View Contacts
              </a>
              <button
                onClick={() => { setStep("upload"); setParsed(null); setMapping({}); setResult(null); setFileName(""); }}
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
