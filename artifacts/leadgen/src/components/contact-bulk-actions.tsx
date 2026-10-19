import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiDownloadCsv, apiFetch } from "@/lib/api";
import { asArray } from "@/lib/data-shape";

type Action = "add_tag" | "remove_tag" | "change_status" | "enroll_sequence" | "add_to_segment" | "export_csv" | "delete";
type Option = { id: string; name: string; segmentType?: string };

export function ContactBulkActions({ selected, segmentId, total, onDone }: {
  selected: Set<string>;
  segmentId?: string;
  total?: number;
  onDone: () => void;
}) {
  const [scope, setScope] = useState<"selected" | "all">("selected");
  const [action, setAction] = useState<Action>("add_tag");
  const [value, setValue] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const { data: sequencesResponse } = useQuery<Option[]>({ queryKey: ["sequences-bulk-options"], queryFn: () => apiFetch("/api/sequences"), enabled: action === "enroll_sequence" });
  const { data: segmentsResponse } = useQuery<Option[]>({ queryKey: ["segments"], queryFn: () => apiFetch("/api/segments"), enabled: action === "add_to_segment" });
  const sequences = asArray<Option>(sequencesResponse);
  const segments = asArray<Option>(segmentsResponse).filter((item) => item.segmentType === "static");
  const count = scope === "all" && segmentId ? (total ?? 0) : selected.size;
  const payload = { action, ...(scope === "all" && segmentId ? { segmentId } : { ids: [...selected] }),
    ...(action === "enroll_sequence" ? { sequenceId: value } : action === "add_to_segment" ? { targetSegmentId: value } : { value }) };
  async function run() {
    if (!count || (action !== "export_csv" && action !== "delete" && !value.trim())) return;
    if (action === "delete" && !window.confirm(`Permanently delete ${count} contacts? This also removes their linked outreach enrollments.`)) return;
    setWorking(true); setError(""); setResult("");
    try {
      if (action === "export_csv") await apiDownloadCsv("/api/contacts/bulk", payload);
      else {
        const response = await apiFetch("/api/contacts/bulk", { method: "POST", body: JSON.stringify({ ...payload, confirm: action === "delete" }) }) as { processed?: number; enrolled?: number };
        setResult(action === "enroll_sequence" ? `${response.enrolled ?? 0} enrolled` : `${response.processed ?? count} contacts processed`);
        onDone();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Bulk action failed"); }
    finally { setWorking(false); }
  }
  return <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 p-3 text-sm">
    <strong>{count.toLocaleString()} contacts</strong>
    {segmentId && <select className="workspace-control rounded border px-2 py-1" value={scope} onChange={(event) => setScope(event.target.value as "selected" | "all")} aria-label="Bulk action scope">
      <option value="selected">Selected rows</option><option value="all">Entire segment</option>
    </select>}
    <select className="workspace-control rounded border px-2 py-1" value={action} onChange={(event) => { setAction(event.target.value as Action); setValue(""); }} aria-label="Bulk action">
      <option value="add_tag">Add tag</option><option value="remove_tag">Remove tag</option><option value="change_status">Change status</option>
      <option value="enroll_sequence">Enroll in sequence</option><option value="add_to_segment">Add to static segment</option>
      <option value="export_csv">Export CSV</option><option value="delete">Delete</option>
    </select>
    {(action === "add_tag" || action === "remove_tag") && <input className="workspace-control rounded border px-2 py-1" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Tag name" aria-label="Tag name" />}
    {action === "change_status" && <select className="workspace-control rounded border px-2 py-1" value={value} onChange={(event) => setValue(event.target.value)} aria-label="New status"><option value="">Choose status</option>{["new","contacted","qualified","meeting_booked","proposal","converted","lost"].map((status) => <option key={status} value={status}>{status.replace(/_/g," ")}</option>)}</select>}
    {action === "enroll_sequence" && <select className="workspace-control rounded border px-2 py-1" value={value} onChange={(event) => setValue(event.target.value)} aria-label="Sequence"><option value="">Choose sequence</option>{sequences.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
    {action === "add_to_segment" && <select className="workspace-control rounded border px-2 py-1" value={value} onChange={(event) => setValue(event.target.value)} aria-label="Static segment"><option value="">Choose static segment</option>{segments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
    <Button size="sm" disabled={!count || working || (action !== "export_csv" && action !== "delete" && !value.trim())} onClick={() => void run()}>{working ? "Working…" : "Apply"}</Button>
    {error && <span role="alert" className="text-destructive">{error}</span>}{result && <span role="status">{result}</span>}
  </div>;
}
