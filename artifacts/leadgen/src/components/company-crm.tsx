import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { label, stageColors } from "@/lib/company-crm";
export function CrmHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <header className="pb-2 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
              Relationship management
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          </div>
          {action}
        </div>
      </header>
    </div>
  );
}
export function StageBadge({ stage }: { stage: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium"
      style={{ color: stageColors[stage] }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: stageColors[stage] }}
      />
      {label(stage)}
    </span>
  );
}
export function CrmError({
  error,
  retry,
}: {
  error: Error;
  retry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"
    >
      <p>{error.message}</p>
      <button
        type="button"
        onClick={retry}
        className="mt-2 font-semibold underline"
      >
        Retry
      </button>
    </div>
  );
}
export function CompanyLink({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={`/companies/${id}`}
      className="inline-flex items-center gap-2 font-semibold hover:text-primary hover:underline"
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
    </Link>
  );
}
