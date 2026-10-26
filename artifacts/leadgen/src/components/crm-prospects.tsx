import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Lead = { id: string; company?: string; firstName?: string; lastName?: string;
  email?: string; phone?: string; status?: string; source?: string; state?: string;
  city?: string; category?: string; dnc?: boolean; suppressedReason?: string | null;
  tags?: string[] };
type Result = { prospects: Lead[]; total: number; limit: number; offset: number };

export function CrmProspects() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const result = useQuery<Result>({
    queryKey: ["crm-prospects", search, category, status, offset],
    queryFn: () => apiFetch(`/prospects/crm?${new URLSearchParams({ search, category, status, offset: String(offset) })}`),
  });
  const leads = result.data?.prospects || [];
  return <section className="workspace-panel p-4 space-y-4">
    <div>
      <h2 className="font-semibold">Prospects in your CRM</h2>
      <p className="text-sm text-muted-foreground">Search saved companies and contacts, then open a record to research, call, email, or move it through your pipeline.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Input aria-label="Search prospects" className="min-w-48 flex-1" placeholder="Name, company, email, or phone"
        value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} />
      <Input aria-label="Filter business category" className="w-44" placeholder="Business category"
        value={category} onChange={(event) => { setCategory(event.target.value); setOffset(0); }} />
      <Input aria-label="Filter lead status" className="w-36" placeholder="Status"
        value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }} />
    </div>
    {result.isLoading && <p className="text-sm text-muted-foreground">Loading CRM prospects...</p>}
    {result.error && <p role="alert" className="text-sm text-destructive">Could not load CRM prospects: {String(result.error)}</p>}
    {!result.isLoading && !result.error && <>
      <p className="text-xs text-muted-foreground">{result.data?.total || 0} CRM records match</p>
      <div className="divide-y max-h-[600px] overflow-y-auto">
        {leads.map((lead) => <div key={lead.id} className="flex items-center gap-3 py-3 text-sm">
          <div className="flex-1 min-w-0">
            <Link href={`/leads/${lead.id}`} className="font-semibold hover:underline">{lead.company || [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unnamed lead"}</Link>
            <div className="text-xs text-muted-foreground truncate">{[lead.category, lead.city, lead.state].filter(Boolean).join(" · ")}</div>
            <div className="text-xs text-muted-foreground truncate">{[lead.phone, lead.email].filter(Boolean).join(" · ")}</div>
          </div>
          <div className="text-xs text-right shrink-0">
            <div>{lead.status || "New"}</div>
            <div className="text-muted-foreground">{lead.source || "CRM"}</div>
            {(lead.dnc || lead.suppressedReason) && <div className="text-destructive">Do not contact</div>}
          </div>
          <Link href={`/leads/${lead.id}`} className="text-primary text-xs underline shrink-0">Open</Link>
        </div>)}
      </div>
      {leads.length === 0 && <p className="text-sm text-muted-foreground">No matching CRM prospects. Change the filters or search for new businesses above.</p>}
      <div className="flex justify-between">
        <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>Previous</Button>
        <Button variant="outline" size="sm" disabled={offset + 100 >= (result.data?.total || 0)} onClick={() => setOffset(offset + 100)}>Next</Button>
      </div>
    </>}
  </section>;
}
