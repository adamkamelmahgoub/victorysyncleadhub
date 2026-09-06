import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  ChartNoAxesCombined,
} from "lucide-react";
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
  const [location] = useLocation();
  const normalized = location.replace(/^\/leadgen/, "");
  const path =
    normalized === "/" || normalized === "/dashboard"
      ? "/companies"
      : normalized;
  return (
    <div className="space-y-4">
      <header className="py-1">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
              Victory Sync CRM
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          </div>
          {action}
        </div>
      </header>
      <nav
        aria-label="Company CRM"
        className="flex gap-5 overflow-x-auto border-b"
      >
        {[
          { href: "/companies", label: "Companies", icon: Building2 },
          { href: "/trial-queue", label: "Trial queue", icon: CalendarClock },
          {
            href: "/company-kpis",
            label: "Daily performance",
            icon: ChartNoAxesCombined,
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-sm font-medium ${path.startsWith(item.href) ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            aria-current={path.startsWith(item.href) ? "page" : undefined}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
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
