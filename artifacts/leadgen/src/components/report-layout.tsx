import type { ReactNode } from "react";
import { PageDescription, PageTitle } from "@/components/page-layout";

export function ReportHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
    <div className="min-w-0"><PageTitle>{title}</PageTitle><PageDescription>{description}</PageDescription></div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>;
}

export function ReportMetrics({ children }: { children: ReactNode }) {
  return <section aria-label="Report summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</section>;
}

export function ReportMetric({ label, value, detail, icon }: { label: string; value: ReactNode; detail?: ReactNode; icon?: ReactNode }) {
  return <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3"><p className="text-xs font-medium text-slate-500">{label}</p>{icon && <span className="text-blue-600">{icon}</span>}</div>
    <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    {detail && <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>}
  </article>;
}

export function ReportPanel({ title, description, children, className = "" }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
    <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}</div>
    <div className="p-5">{children}</div>
  </section>;
}
