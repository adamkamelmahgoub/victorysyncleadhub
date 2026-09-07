import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { apiFetch } from "@/lib/api";
import { CrmError } from "./company-crm";

type RecordName = { id: string; name: string };
export function DeleteCompanies({
  companies,
  onDeleted,
  bulk = false,
}: {
  companies: RecordName[];
  onDeleted?: () => void;
  bulk?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/companies", {
        method: "DELETE",
        body: JSON.stringify({ ids: companies.map((company) => company.id) }),
      }),
    onSuccess: () => {
      setOpen(false);
      onDeleted?.();
      void qc.invalidateQueries();
    },
  });
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="text-red-700"
        disabled={!companies.length || companies.length > 100}
        onClick={() => {
          mutation.reset();
          setOpen(true);
        }}
      >
        {bulk ? "Delete selected" : "Delete company"}
      </Button>
      {companies.length > 100 && (
        <span className="text-xs">Delete up to 100 at a time.</span>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!mutation.isPending) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Move{" "}
              {companies.length === 1
                ? companies[0]?.name
                : `${companies.length} companies`}{" "}
              to Trash?
            </DialogTitle>
            <DialogDescription>
              These records will leave the active pipeline, reports and trial
              queue. People, activity, tasks and files are retained and can be
              restored from Trash. Any booked trial capacity will be released.
            </DialogDescription>
          </DialogHeader>
          {companies.length > 1 && (
            <ul className="max-h-40 overflow-auto text-sm">
              {companies.map((company) => (
                <li key={company.id}>{company.name}</li>
              ))}
            </ul>
          )}
          {mutation.error && (
            <p role="alert" className="text-sm text-red-700">
              {mutation.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Moving…" : "Move to Trash"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CompanyTrash() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const query = useQuery<Array<RecordName & { deleted_at: string }>>({
    queryKey: ["company-crm", "trash"],
    queryFn: () => apiFetch("/api/company-crm/trash"),
    enabled: open,
  });
  const restore = useMutation({
    mutationFn: (id: string) =>
      apiFetch("/api/company-crm/trash/restore", {
        method: "POST",
        body: JSON.stringify({ ids: [id] }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          restore.reset();
          setOpen(true);
        }}
      >
        Trash
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Company Trash</DialogTitle>
            <DialogDescription>
              Restore a company and its people, activity, tasks and files.
              Restoring a booked or active trial also restores its schedule, so
              its original dates must be available.
            </DialogDescription>
          </DialogHeader>
          {query.error ? (
            <CrmError error={query.error} retry={() => void query.refetch()} />
          ) : query.isPending ? (
            <p role="status">Loading Trash…</p>
          ) : (
            <div className="max-h-96 overflow-auto">
              {!query.data?.length && (
                <p className="text-sm text-muted-foreground">Trash is empty.</p>
              )}
              {query.data?.map((company) => (
                <div
                  key={company.id}
                  className="flex items-center justify-between gap-3 border-b py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{company.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Deleted {new Date(company.deleted_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Restore ${company.name}`}
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(company.id)}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
          {restore.error && (
            <p role="alert" className="text-sm text-red-700">
              {restore.error.message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
