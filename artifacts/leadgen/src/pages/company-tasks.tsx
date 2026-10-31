import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TaskEditor } from "@/components/company-work";
import { crmSelect } from "@/components/company-editor";
import { CrmHeader, CrmError, CompanyLink } from "@/components/company-crm";
import { useCompanies, label, type CompanyTask } from "@/lib/company-crm";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {Link} from 'wouter';
type UnifiedTask=CompanyTask&{source?:'company'|'contact';lead_id?:string|null};
export default function CompanyTaskPage() {
  const companies = useCompanies();
  const qc = useQueryClient();
  const { role } = useAuth();
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<UnifiedTask | null | undefined>(
    undefined,
  );
  const [companyId, setCompanyId] = useState("");
  const query = useQuery<UnifiedTask[]>({
    queryKey: ["company-crm", "tasks", "all"],
    queryFn: () => apiFetch("/api/company-crm/tasks"),
  });
  const toggle = useMutation({
    mutationFn: (task: UnifiedTask) =>
      apiFetch(`/api/company-crm/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: task.status === "completed" ? "pending" : "completed",
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["company-crm", "tasks"] });
    },
  });
  const rows = (query.data ?? []).filter(
    (task) =>
      (filter === "all" ||
        (filter === "open" && task.status !== "completed") ||
        (filter === "completed" && task.status === "completed") ||
        (filter === "overdue" &&
          task.status !== "completed" &&
          task.due_at &&
          new Date(task.due_at) < new Date())) &&
      `${task.title} ${task.assignee} ${companies.data?.find((company) => company.id === task.company_id)?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="page-stack">
      <CrmHeader
        title="Tasks & follow-ups"
        description="Callbacks, meetings, and the next action for every company."
        action={
          role !== "viewer" && (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setCompanyId("");
              }}
            >
              <Plus className="h-4 w-4" />
              Add task
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search tasks"
          placeholder="Search task, company, assignee…"
          className="h-9 max-w-sm text-xs"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {["open", "overdue", "completed", "all"].map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-md px-3 py-2 text-xs ${filter === value ? "bg-blue-50 text-primary" : "text-slate-500"}`}
          >
            {label(value)}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">
          {rows.length} tasks
        </span>
      </div>
      {query.isPending ? (
        <p role="status">Loading tasks…</p>
      ) : query.error ? (
        <CrmError error={query.error} retry={() => void query.refetch()} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="workspace-table w-full min-w-[680px] text-left text-xs">
            <thead className="border-b bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                {[
                  "",
                  "Task",
                  "Company",
                  "Due",
                  "Priority",
                  "Assignee",
                  "Status",
                ].map((title, index) => (
                  <th key={index} className="px-4 py-3 font-medium">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50">
                  <td className="px-4 py-4">
                    <button
                      disabled={role === "viewer" || toggle.isPending}
                      aria-label={`${task.status === "completed" ? "Reopen" : "Complete"} task ${task.title}`}
                      onClick={() => toggle.mutate(task)}
                      className={`flex h-5 w-5 items-center justify-center rounded border ${task.status === "completed" ? "bg-primary text-white" : "bg-white"}`}
                    >
                      {task.status === "completed" && (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    {task.source==='contact'&&task.lead_id?<Link href={`/leads/${task.lead_id}`} className="text-left text-[13px] font-medium hover:text-primary">{task.title}</Link>:<button
                      className="text-left text-[13px] font-medium hover:text-primary"
                      onClick={() => {
                        setCompanyId(task.company_id||'');
                        setEditing(task);
                      }}
                      disabled={role === "viewer"}
                    >
                      {task.title}
                    </button>}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {label(task.kind)}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    {task.company_id?<CompanyLink id={task.company_id}>
                      {companies.data?.find(
                        (company) => company.id === task.company_id,
                      )?.name ?? "Open company"}
                    </CompanyLink>:task.lead_id?<Link href={`/leads/${task.lead_id}`} className="text-primary">Open contact</Link>:'Unlinked'}
                  </td>
                  <td
                    className={`px-4 py-4 ${task.due_at && new Date(task.due_at) < new Date() && task.status !== "completed" ? "text-amber-700" : ""}`}
                  >
                    {task.due_at
                      ? new Date(task.due_at).toLocaleString()
                      : "No due date"}
                  </td>
                  <td className="px-4 py-4">{label(task.priority)}</td>
                  <td className="px-4 py-4">{task.assignee || "Unassigned"}</td>
                  <td className="px-4 py-4">{label(task.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="py-16 text-center text-sm text-slate-400">
              No tasks in this view.
            </p>
          )}
        </div>
      )}
      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit task" : "Add task"}</DialogTitle>
            <DialogDescription>
              Choose a company and add a clear next step.
            </DialogDescription>
          </DialogHeader>
          {!editing && (
            <label className="space-y-2 text-xs">
              Company
              <select
                aria-label="Task company"
                className={crmSelect}
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
              >
                <option value="">Select a company</option>
                {companies.data?.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {editing !== undefined && companyId && (
            <TaskEditor
              key={companyId}
              companyId={companyId}
              task={editing ?? undefined}
              onSaved={() => setEditing(undefined)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
