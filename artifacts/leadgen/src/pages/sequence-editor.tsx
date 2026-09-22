import { workspaceInput, workspaceButton } from "@/components/page-layout";
import { PageTitle, PageDescription } from "@/components/page-layout";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Step = { id: string | number; step_number: number; channel: string; delay_days: number; subject: string; body: string };
type Enrollment = { id: string | number; email: string; company: string; mailbox: string; status: string; current_step: number; next_send_at: string | null; pause_reason: string | null; stopped_reason: string | null; manual_email_outcome?: string | null };
type Sequence = { id: string | number; name: string; label?: string | null; status: string; steps: Step[]; enrollments: Enrollment[] };
type Contact = { id: string | number; email: string; company: string; disposition?: string | null };
type ContactList = { leads?: Contact[]; total?: number };
type CompanyRecipient = { id: string; name: string; email?: string; contacts?: Array<{ email?: string }> };

const input = workspaceInput;
const button = workspaceButton;
const variables = ["firstName", "company", "city", "avg_job_value", "missed_calls_per_week", "after_hours_coverage", "uses_answering_service"];
const emailOutcomes = [["no_reply", "No reply"], ["positive_reply", "Positive reply"], ["reply", "Other reply"], ["not_interested", "Not interested"], ["hard_bounce", "Hard bounce"], ["unsubscribed", "Unsubscribed"]];
const terminalDispositions = new Set(["meeting_booked", "not_interested", "wrong_number", "dnc"]);

function StepForm({ step, locked, save, remove }: { step: Step; locked: boolean; save: (step: Step) => Promise<unknown>; remove: () => Promise<unknown> }) {
  const [draft, setDraft] = useState(step);
  const [busy, setBusy] = useState(false);
  return <form className="workspace-panel p-4 space-y-3" onSubmit={async event => { event.preventDefault(); setBusy(true); try { await save(draft); } finally { setBusy(false); } }}>
    <div className="grid gap-3 md:grid-cols-3"><label className="text-xs">Step number<input className={input} type="number" min="1" disabled={locked} value={draft.step_number} onChange={event => setDraft({ ...draft, step_number: Number(event.target.value) })} /></label><label className="text-xs">Step type<select className={input} disabled={locked} value={draft.channel} onChange={event => setDraft({ ...draft, channel: event.target.value })}><option value="email">Automated email</option><option value="manual_email">Manual email task</option><option value="call_task">Phone call task</option><option value="linkedin_task">LinkedIn task</option><option value="action_item">General action item</option></select></label><label className="text-xs">Days after previous step<input className={input} type="number" min="0" max="365" disabled={locked} value={draft.delay_days} onChange={event => setDraft({ ...draft, delay_days: Number(event.target.value) })} /></label></div>
    {draft.channel === "email" && <input aria-label="Subject template" className={input} required disabled={locked} value={draft.subject} onChange={event => setDraft({ ...draft, subject: event.target.value })} />}
    <textarea aria-label={draft.channel === "email" ? "Body template" : "Call instructions"} className={`${input} min-h-32`} required disabled={locked} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} />
    {!locked && <div className="flex gap-2"><button className={button} disabled={busy}>Save step</button><button type="button" className={button} disabled={busy} onClick={remove}>Delete step</button></div>}
  </form>;
}

export default function SequenceEditor() {
  const [, route] = useRoute("/sequences/:id");
  const [, prefixed] = useRoute("/leadgen/sequences/:id");
  const id = route?.id ?? prefixed?.id;
  const cache = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadedContactQuery, setLoadedContactQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyRecipient[]>([]);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const { data: sequence, error } = useQuery<Sequence>({ queryKey: ["sequence", id], enabled: !!id, queryFn: () => apiFetch(`/sequences/${id}`), refetchInterval: 30000 });
  const mutation = useMutation({ mutationFn: ({ path, method = "POST", body = {} }: { path: string; method?: string; body?: unknown }) => apiFetch(path, { method, body: JSON.stringify(body) }), onSuccess: () => { cache.invalidateQueries({ queryKey: ["sequence", id] }); cache.invalidateQueries({ queryKey: ["sequences"] }); } });

  useEffect(() => {
    void loadContacts("");
    void loadCompanies();
  }, []);

  async function loadContacts(query: string, selectAll = false) {
    setLoadingContacts(true);
    setContactsError(null);
    try {
      const pageSize = 1000;
      let page = 1;
      let fetched = 0;
      let total = Number.POSITIVE_INFINITY;
      const loaded: Contact[] = [];
      while (fetched < total) {
        const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
        if (query.trim()) params.set("search", query.trim());
        const result = await apiFetch(`/leads?${params}`) as ContactList;
        const pageContacts = Array.isArray(result.leads) ? result.leads : [];
        loaded.push(...pageContacts);
        fetched += pageContacts.length;
        total = typeof result.total === "number" ? result.total : fetched;
        if (pageContacts.length < pageSize) break;
        page += 1;
      }
      const available = Array.from(new Map(loaded.filter(contact => contact.email && (!contact.disposition || !terminalDispositions.has(contact.disposition))).map(contact => [String(contact.id), contact])).values());
      setContacts(available);
      setLoadedContactQuery(query.trim());
      setSelected(selectAll ? new Set(available.map(contact => String(contact.id))) : new Set());
      if (selectAll) {
        toast(available.length
          ? { title: `${available.length} contact${available.length === 1 ? "" : "s"} selected` }
          : { title: "No contacts with email addresses found" });
      }
    } catch (loadError) {
      setContacts([]);
      setSelected(new Set());
      setContactsError(loadError instanceof Error ? loadError.message : "Contacts could not be loaded");
    } finally {
      setLoadingContacts(false);
      setContactsLoaded(true);
    }
  }

  async function loadCompanies(selectAll = false) {
    setLoadingCompanies(true);
    setCompaniesError(null);
    try {
      const result = await apiFetch("/api/companies") as CompanyRecipient[];
      const available = result.filter(company => company.email || company.contacts?.some(contact => contact.email));
      setCompanies(available);
      setSelectedCompanies(selectAll ? new Set(available.map(company => company.id)) : new Set());
      if (selectAll) toast(available.length
        ? { title: `${available.length} compan${available.length === 1 ? "y" : "ies"} selected` }
        : { title: "No companies with email recipients found" });
    } catch (loadError) {
      setCompanies([]);
      setSelectedCompanies(new Set());
      setCompaniesError(loadError instanceof Error ? loadError.message : "Companies could not be loaded");
    } finally {
      setLoadingCompanies(false);
    }
  }

  async function enrollSelected() {
    if (!selected.size && !selectedCompanies.size) return;
    setEnrolling(true);
    let enrolled = 0;
    try {
      const leadIds = Array.from(selected);
      for (let start = 0; start < leadIds.length; start += 10) {
        const result = await mutation.mutateAsync({ path: `/sequences/${id}/enroll`, body: { leadIds: leadIds.slice(start, start + 10) } }) as { enrolled?: number };
        enrolled += result.enrolled ?? 0;
      }
      const companyIds = Array.from(selectedCompanies);
      for (let start = 0; start < companyIds.length; start += 10) {
        const result = await mutation.mutateAsync({ path: `/sequences/${id}/enroll-companies`, body: { companyIds: companyIds.slice(start, start + 10) } }) as { enrolled?: number };
        enrolled += result.enrolled ?? 0;
      }
      setSelected(new Set());
      setSelectedCompanies(new Set());
      toast({ title: `${enrolled} contact${enrolled === 1 ? "" : "s"} enrolled` });
    } catch (enrollError) {
      toast({ title: enrolled ? `${enrolled} contacts enrolled before the error` : "Contacts could not be enrolled", description: enrollError instanceof Error ? enrollError.message : undefined, variant: "destructive" });
    } finally {
      setEnrolling(false);
    }
  }

  if (error) return <main className="p-6" role="alert">{error.message}</main>;
  if (!sequence) return <main className="p-6">Loading sequence...</main>;
  const locked = sequence.enrollments.length > 0;
  const allVisibleSelected = contacts.length > 0 && contacts.every(contact => selected.has(String(contact.id)));
  const allCompaniesSelected = companies.length > 0 && companies.every(company => selectedCompanies.has(company.id));

  return <div className="page-stack"><Link className="text-sm underline" href="/sequences">Back to sequences</Link>
    <header className="flex justify-between gap-4 flex-wrap min-w-0"><div><PageTitle>{sequence.name}</PageTitle><PageDescription>{sequence.status} · {sequence.enrollments.length} enrollments{sequence.label ? ` · ${sequence.label}` : ""}</PageDescription></div><button className={button} disabled={mutation.isPending} onClick={() => mutation.mutate({ path: `/sequences/${id}`, method: "PUT", body: { status: sequence.status === "active" ? "paused" : "active" } })}>{sequence.status === "active" ? "Pause sequence" : "Activate sequence"}</button></header>
    <form className="flex gap-2 workspace-panel p-3" onSubmit={async event => { event.preventDefault(); const form = new FormData(event.currentTarget); await mutation.mutateAsync({ path: `/sequences/${id}`, method: "PUT", body: { label: String(form.get("label") ?? "") } }); toast({ title: "Sequence label saved" }); }}><input name="label" className={input} defaultValue={sequence.label ?? ""} placeholder="Label this sequence, for example Roofing prospects" /><button className={button}>Save label</button></form>
    <p className="text-sm text-muted-foreground">Each email creates a call task two days later. Replies from the contact's domain stop the cadence; out-of-office replies pause it. Call outcomes take priority.</p>
    <p className="text-xs text-muted-foreground">Variables: {variables.map(variable => `{{${variable}}}`).join(", ")}. Missing discovery values render blank.</p>
    {locked && <p className="text-sm">Steps are locked after enrollment. Create a new sequence to change the cadence.</p>}
    {sequence.steps.map(step => <StepForm key={`${step.id}:${step.step_number}`} step={step} locked={locked} save={draft => mutation.mutateAsync({ path: `/sequences/${id}/steps/${step.id}`, method: "PUT", body: { stepNumber: draft.step_number, channel: draft.channel, delayDays: draft.delay_days, subject: draft.subject, body: draft.body } })} remove={() => mutation.mutateAsync({ path: `/sequences/${id}/steps/${step.id}`, method: "DELETE" })} />)}
    {!locked && <button className={button} disabled={mutation.isPending} onClick={() => mutation.mutate({ path: `/sequences/${id}/steps`, body: { stepNumber: sequence.steps.length + 1, channel: "email", delayDays: 3, subject: "Quick question for {{company}}", body: "Hi {{firstName}},\n\nHow does {{company}} handle missed calls?\n\nVictory Sync" } })}>Add sequence step</button>}
    <section className="workspace-panel p-4 space-y-3"><h2 className="font-semibold">Enroll contacts and companies</h2><p className="text-sm text-muted-foreground">Email verification is not required. Suppressed, unsubscribed, bounced, and terminal contacts remain excluded. Sender selection still uses active mailboxes with capacity.</p>
      <form className="flex gap-2 flex-wrap" onSubmit={event => { event.preventDefault(); void loadContacts(search); }}><input className={`${input} flex-1`} aria-label="Find contacts" placeholder="Search contacts" value={search} onChange={event => setSearch(event.target.value)} /><button className={button} disabled={loadingContacts}>{loadingContacts ? "Loading..." : "Find"}</button><button type="button" className={button} disabled={loadingContacts} onClick={() => { setSearch(""); if (allVisibleSelected && loadedContactQuery === "") setSelected(new Set()); else if (contactsLoaded && loadedContactQuery === "" && contacts.length) setSelected(new Set(contacts.map(contact => String(contact.id)))); else void loadContacts("", true); }}>{allVisibleSelected && loadedContactQuery === "" ? "Clear all contacts" : "Select all contacts"}</button><button type="button" className={button} disabled={loadingCompanies} onClick={() => allCompaniesSelected ? setSelectedCompanies(new Set()) : companies.length ? setSelectedCompanies(new Set(companies.map(company => company.id))) : void loadCompanies(true)}>{allCompaniesSelected ? "Clear all companies" : "Select all companies"}</button></form>
      {contactsError && <p className="text-sm text-destructive" role="alert">{contactsError}</p>}
      {companiesError && <p className="text-sm text-destructive" role="alert">{companiesError}</p>}
      {!loadingContacts && contactsLoaded && !contactsError && contacts.length === 0 && <p className="text-sm text-muted-foreground" role="status">No contacts with email addresses found.</p>}
      {contacts.length > 0 && <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{selected.size} of {contacts.length} selected</span><button type="button" className={button} onClick={() => setSelected(allVisibleSelected ? new Set() : new Set(contacts.map(contact => String(contact.id))))}>{allVisibleSelected ? "Clear all" : "Select all results"}</button></div>}
      <div className="max-h-72 overflow-y-auto space-y-2">{contacts.map(contact => <label key={contact.id} className="flex gap-2 text-sm"><input type="checkbox" checked={selected.has(String(contact.id))} onChange={event => setSelected(current => { const next = new Set(current); event.target.checked ? next.add(String(contact.id)) : next.delete(String(contact.id)); return next; })} />{contact.email || "No email"} · {contact.company}</label>)}</div>
      {companies.length > 0 && <div className="space-y-2 border-t pt-3"><span className="text-sm text-muted-foreground">{selectedCompanies.size} of {companies.length} companies selected</span><div className="max-h-48 overflow-y-auto space-y-2">{companies.map(company => <label key={company.id} className="flex gap-2 text-sm"><input type="checkbox" checked={selectedCompanies.has(company.id)} onChange={event => setSelectedCompanies(current => { const next = new Set(current); event.target.checked ? next.add(company.id) : next.delete(company.id); return next; })} />{company.name}</label>)}</div></div>}
      <button type="button" className={button} disabled={(!selected.size && !selectedCompanies.size) || mutation.isPending || enrolling || sequence.status !== "active"} onClick={() => void enrollSelected()}>{enrolling ? "Enrolling..." : `Enroll ${selected.size} contact${selected.size === 1 ? "" : "s"} and ${selectedCompanies.size} compan${selectedCompanies.size === 1 ? "y" : "ies"}`}</button>
    </section>
    <section className="overflow-auto workspace-panel p-4"><h2 className="font-semibold mb-3">Enrollment queue</h2><table className="workspace-table w-full text-sm text-left"><thead><tr><th>Contact</th><th>Sender</th><th>State</th><th>Step</th><th>Next action</th><th>Email outcome</th><th /></tr></thead><tbody>{sequence.enrollments.map(enrollment => <tr key={enrollment.id} className="border-t"><td className="py-3">{enrollment.email}</td><td>{enrollment.mailbox}</td><td>{enrollment.status}<span className="block text-xs text-muted-foreground">{(enrollment.pause_reason ?? enrollment.stopped_reason ?? "").replaceAll("_", " ")}</span></td><td>{enrollment.current_step}</td><td>{enrollment.next_send_at ? new Date(enrollment.next_send_at).toLocaleString() : "—"}</td><td><select aria-label={`Email outcome for ${enrollment.email}`} className={input} value={enrollment.manual_email_outcome ?? ""} disabled={mutation.isPending} onChange={event => mutation.mutate({ path: `/sequences/enrollments/${enrollment.id}/outcome`, body: { outcome: event.target.value } })}><option value="" disabled>Record outcome</option>{emailOutcomes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td><td>{["active", "paused"].includes(enrollment.status) && <button className={button} disabled={mutation.isPending} onClick={() => mutation.mutate({ path: `/sequences/enrollments/${enrollment.id}/stop` })}>Stop</button>}</td></tr>)}</tbody></table></section>
  </div>;
}
