import { useState } from "react";
import { Link } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ContactErrorBoundary } from "@/components/contact-error-boundary";
import { getDisplayName, getInitials, type ContactDisplay } from "@/lib/contact-display";

export type ContactRow = ContactDisplay & {
  id: string;
  tags?: string[] | null;
  status?: string | null;
  source?: string | null;
  state?: string | null;
  createdAt?: string | null;
  lastActivityAt?: string | null;
  customFields?: Record<string, unknown> | null;
};

type Column = "name" | "company" | "phone" | "email" | "tags" | "status" | "source" | "location" | "lastActivity" | "created";
const labels: Record<Column, string> = {
  name: "Name", company: "Company", phone: "Phone", email: "Email", tags: "Tags", status: "Status",
  source: "Source", location: "City / State", lastActivity: "Last activity", created: "Created date",
};
const defaultColumns = Object.keys(labels) as Column[];
function readColumns(): Column[] {
  try {
    const saved = JSON.parse(localStorage.getItem("crm-contact-columns") ?? "null") as unknown;
    if (Array.isArray(saved) && saved.every((name) => typeof name === "string" && name in labels) && saved.length) {
      return [...new Set(saved)] as Column[];
    }
  } catch { /* Restore defaults when the saved layout is malformed. */ }
  return defaultColumns;
}
function date(value?: string | null) { return value ? new Date(value).toLocaleDateString() : "—"; }

export function ContactGrid({ contacts, selected, onSelect, onDelete, canEdit = true }: {
  contacts: ContactRow[];
  selected: Set<string>;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  canEdit?: boolean;
}) {
  const [columns, setColumns] = useState<Column[]>(readColumns);
  const [showColumns, setShowColumns] = useState(false);
  const setLayout = (next: Column[]) => { setColumns(next); localStorage.setItem("crm-contact-columns", JSON.stringify(next)); };
  const move = (column: Column, direction: -1 | 1) => {
    const next = [...columns]; const at = next.indexOf(column); const target = at + direction;
    if (at < 0 || target < 0 || target >= next.length) return;
    [next[at], next[target]] = [next[target]!, next[at]!]; setLayout(next);
  };
  const cell = (lead: ContactRow, column: Column) => {
    switch (column) {
      case "name": return <Link href={`/leads/${lead.id}`} className="flex items-center gap-3 font-medium text-primary hover:underline"><span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs">{getInitials(lead)}</span>{getDisplayName(lead)}</Link>;
      case "company": return lead.company || "—";
      case "phone": return lead.phone ? <a href={`tel:${lead.phone}`} className="hover:underline">{lead.phone}</a> : "—";
      case "email": return lead.email ? <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a> : "—";
      case "tags": return (lead.tags ?? []).length ? (lead.tags ?? []).join(", ") : "—";
      case "status": return lead.status || "—";
      case "source": return lead.source || "—";
      case "location": return [lead.customFields?.city, lead.state ?? lead.customFields?.state].filter(Boolean).join(", ") || "—";
      case "lastActivity": return date(lead.lastActivityAt);
      case "created": return date(lead.createdAt);
    }
  };
  return <div>
    <div className="flex justify-end border-b px-4 py-2"><Button variant="outline" size="sm" onClick={() => setShowColumns((value) => !value)} aria-expanded={showColumns}>Columns</Button></div>
    {showColumns && <div className="grid gap-2 border-b bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Contact columns">
      {defaultColumns.map((column) => <div key={column} className="flex items-center gap-1 text-xs">
        <Checkbox checked={columns.includes(column)} onCheckedChange={() => setLayout(columns.includes(column) ? columns.filter((value) => value !== column) : [...columns, column])} aria-label={`Show ${labels[column]}`} />
        <span className="flex-1">{labels[column]}</span>
        <button type="button" onClick={() => move(column,-1)} disabled={!columns.includes(column)} aria-label={`Move ${labels[column]} left`}>←</button>
        <button type="button" onClick={() => move(column,1)} disabled={!columns.includes(column)} aria-label={`Move ${labels[column]} right`}>→</button>
      </div>)}
    </div>}
    <div className="overflow-x-auto"><table className="workspace-table w-full text-sm"><thead><tr className="bg-muted/30 text-left">
      {canEdit && <th className="px-3 py-2">Select</th>}{columns.map((column) => <th key={column} className="min-w-28 whitespace-nowrap px-3 py-2">{labels[column]}</th>)}{onDelete && <th className="px-3 py-2">Actions</th>}
    </tr></thead><tbody>
      {contacts.map((lead) => <ContactErrorBoundary key={lead.id} fallback={<tr><td colSpan={columns.length + 2} className="p-3">Could not display this contact.</td></tr>}><tr className="border-t hover:bg-muted/20">
        {canEdit && <td className="px-3 py-2"><Checkbox checked={selected.has(lead.id)} onCheckedChange={() => onSelect(lead.id)} aria-label={`Select ${getDisplayName(lead)}`} /></td>}
        {columns.map((column) => <td key={column} className="max-w-64 truncate px-3 py-2">{cell(lead,column)}</td>)}
        {onDelete && <td className="px-3 py-2"><Button variant="ghost" size="sm" onClick={() => onDelete(lead.id)}>Delete</Button></td>}
      </tr></ContactErrorBoundary>)}
      {!contacts.length && <tr><td colSpan={columns.length + 2} className="p-8 text-center text-muted-foreground">No contacts match these filters.</td></tr>}
    </tbody></table></div>
  </div>;
}
