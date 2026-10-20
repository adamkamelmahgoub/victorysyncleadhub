import { useState } from "react";
import { Link } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Columns3, Trash2 } from "lucide-react";
import { ContactAvatar } from "@/components/contact-avatar";
import { ContactErrorBoundary } from "@/components/contact-error-boundary";
import { getDisplayName, type ContactDisplay } from "@/lib/contact-display";

export type ContactRow = ContactDisplay & {
  id: string;
  tags?: string[] | null;
  status?: string | null;
  source?: string | null;
  state?: string | null;
  createdAt?: string | null;
  lastActivityAt?: string | null;
  customFields?: Record<string, unknown> | null;
  socials?: Record<string,string|null>;
};

type Column = "name" | "company" | "phone" | "email" | "instagram" | "facebook" | "linkedin" | "x" | "tiktok" | "tags" | "status" | "source" | "location" | "lastActivity" | "created";
const labels: Record<Column, string> = {
  name: "Name", company: "Company", phone: "Phone", email: "Email", tags: "Tags", status: "Status",
  source: "Source", location: "City / State", lastActivity: "Last activity", created: "Created date",
  instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", x: "X", tiktok: "TikTok",
};
const defaultColumns = Object.keys(labels) as Column[];
const widths: Record<Column, string> = {
  name: "w-[250px] min-w-[250px]", company: "w-[190px] min-w-[190px]", phone: "w-[150px] min-w-[150px]",
  email: "w-[210px] min-w-[210px]", tags: "w-[210px] min-w-[210px]", status: "w-[145px] min-w-[145px]",
  source: "w-[130px] min-w-[130px]", location: "w-[145px] min-w-[145px]",
  instagram: "w-[145px] min-w-[145px]", facebook: "w-[145px] min-w-[145px]", linkedin: "w-[145px] min-w-[145px]", x: "w-[145px] min-w-[145px]", tiktok: "w-[145px] min-w-[145px]",
  lastActivity: "w-[140px] min-w-[140px]", created: "w-[140px] min-w-[140px]",
};
function statusStyle(status: string) {
  if (["converted", "meeting_booked"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["qualified", "proposal"].includes(status)) return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "lost") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}
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
      case "name": return <Link href={`/leads/${lead.id}`} className="flex min-w-0 items-center gap-3 text-slate-900 hover:text-blue-700"><ContactAvatar contact={lead} /><span className="min-w-0 flex-1 truncate font-semibold" title={getDisplayName(lead)}>{getDisplayName(lead)}</span></Link>;
      case "company": return lead.company || "—";
      case "phone": return lead.phone ? <a href={`tel:${lead.phone}`} className="hover:underline">{lead.phone}</a> : "—";
      case "email": return lead.email ? <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a> : "—";
      case "tags": return (lead.tags ?? []).length ? <div className="flex min-w-0 items-center gap-1.5 overflow-hidden"><span className="max-w-[142px] truncate rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs text-blue-700" title={lead.tags![0]}>{lead.tags![0]}</span>{lead.tags!.length > 1 && <span className="shrink-0 text-xs text-slate-500" title={lead.tags!.slice(1).join(", ")}>+{lead.tags!.length - 1}</span>}</div> : "—";
      case "status": return lead.status ? <span className={`inline-flex max-w-full truncate rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusStyle(lead.status)}`}>{lead.status.replaceAll("_", " ")}</span> : "—";
      case "instagram": case "facebook": case "linkedin": case "x": case "tiktok": return lead.socials?.[column] ? `@${lead.socials[column]}` : "—";
      case "source": return lead.source || "—";
      case "location": return [lead.customFields?.city, lead.state ?? lead.customFields?.state].filter(Boolean).join(", ") || "—";
      case "lastActivity": return date(lead.lastActivityAt);
      case "created": return date(lead.createdAt);
    }
  };
  return <div>
    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-2.5"><span className="text-xs font-medium text-slate-500">{contacts.length.toLocaleString()} contacts on this page</span><Button variant="outline" size="sm" className="gap-2" onClick={() => setShowColumns((value) => !value)} aria-expanded={showColumns}><Columns3 className="size-4" /> Columns</Button></div>
    {showColumns && <div className="grid gap-2 border-b bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Contact columns">
      {defaultColumns.map((column) => <div key={column} className="flex items-center gap-1 text-xs">
        <Checkbox checked={columns.includes(column)} onCheckedChange={() => setLayout(columns.includes(column) ? columns.filter((value) => value !== column) : [...columns, column])} aria-label={`Show ${labels[column]}`} />
        <span className="flex-1">{labels[column]}</span>
        <button type="button" onClick={() => move(column,-1)} disabled={!columns.includes(column)} aria-label={`Move ${labels[column]} left`}>←</button>
        <button type="button" onClick={() => move(column,1)} disabled={!columns.includes(column)} aria-label={`Move ${labels[column]} right`}>→</button>
      </div>)}
    </div>}
    <div className="overflow-x-auto"><table className="workspace-table contact-grid w-max min-w-full table-fixed text-sm"><thead><tr>
      {canEdit && <th scope="col" className="w-12 min-w-12 text-center"><span className="sr-only">Select</span></th>}{columns.map((column) => <th scope="col" key={column} className={widths[column]}>{labels[column]}</th>)}{onDelete && <th scope="col" className="w-16 min-w-16 text-right"><span className="sr-only">Actions</span></th>}
    </tr></thead><tbody>
      {contacts.map((lead) => <ContactErrorBoundary key={lead.id} fallback={<tr><td colSpan={columns.length + (canEdit ? 1 : 0) + (onDelete ? 1 : 0)} className="p-3">Could not display this contact.</td></tr>}><tr className="group">
        {canEdit && <td className="text-center"><Checkbox checked={selected.has(lead.id)} onCheckedChange={() => onSelect(lead.id)} aria-label={`Select ${getDisplayName(lead)}`} /></td>}
        {columns.map((column) => <td key={column} className={widths[column]}><div className="truncate">{cell(lead,column)}</div></td>)}
        {onDelete && <td className="text-right"><Button variant="ghost" size="icon" className="size-8 text-slate-400 hover:text-rose-600" onClick={() => onDelete(lead.id)} aria-label={`Delete ${getDisplayName(lead)}`}><Trash2 className="size-4" /></Button></td>}
      </tr></ContactErrorBoundary>)}
      {!contacts.length && <tr><td colSpan={columns.length + (canEdit ? 1 : 0) + (onDelete ? 1 : 0)} className="p-8 text-center text-muted-foreground">No contacts match these filters.</td></tr>}
    </tbody></table></div>
  </div>;
}
