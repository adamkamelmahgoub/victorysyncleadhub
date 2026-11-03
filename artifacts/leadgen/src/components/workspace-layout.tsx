import { useEffect, useState, type ReactNode, type ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Phone,
  Building2,
  Users,
  GitBranch,
  CalendarClock,
  CheckSquare,
  Mail,
  Megaphone,
  Layers,
  Zap,
  Sparkles,
  FileText,
  BarChart3,
  Plug,
  Settings,
  Search,
  Menu,
  X,
  ChevronRight,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canAccessPath } from "@/lib/permissions";
import { apiFetch } from "@/lib/api";
import { asArray } from "@/lib/data-shape";
import { AccountSwitcher } from "@/components/account-switcher";
type Item = { href: string; label: string; icon: ElementType };
const pageModules = import.meta.glob("../pages/*.tsx");
function prefetchPage(href: string) {
  const path = href.startsWith("/contacts/segments/") ? "segments-v2" : href.slice(1);
  const name = path === "crm-tasks" ? "company-tasks" : path === "segments" ? "segments-v2" : path;
  void pageModules[`../pages/${name}.tsx`]?.();
}
const core: Item[] = [
  { href: "/client-portal", label: "Dashboard", icon: BarChart3 },
  { href: "/conversations", label: "Conversations", icon: Mail },
  { href: "/leads", label: "Contacts", icon: Users },
  { href: "/pipeline", label: "Opportunities", icon: GitBranch },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/crm-tasks", label: "Tasks", icon: CheckSquare },
  { href: "/meeting-scheduler", label: "Calendars", icon: CalendarClock },
];
const clientCore: Item[] = [
  { href: "/client-portal/launchpad", label: "Launchpad", icon: Rocket },
  { href: "/client-portal/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/client-portal/leads", label: "Leads", icon: Users },
  { href: "/client-portal/calls", label: "Calls", icon: Phone },
  { href: "/client-portal/pages", label: "Pages", icon: FileText },
  { href: "/client-portal/forms", label: "Forms", icon: FileText },
  { href: "/client-portal/reviews", label: "Reviews", icon: Megaphone },
  { href: "/client-portal/reports", label: "Reports", icon: BarChart3 },
  { href: "/client-portal/billing", label: "Billing", icon: FileText },
  { href: "/client-portal/settings", label: "Settings", icon: Settings },
];
const groups: { label: string; links: Item[] }[] = [
  {
    label: "Marketing",
    links: [
      { href: "/landing-pages", label: "Landing pages", icon: FileText },
      { href: "/forms", label: "Forms", icon: FileText },
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/dm-campaigns", label: "DM campaigns", icon: Layers },
      { href: "/social-planner", label: "Social workspace", icon: Megaphone },
      { href: "/social-review", label: "Review socials", icon: Megaphone },
      { href: "/email-templates", label: "Email templates", icon: FileText },
      { href: "/email-accounts", label: "Mailboxes", icon: Mail },
      { href: "/sent-emails", label: "Sent emails", icon: Mail },
      { href: "/email-unsubscribes", label: "Unsubscribed contacts", icon: Users },
    ],
  },
  {
    label: "Automation",
    links: [
      { href: "/automation", label: "Workflows", icon: Zap },
      { href: "/sequences", label: "Sequences", icon: Layers },
      { href: "/ai-assistant", label: "AI assistant", icon: Sparkles },
    ],
  },
  {
    label: "Sales tools",
    links: [
      { href: "/call-queue", label: "Call queue", icon: Phone },
      { href: "/trial-queue", label: "Trial schedule", icon: CalendarClock },
      { href: "/dm-queue", label: "DM queue", icon: Megaphone },
      { href: "/me/stats", label: "My DM stats", icon: BarChart3 },
      { href: "/prospect-search", label: "Prospecting", icon: Search },
      { href: "/scraper", label: "Lead finder", icon: Search },
      { href: "/lead-import", label: "Import contacts", icon: Users },
    ],
  },
  {
    label: "Reports",
    links: [
      { href: "/social-reports", label: "Social reports", icon: BarChart3 },
      { href: "/marketing-reports", label: "Marketing reports", icon: BarChart3 },
      { href: "/outreach-weekly", label: "Weekly outreach", icon: BarChart3 },
      { href: "/company-kpis", label: "Daily performance", icon: BarChart3 },
      { href: "/analytics", label: "CRM analytics", icon: BarChart3 },
      {
        href: "/sequence-analytics",
        label: "Sequence analytics",
        icon: BarChart3,
      },
      {
        href: "/revenue-attribution",
        label: "Revenue attribution",
        icon: BarChart3,
      },
    ],
  },
  {
    label: "Settings & operations",
    links: [
      { href: "/sub-accounts", label: "Client accounts", icon: Building2 },
      { href: "/team", label: "Team & invites", icon: Users },
      { href: "/training", label: "Agent training", icon: FileText },
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/activity-log", label: "Activity & audit log", icon: FileText },
      { href: "/webhooks", label: "Webhooks", icon: Plug },
      { href: "/reputation", label: "Reputation", icon: Users },
      { href: "/affiliates", label: "Affiliates", icon: Users },
      { href: "/billing-integration", label: "API & SSO", icon: Plug },
    ],
  },
];
export function Layout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [pageSearch, setPageSearch] = useState("");
  const [pageSearchOpen, setPageSearchOpen] = useState(false);
  const [refreshLiveSegments, setRefreshLiveSegments] = useState(false);
  const { user, role, pagePermissions, signOut } = useAuth();
  const agencyRole = ["owner", "admin", "member", "viewer", "agent", "agency_admin", "agency_staff"].includes(role);
  const {data:portalAccounts}=useQuery<{selected:{viewAsClient:boolean}|null}>({queryKey:["portal-accounts"],
    queryFn:()=>apiFetch('/api/portal?action=accounts'),enabled:agencyRole&&location.startsWith('/client-portal'),retry:false});
  const viewAsClient=portalAccounts?.selected?.viewAsClient===true;
  const navigationRole=viewAsClient?'client_owner':role;
  const clientWorkspace = role === "client_owner" || role === "client_staff" || viewAsClient;
  const primary = clientWorkspace ? clientCore : core;
  const canSeeSegments = !clientWorkspace&&role !== "client" && role !== "agent" && canAccessPath("/segments", pagePermissions, navigationRole);
  const { data: segmentResponse } = useQuery<Array<{id:string;name:string;contactCount:number}>>({ queryKey: ["segments"], queryFn: () => apiFetch("/api/segments"), enabled: canSeeSegments, staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  const { data: liveSegmentResponse } = useQuery<Array<{id:string;name:string;contactCount:number}>>({ queryKey: ["segments", "live"], queryFn: () => apiFetch("/api/segments?liveCounts=1"), enabled: canSeeSegments && refreshLiveSegments, staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  const segments = asArray<{id:string;name:string;contactCount:number}>(liveSegmentResponse ?? segmentResponse);
  const path = location.replace(/^\/leadgen/, "") || "/";
  const landingEditor = /^\/landing-pages\/[0-9a-f-]{36}$/i.test(path);
  const active = (href: string) =>
    href === "/client-portal"
      ? path === "/client-portal" || path === "/client-portal/dashboard"
      : href === "/companies"
      ? path === "/" || path === "/dashboard" || path.startsWith("/companies")
      : href === "/leads" ? path.startsWith("/leads") || path.startsWith("/contacts/segments") : path.startsWith(href);
  useEffect(() => setMobile(false), [location]);
  useEffect(() => {
    if (!canSeeSegments) return;
    const timer = window.setTimeout(() => setRefreshLiveSegments(true), 3000);
    return () => window.clearTimeout(timer);
  }, [canSeeSegments]);
  useEffect(() => {
    if (!mobile) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") setMobile(false); };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [mobile]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPageSearchOpen((open) => !open);
      } else if (event.key === "Escape") {
        setPageSearchOpen(false);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const searchablePages = [...primary, ...groups.flatMap((group) => group.links),
    { href: "/settings", label: "Settings", icon: Settings }]
    .filter((item) => canAccessPath(item.href, pagePermissions, navigationRole))
    .filter((item) => item.label.toLowerCase().includes(pageSearch.trim().toLowerCase()));
  const current =
    [...primary, ...groups.flatMap((group) => group.links)].find((item) =>
      active(item.href),
    )?.label ?? (path.startsWith("/client-portal/")
      ? `Client ${path.split("/")[2]}` : "Workspace");
  function navLink(item: Item) {
    return !canAccessPath(item.href, pagePermissions, navigationRole) ? null : (
      <Link
        key={item.href}
        href={item.href}
        onMouseEnter={() => prefetchPage(item.href)}
        onFocus={() => prefetchPage(item.href)}
        aria-current={active(item.href) ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        className={`flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors ${active(item.href) ? "bg-blue-600 text-white shadow-sm" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {(!collapsed || mobile) && (
          <span className="truncate">{item.label}</span>
        )}
      </Link>
    );
  }
  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-background">
      {mobile && (
        <button
          className="fixed inset-0 z-40 bg-slate-950/25 md:hidden"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="main-navigation"
        className={`${mobile ? "fixed inset-y-0 left-0 z-50 flex w-72" : "hidden"} ${collapsed ? "md:w-[68px]" : "md:w-[248px]"} shrink-0 flex-col border-r border-slate-800 bg-slate-950 md:relative md:flex`}
      >
        <Link
          href="/"
          className="flex h-20 shrink-0 items-center gap-3 px-5"
        >
          <img
            src={`${import.meta.env.BASE_URL}victorysync-logo.png`}
            alt="VictorySync"
            className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-1.5"
          />
          {(!collapsed || mobile) && (
            <span className="text-[17px] font-semibold tracking-tight text-white">
              VictorySync
            </span>
          )}
        </Link>
        {(!collapsed || mobile) && <div className="mx-3 mb-3"><AccountSwitcher variant="sidebar"/></div>}
        {(!collapsed || mobile) && <button type="button" onClick={() => setPageSearchOpen(true)}
          className="mx-3 mb-3 flex h-10 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 text-left text-xs text-slate-300 hover:border-slate-500 hover:text-white">
          <Search className="h-4 w-4"/><span className="flex-1">Find a page</span><kbd className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px]">Ctrl K</kbd>
        </button>}
        <nav
          aria-label="Workspace navigation"
          className="flex-1 space-y-1 overflow-y-auto px-3 pb-5 pt-2"
        >
          {(!collapsed || mobile) && <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Main menu</p>}
          {primary.map(navLink)}
          {(!collapsed || mobile) && canSeeSegments && <div className="ml-7 border-l border-slate-700 pl-2">
            <Link href="/segments" onMouseEnter={() => prefetchPage("/segments")} onFocus={() => prefetchPage("/segments")} className="block rounded px-2 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white">Segments</Link>
            {segments.map((segment) => <Link key={segment.id} href={`/contacts/segments/${segment.id}`} onMouseEnter={() => void pageModules["../pages/segment-detail.tsx"]?.()} onFocus={() => void pageModules["../pages/segment-detail.tsx"]?.()} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"><span className="truncate">{segment.name}</span><span>{segment.contactCount.toLocaleString()}</span></Link>)}
          </div>}
          {!collapsed || mobile
            ? groups.map((group) => {
                const links = group.links.filter((item) =>
                  canAccessPath(item.href, pagePermissions, navigationRole),
                );
                if (!links.length) return null;
                return (
                  <details
                    key={group.label}
                    className="group mt-4 border-t border-slate-800 pt-3"
                    open={links.some((item) => active(item.href)) || undefined}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                      {group.label}
                      <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="space-y-1">{links.map(navLink)}</div>
                  </details>
                );
              })
            : groups.flatMap((group) => group.links).map(navLink)}
        </nav>
        <div className="space-y-3 border-t border-slate-800 px-3 py-4">
          {!clientWorkspace && navLink({ href: "/settings", label: "Settings", icon: Settings })}
          <div className="flex items-center gap-2 px-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
              {user?.email?.[0]?.toUpperCase() ?? "V"}
            </span>
            {(!collapsed || mobile) && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-200">
                    {user?.email}
                  </p>
                  <p className="text-[10px] capitalize text-slate-400">
                    {role}
                  </p>
                </div>
                <button
                  aria-label="Sign out"
                  className="rounded p-1 text-slate-400 hover:text-slate-700"
                  onClick={() => void signOut()}
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[72px] shrink-0 flex-wrap items-center gap-3 border-b border-slate-200/70 bg-white px-4 py-3 sm:px-8">
          <button
            className="rounded p-1.5 text-slate-500 md:hidden"
            aria-label={mobile ? "Close menu" : "Open menu"}
            aria-expanded={mobile}
            aria-controls="main-navigation"
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <button
            className="hidden rounded p-1.5 text-slate-400 hover:bg-slate-50 md:block"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
          <span className="hidden text-xs text-slate-600 sm:inline">
            Workspace
          </span>
          <ChevronRight className="hidden h-3 w-3 text-slate-300 sm:block" />
          <span className="truncate text-xs font-medium text-slate-600">
            {current}
          </span>
          <div className="ml-auto min-w-0"><AccountSwitcher /></div>
          {canAccessPath("/companies", pagePermissions, navigationRole) && (
            <form
              className="relative w-full min-w-[160px] flex-1 sm:max-w-64 sm:flex-none"
              onSubmit={(event) => {
                event.preventDefault();
                navigate(`/companies?q=${encodeURIComponent(search.trim())}`);
                setSearch("");
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                aria-label="Find a company"
                placeholder="Find a company…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </form>
          )}
        </header>
        <main id="workspace-content" className={`workspace-content min-h-0 min-w-0 flex-1 overflow-y-auto ${landingEditor ? 'p-0' : 'px-4 py-6 sm:px-8 sm:py-8'}`}>
          <div className={landingEditor ? 'h-full min-w-0 w-full' : 'mx-auto w-full max-w-[1600px]'}>{children}</div>
        </main>
      </div>
      {pageSearchOpen && <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/50 px-4 pt-[12vh]" onMouseDown={() => setPageSearchOpen(false)}>
        <div role="dialog" aria-modal="true" aria-label="Find a page" className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
          <div className="flex items-center gap-3 border-b px-4"><Search className="h-5 w-5 text-slate-400"/><input autoFocus aria-label="Search pages" value={pageSearch} onChange={(event) => setPageSearch(event.target.value)} placeholder="Search pages..." className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none"/><button type="button" aria-label="Close page search" onClick={() => setPageSearchOpen(false)}><X className="h-4 w-4 text-slate-500"/></button></div>
          <div className="max-h-[50vh] overflow-y-auto p-2">{searchablePages.length ? searchablePages.map((item) => <button type="button" key={item.href} onClick={() => { navigate(item.href); setPageSearchOpen(false); setPageSearch(""); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 focus:bg-slate-100"><item.icon className="h-4 w-4 text-slate-500"/>{item.label}</button>) : <p className="px-3 py-8 text-center text-sm text-slate-500">No matching pages</p>}</div>
        </div>
      </div>}
    </div>
  );
}
