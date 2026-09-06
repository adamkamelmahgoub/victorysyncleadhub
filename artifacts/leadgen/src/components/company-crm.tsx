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
  const path = location.replace(/^\/leadgen/, "");
  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-2xl bg-[#101c30] p-6 text-white sm:p-8">
        <div
          className="absolute -right-12 -top-16 h-60 w-60 rounded-full border-[36px] border-[#ff3c00]/10"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#ff987a]">
              Victory Sync / Company CRM
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              {description}
            </p>
          </div>
          {action}
        </div>
      </header>
      <nav aria-label="Company CRM" className="flex flex-wrap gap-2">
        {[
          { href: "/companies", label: "Company pipeline", icon: Building2 },
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
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${path.startsWith(item.href) ? "bg-primary text-white" : "border bg-white hover:bg-muted"}`}
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
