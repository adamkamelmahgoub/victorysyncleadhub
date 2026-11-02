import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { asArray } from "@/lib/data-shape";

type Condition = { field: string; operator: string; value: string | string[] | boolean };
type Group = { op: "and" | "or"; conditions: Array<Group | Condition> };
type Segment = { id: string; name: string; description?: string | null; segmentType: "smart" | "static"; contactCount: number; filterSummary: string; filters: Group };
type SequenceOption = { id: string; name: string };
const blankGroup = (): Group => ({ op: "and", conditions: [] });
const blankCondition = (): Condition => ({ field: "status", operator: "eq", value: "" });
const fields = [
  ["name","Name"],["company","Company"],["email","Email"],["phone","Phone"],["tags","Tags"],
  ["status","Status"],["source","Source"],["state","State"],["city","City"],["created_at","Created date"],
  ["last_activity","Last activity"],["has_email","Has email"],["has_phone","Has phone"],["score","Score"],
  ["enrolled_in_sequence","Enrolled in sequence"],["custom_fields.","Custom field"],["other.","Other contact field"],
];
const operators = [["eq","Equals"],["neq","Does not equal"],["contains","Contains"],["is_empty","Is empty"],
  ["is_not_empty","Is not empty"],["has_any","Has any"],["has_all","Has all"],["has_none","Has none"],
  ["before","Before"],["after","After"],["gte","On or after"],["lte","On or before"]];
function operatorsFor(field: string) {
  if (field === "tags") return operators.filter(([value]) => ["has_any","has_all","has_none"].includes(value));
  if (field === "has_email" || field === "has_phone" || field === "enrolled_in_sequence") return operators.filter(([value]) => value === "eq");
  if (field === "created_at" || field === "last_activity") return operators.filter(([value]) => ["before","after","gte","lte","is_empty","is_not_empty"].includes(value));
  if (field === "score") return operators.filter(([value]) => ["eq","neq","gte","lte"].includes(value));
  return operators.filter(([value]) => ["eq","neq","contains","is_empty","is_not_empty"].includes(value));
}

function GroupEditor({ group, onChange, sequences, depth = 0 }: { group: Group; onChange: (group: Group) => void; sequences: SequenceOption[]; depth?: number }) {
  const update = (index: number, item: Group | Condition) => onChange({ ...group, conditions: group.conditions.map((existing, at) => at === index ? item : existing) });
  return <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
    <div className="flex items-center gap-2"><span className="text-sm font-medium">Match</span><select className="workspace-control rounded border px-2 py-1 text-sm" value={group.op} onChange={(event) => onChange({ ...group, op: event.target.value as "and" | "or" })}><option value="and">all conditions (AND)</option><option value="or">any condition (OR)</option></select></div>
    {group.conditions.map((item, index) => <div key={index} className="flex items-start gap-2">
      <div className="min-w-0 flex-1">{"conditions" in item ? <GroupEditor group={item} onChange={(next) => update(index,next)} sequences={sequences} depth={depth+1} /> : <div className="grid gap-2 sm:grid-cols-3">
        <div><select className="workspace-control w-full rounded border px-2 py-2 text-sm" value={item.field.startsWith("custom_fields.") ? "custom_fields." : item.field.startsWith("other.") ? "other." : item.field} onChange={(event) => update(index,{ ...item, field: event.target.value, operator: event.target.value === "tags" ? "has_any" : event.target.value === "created_at" || event.target.value === "last_activity" ? "after" : "eq", value: event.target.value === "has_email" || event.target.value === "has_phone" ? "true" : "" })}>{fields.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
          {item.field.startsWith("custom_fields.") && <Input className="mt-1" placeholder="Field key" aria-label="Custom field key" value={item.field.slice(14)} onChange={(event) => update(index,{ ...item, field: `custom_fields.${event.target.value.replace(/[^A-Za-z0-9_]/g,"")}` })} />}
          {item.field.startsWith("other.") && <Input className="mt-1" placeholder="Column name" aria-label="Contact field name" value={item.field.slice(6)} onChange={(event) => update(index,{ ...item, field: `other.${event.target.value.replace(/[^A-Za-z0-9_]/g,"")}` })} />}</div>
        <select className="workspace-control rounded border px-2 py-2 text-sm" value={item.operator} onChange={(event) => update(index,{ ...item, operator: event.target.value })}>{operatorsFor(item.field).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
        {item.operator !== "is_empty" && item.operator !== "is_not_empty" && (item.field === "enrolled_in_sequence" ?
          <select className="workspace-control rounded border px-2 py-2 text-sm" value={String(item.value ?? "")} onChange={(event) => update(index,{ ...item, value: event.target.value })}><option value="">Any sequence</option>{sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}</select> :
          item.field === "has_email" || item.field === "has_phone" ? <select className="workspace-control rounded border px-2 py-2 text-sm" value={String(item.value || "true")} onChange={(event) => update(index,{ ...item, value: event.target.value })}><option value="true">Yes</option><option value="false">No</option></select> :
          <Input type={item.field === "created_at" || item.field === "last_activity" ? "date" : "text"} value={Array.isArray(item.value) ? item.value.join(", ") : String(item.value ?? "")} onChange={(event) => update(index,{ ...item, value: item.field === "tags" ? event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) : event.target.value })} placeholder={item.field === "tags" ? "Comma-separated tags" : "Value"} />)}
      </div>}</div>
      <button className="rounded px-2 py-1 text-muted-foreground hover:text-destructive" aria-label="Remove condition" onClick={() => onChange({ ...group, conditions: group.conditions.filter((_,at) => at !== index) })}>×</button>
    </div>)}
    <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => onChange({ ...group, conditions: [...group.conditions, blankCondition()] })}>Add condition</Button>{depth < 3 && <Button size="sm" variant="outline" onClick={() => onChange({ ...group, conditions: [...group.conditions, blankGroup()] })}>Add group</Button>}</div>
  </div>;
}

export default function SegmentsV2() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading, error } = useQuery<Segment[]>({ queryKey: ["segments", "live"], queryFn: () => apiFetch("/api/segments?liveCounts=1"), staleTime: 60_000 });
  const segments = asArray<Segment>(data);
  const { data: sequencesResponse } = useQuery<SequenceOption[]>({ queryKey: ["segment-sequences"], queryFn: () => apiFetch("/api/sequences"), enabled: open });
  const sequences = asArray<SequenceOption>(sequencesResponse);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [segmentType, setSegmentType] = useState<"smart" | "static">("smart");
  const [filters, setFilters] = useState<Group>(blankGroup);
  const [working, setWorking] = useState(false);
  const [formError, setFormError] = useState("");
  function start(segment?: Segment) { setEditing(segment?.id ?? null); setName(segment?.name ?? ""); setDescription(segment?.description ?? ""); setSegmentType(segment?.segmentType ?? "smart"); setFilters(segment?.filters ?? blankGroup()); setFormError(""); setOpen(true); }
  async function save() {
    if (!name.trim()) return;
    setWorking(true); setFormError("");
    try { await apiFetch(editing ? `/api/segments/${editing}` : "/api/segments", { method: editing ? "PATCH" : "POST", body: JSON.stringify({ name: name.trim(), description, segmentType, filters }) }); setOpen(false); await client.invalidateQueries({ queryKey: ["segments"] }); }
    catch (cause) { setFormError(cause instanceof Error ? cause.message : "Could not save segment"); }
    finally { setWorking(false); }
  }
  async function remove(segment: Segment) { if (!window.confirm(`Delete segment “${segment.name}”? Contacts will stay in the CRM.`)) return; await apiFetch(`/api/segments/${segment.id}`, { method: "DELETE" }); await client.invalidateQueries({ queryKey: ["segments"] }); }
  return <div className="page-stack"><header className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Segments & Smart Lists</h1><p className="text-sm text-muted-foreground">Saved filters update as contacts change. Static segments keep a fixed list.</p></div><Button onClick={() => start()}>New segment</Button></header>
    {error && <p role="alert" className="text-destructive">{error instanceof Error ? error.message : "Could not load segments"}</p>}
    {isLoading && <p>Loading segments…</p>}
    {!isLoading && !error && !segments.length && <div className="rounded border p-8 text-center">No segments yet. Create a smart filter or a static list to organize contacts.</div>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{segments.map((segment) => <article key={segment.id} className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2"><div><Link href={`/contacts/segments/${segment.id}`} className="font-semibold text-primary hover:underline">{segment.name}</Link><p className="text-xs text-muted-foreground">{segment.segmentType === "static" ? "Static" : "Smart"} · {segment.contactCount.toLocaleString()} contacts</p></div><div className="flex gap-2"><button className="text-xs text-primary" onClick={() => start(segment)}>Edit</button><button className="text-xs text-destructive" onClick={() => void remove(segment)}>Delete</button></div></div>
      {segment.description && <p className="mt-2 text-sm">{segment.description}</p>}<p className="mt-3 text-xs text-muted-foreground">{segment.filterSummary}</p>
    </article>)}</div>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-background p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
      <h2 className="mb-4 text-lg font-semibold">{editing ? "Edit segment" : "New segment"}</h2><div className="grid gap-3 sm:grid-cols-2"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Segment name" aria-label="Segment name" /><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" aria-label="Description" /></div>
      <div className="my-4"><label className="mr-2 text-sm">Type</label><select className="workspace-control rounded border px-2 py-2 text-sm" value={segmentType} onChange={(event) => setSegmentType(event.target.value as "smart" | "static")}><option value="smart">Smart: filters update automatically</option><option value="static">Static: fixed contacts</option></select></div>
      {segmentType === "smart" && <GroupEditor group={filters} onChange={setFilters} sequences={sequences} />}{segmentType === "static" && <p className="rounded border p-3 text-sm text-muted-foreground">Add contacts from the Contacts list after saving this segment.</p>}
      {formError && <p role="alert" className="mt-3 text-destructive">{formError}</p>}<div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!name.trim() || working} onClick={() => void save()}>{working ? "Saving…" : "Save segment"}</Button></div>
    </div></div>}
  </div>;
}
