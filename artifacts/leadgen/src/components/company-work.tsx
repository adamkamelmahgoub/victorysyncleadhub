import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Check, FileText, Plus, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { label, type CompanyTask, type CompanyFile } from "@/lib/company-crm";
import { CrmError } from "./company-crm";
import { crmSelect, toLocalDateTime } from "./company-editor";

export function TaskEditor({
  companyId,
  task,
  onSaved,
}: {
  companyId: string;
  task?: CompanyTask;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch(
        `/api/companies/${companyId}/tasks${task ? `/${task.id}` : ""}`,
        { method: task ? "PATCH" : "POST", body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["company-crm", "tasks"] });
      onSaved();
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        mutation.mutate({
          ...data,
          due_at: data.due_at
            ? new Date(String(data.due_at)).toISOString()
            : null,
        });
      }}
    >
      <fieldset disabled={mutation.isPending} className="space-y-4">
        <label className="block space-y-1.5 text-xs font-medium">
          Task title
          <Input
            name="title"
            aria-label="Task title"
            required
            maxLength={500}
            defaultValue={task?.title ?? ""}
            placeholder="Call the owner about the trial"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1.5 text-xs">
            Type
            <select
              name="kind"
              aria-label="Task type"
              className={crmSelect}
              defaultValue={task?.kind ?? "task"}
            >
              {["task", "callback", "email", "meeting", "close_call"].map(
                (kind) => (
                  <option key={kind} value={kind}>
                    {label(kind)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="space-y-1.5 text-xs">
            Priority
            <select
              name="priority"
              aria-label="Task priority"
              className={crmSelect}
              defaultValue={task?.priority ?? "normal"}
            >
              {["low", "normal", "high"].map((priority) => (
                <option key={priority} value={priority}>
                  {label(priority)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-1.5 text-xs">
          Due (local time)
          <Input
            name="due_at"
            aria-label="Task due time"
            type="datetime-local"
            defaultValue={toLocalDateTime(task?.due_at)}
          />
        </label>
        <label className="block space-y-1.5 text-xs">
          Assignee
          <Input
            name="assignee"
            aria-label="Task assignee"
            maxLength={500}
            defaultValue={task?.assignee ?? ""}
            placeholder="Name of the person responsible"
          />
        </label>
        <label className="block space-y-1.5 text-xs">
          Status
          <select
            name="status"
            aria-label="Task status"
            className={crmSelect}
            defaultValue={task?.status ?? "pending"}
          >
            {["pending", "in_progress", "completed"].map((status) => (
              <option key={status} value={status}>
                {label(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5 text-xs">
          Notes
          <Textarea
            name="notes"
            aria-label="Task notes"
            defaultValue={task?.notes ?? ""}
            maxLength={10000}
            rows={3}
          />
        </label>
        {mutation.error && (
          <p role="alert" className="text-sm text-red-700">
            {mutation.error.message}
          </p>
        )}
        <Button type="submit">
          {mutation.isPending ? "Saving…" : task ? "Save task" : "Create task"}
        </Button>
      </fieldset>
    </form>
  );
}

export function CompanyTasks({
  companyId,
  readOnly = false,
}: {
  companyId: string;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState<CompanyTask | null | undefined>(
    undefined,
  );
  const qc = useQueryClient();
  const query = useInfiniteQuery<{
    items: CompanyTask[];
    nextOffset: number | null;
  }>({
    queryKey: ["company-crm", "tasks", companyId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiFetch(`/api/companies/${companyId}/tasks?offset=${pageParam}`),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
  });
  const toggle = useMutation({
    mutationFn: (task: CompanyTask) =>
      apiFetch(`/api/companies/${companyId}/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: task.status === "completed" ? "pending" : "completed",
        }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["company-crm", "tasks"] });
    },
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Tasks & reminders</h2>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
            <Plus className="h-3.5 w-3.5" />
            Add task
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Callbacks, meetings, close calls, and other next steps. Due reminders
        appear in the Tasks view; no email notification is sent.
      </p>
      {query.isPending ? (
        <p className="text-sm" role="status">
          Loading tasks…
        </p>
      ) : query.error ? (
        <CrmError error={query.error} retry={() => void query.refetch()} />
      ) : !rows.length ? (
        <p className="border-y py-8 text-center text-sm text-muted-foreground">
          No tasks yet.
        </p>
      ) : (
        <ul className="divide-y">
          {rows.map((task) => (
            <li key={task.id} className="flex items-start gap-3 py-3">
              <button
                type="button"
                disabled={readOnly || toggle.isPending}
                aria-label={`${task.status === "completed" ? "Reopen" : "Complete"} task ${task.title}`}
                onClick={() => toggle.mutate(task)}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${task.status === "completed" ? "border-primary bg-primary text-white" : "bg-white"}`}
              >
                {task.status === "completed" && (
                  <Check className="h-3.5 w-3.5" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setEditing(task)}
                  disabled={readOnly}
                  className={`text-left text-sm font-medium hover:text-primary ${task.status === "completed" ? "text-muted-foreground line-through" : ""}`}
                >
                  {task.title}
                </button>
                <p className="mt-1 text-xs text-muted-foreground">
                  {label(task.kind)} · {label(task.priority)} priority
                  {task.assignee ? ` · ${task.assignee}` : ""}
                </p>
                {task.due_at && (
                  <p
                    className={`mt-1 text-xs ${new Date(task.due_at) < new Date() && task.status !== "completed" ? "text-amber-800" : "text-muted-foreground"}`}
                  >
                    {new Date(task.due_at).toLocaleString()}
                  </p>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground">
                {label(task.status)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more tasks
        </Button>
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
              Keep a clear owner, due time, and next step.
            </DialogDescription>
          </DialogHeader>
          {editing !== undefined && (
            <TaskEditor
              companyId={companyId}
              task={editing ?? undefined}
              onSaved={() => setEditing(undefined)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function CompanyFiles({
  companyId,
  readOnly = false,
}: {
  companyId: string;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const query = useInfiniteQuery<{
    items: CompanyFile[];
    nextOffset: number | null;
  }>({
    queryKey: ["company-crm", "files", companyId],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiFetch(`/api/companies/${companyId}/files?offset=${pageParam}`),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
  });
  async function upload(file: File) {
    setError("");
    if (file.size < 1 || file.size > 10485760) {
      setError("Choose a file up to 10 MB.");
      return;
    }
    setUploading(true);
    const path = `${companyId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150)}`;
    let stored = false;
    try {
      const result = await supabase.storage
        .from("company-files")
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (result.error) throw result.error;
      stored = true;
      await apiFetch(`/api/companies/${companyId}/files`, {
        method: "POST",
        body: JSON.stringify({
          file_name: file.name,
          storage_path: path,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
        }),
      });
      await qc.invalidateQueries({
        queryKey: ["company-crm", "files", companyId],
      });
    } catch (err) {
      if (stored) await supabase.storage.from("company-files").remove([path]);
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }
  async function download(file: CompanyFile) {
    setError("");
    const result = await supabase.storage
      .from("company-files")
      .createSignedUrl(file.storage_path, 60, { download: file.file_name });
    if (result.error) {
      setError(result.error.message);
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = result.data.signedUrl;
    anchor.rel = "noopener";
    anchor.click();
  }
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Files & attachments</h2>
        {!readOnly && (
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-xs font-medium ${uploading ? "opacity-50" : ""}`}
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading ? "Uploading…" : "Upload file"}
            <input
              className="sr-only"
              aria-label="Upload company attachment"
              type="file"
              disabled={uploading}
              accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
                event.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Private PDFs, images, documents, and spreadsheets. Up to 10 MB per file.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {query.isPending ? (
        <p role="status" className="text-sm">
          Loading files…
        </p>
      ) : query.error ? (
        <CrmError error={query.error} retry={() => void query.refetch()} />
      ) : !rows.length ? (
        <p className="border-y py-8 text-center text-sm text-muted-foreground">
          No attachments yet.
        </p>
      ) : (
        <ul className="divide-y">
          {rows.map((file) => (
            <li key={file.id} className="flex items-center gap-3 py-3">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <button
                onClick={() => void download(file)}
                className="min-w-0 truncate text-left text-sm text-primary hover:underline"
              >
                {file.file_name}
              </button>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {Math.ceil(file.size_bytes / 1024)} KB
              </span>
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          Load more files
        </Button>
      )}
    </section>
  );
}
