import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { BarChart3, ExternalLink, FileText, LayoutTemplate } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { asArray } from "@/lib/data-shape";

type PageReport = { id: string; name: string; slug: string; status: string; views: number; submissions: number; conversionRate: number };
type FormReport = { id: string; name: string; status: string; submissions: number };
type Report = { pages: PageReport[]; forms: FormReport[] };
const reportKey = ["marketing-reports"];
const number = (value: number) => Number(value || 0).toLocaleString();

export default function MarketingReports() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState("30d");
  const { data, isLoading, error } = useQuery<Report>({ queryKey: [...reportKey, period], queryFn: () => apiFetch(`/api/marketing/reports?period=${period}`) });
  const pages = asArray<PageReport>(data?.pages);
  const forms = asArray<FormReport>(data?.forms);
  const views = pages.reduce((sum, page) => sum + Number(page.views || 0), 0);
  const submissions = forms.reduce((sum, form) => sum + Number(form.submissions || 0), 0);
  return <div className="page-stack space-y-6">
    <div className="flex justify-between items-start gap-4"><div><h1 className="text-2xl font-semibold">Marketing reports</h1><p className="text-sm text-muted-foreground">Page traffic, form submissions, and page conversion.</p></div><div className="flex gap-2"><select aria-label="Reporting period" className="rounded-md border bg-background px-3 text-sm" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All time</option></select><Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: reportKey })}>Refresh</Button></div></div>
    {error ? <Card className="p-6" role="alert"><p className="font-medium text-destructive">Reports could not be loaded</p><p className="text-sm mt-2">{String(error)}</p><Button variant="outline" className="mt-4" onClick={() => queryClient.invalidateQueries({ queryKey: reportKey })}>Try again</Button></Card> : isLoading ? <p>Loading reports…</p> : <>
      <div className="grid gap-4 sm:grid-cols-3"><Card className="p-5"><LayoutTemplate className="w-5 h-5 text-primary" /><p className="text-3xl font-semibold mt-3">{number(pages.length)}</p><p className="text-sm text-muted-foreground">Landing pages</p></Card><Card className="p-5"><BarChart3 className="w-5 h-5 text-primary" /><p className="text-3xl font-semibold mt-3">{number(views)}</p><p className="text-sm text-muted-foreground">Page views</p></Card><Card className="p-5"><FileText className="w-5 h-5 text-primary" /><p className="text-3xl font-semibold mt-3">{number(submissions)}</p><p className="text-sm text-muted-foreground">Form submissions</p></Card></div>
      <Card className="overflow-x-auto"><div className="p-5 border-b flex items-center justify-between"><h2 className="font-semibold">Landing pages</h2><Link href="/landing-pages"><Button variant="outline" size="sm">Manage pages</Button></Link></div>{pages.length ? <table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="px-5 py-3">Page</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Views</th><th className="px-5 py-3 text-right">Submissions</th><th className="px-5 py-3 text-right">Conversion</th></tr></thead><tbody>{pages.map((page) => <tr key={page.id} className="border-t"><td className="px-5 py-3"><Link href={`/landing-pages/${page.id}`} className="font-medium hover:underline">{page.name}</Link><div className="text-xs text-muted-foreground">/{page.slug}</div></td><td className="px-5 py-3 capitalize">{page.status}</td><td className="px-5 py-3 text-right">{number(page.views)}</td><td className="px-5 py-3 text-right">{number(page.submissions)}</td><td className="px-5 py-3 text-right">{page.conversionRate.toFixed(1)}%</td></tr>)}</tbody></table> : <p className="p-6 text-sm text-muted-foreground">No landing pages yet.</p>}</Card>
      <Card className="overflow-x-auto"><div className="p-5 border-b flex items-center justify-between"><h2 className="font-semibold">Forms</h2><Link href="/forms"><Button variant="outline" size="sm">Manage forms</Button></Link></div>{forms.length ? <table className="w-full text-sm"><thead className="bg-muted/50 text-left"><tr><th className="px-5 py-3">Form</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Submissions</th></tr></thead><tbody>{forms.map((form) => <tr key={form.id} className="border-t"><td className="px-5 py-3"><Link href={`/forms/${form.id}`} className="font-medium hover:underline">{form.name} <ExternalLink className="inline w-3 h-3" /></Link></td><td className="px-5 py-3 capitalize">{form.status}</td><td className="px-5 py-3 text-right">{number(form.submissions)}</td></tr>)}</tbody></table> : <p className="p-6 text-sm text-muted-foreground">No forms yet.</p>}</Card>
      <p className="text-xs text-muted-foreground">Counts cover the selected period. Page conversion is form submissions attributed to that page divided by page views.</p>
    </>}
  </div>;
}
