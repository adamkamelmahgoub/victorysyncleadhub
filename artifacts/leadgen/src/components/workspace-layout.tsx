import { useEffect, useState, type ReactNode, type ElementType } from "react";
import { Link, useLocation } from "wouter";
import {
  Building2,
  Users,
  GitBranch,
  CalendarClock,
  CheckSquare,
  Mail,
  Megaphone,
  Layers,
  Zap,
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
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canAccessPath } from "@/lib/permissions";
type Item = { href: string; label: string; icon: ElementType };
const core: Item[] = [
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/leads", label: "Contacts", icon: Users },
  { href: "/crm-tasks", label: "Tasks & follow-ups", icon: CheckSquare },
  { href: "/trial-queue", label: "Trial schedule", icon: CalendarClock },
  { href: "/conversations", label: "Inbox", icon: Mail },
  { href: "/pipeline", label: "Deal pipelines", icon: GitBranch },
];
const groups: { label: string; links: Item[] }[] = [
  {
    label: "Sales",
    links: [
      { href: "/prospect-search", label: "Prospecting", icon: Search },
      { href: "/scraper", label: "Lead finder", icon: Search },
      { href: "/sequences", label: "Sequences", icon: Layers },
      {
        href: "/meeting-scheduler",
        label: "Meeting scheduler",
        icon: CalendarClock,
      },
      { href: "/lead-import", label: "Import contacts", icon: Users },
      { href: "/segments", label: "Segments", icon: Users },
    ],
  },
  {
    label: "Marketing",
    links: [
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/email-templates", label: "Email templates", icon: FileText },
      { href: "/email-accounts", label: "Mailboxes", icon: Mail },
      { href: "/automation", label: "Workflows", icon: Zap },
      { href: "/forms", label: "Forms", icon: FileText },
      { href: "/social-planner", label: "Social planner", icon: Megaphone },
    ],
  },
  {
    label: "Reports",
    links: [
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
    label: "Operations",
    links: [
      { href: "/sub-accounts", label: "Client accounts", icon: Building2 },
      { href: "/team", label: "Team & invites", icon: Users },
      { href: "/training", label: "Agent training", icon: FileText },
      { href: "/integrations", label: "Integrations", icon: Plug },
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
  const { user, role, pagePermissions, signOut } = useAuth();
  const path = location.replace(/^\/leadgen/, "") || "/";
  const active = (href: string) =>
    href === "/companies"
      ? path === "/" || path === "/dashboard" || path.startsWith("/companies")
      : path.startsWith(href);
  useEffect(() => setMobile(false), [location]);
  const current =
    [...core, ...groups.flatMap((group) => group.links)].find((item) =>
      active(item.href),
    )?.label ?? "Workspace";
  function navLink(item: Item) {
    return !canAccessPath(item.href, pagePermissions) ? null : (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active(item.href) ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        className={`flex h-9 items-center gap-2.5 rounded-md px-3 text-[13px] font-medium transition-colors ${active(item.href) ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"}`}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {(!collapsed || mobile) && (
          <span className="truncate">{item.label}</span>
        )}
      </Link>
    );
  }
  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-[#f8fafc]">
      {mobile && (
        <button
          className="fixed inset-0 z-40 bg-slate-950/25 md:hidden"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="main-navigation"
        className={`${mobile ? "fixed inset-y-0 left-0 z-50 flex w-60" : "hidden"} ${collapsed ? "md:w-[68px]" : "md:w-[220px]"} shrink-0 flex-col border-r border-slate-200 bg-white md:relative md:flex`}
      >
        <Link
          href="/"
          className="flex h-16 shrink-0 items-center gap-2.5 border-b px-4"
        >
          <img
            src={`${import.meta.env.BASE_URL}victorysync-logo.png`}
            alt="VictorySync"
            className="h-8 w-8 shrink-0 rounded-md border object-contain p-1"
          />
          {(!collapsed || mobile) && (
            <span className="text-[17px] font-semibold tracking-tight text-slate-900">
              VictorySync
            </span>
          )}
        </Link>
        <nav
          aria-label="Workspace navigation"
          className="flex-1 space-y-1 overflow-y-auto px-2 py-4"
        >
          {core.map(navLink)}
          {!collapsed || mobile
            ? groups.map((group) => {
                const links = group.links.filter((item) =>
                  canAccessPath(item.href, pagePermissions),
                );
                if (!links.length) return null;
                return (
                  <details
                    key={group.label}
                    className="group pt-3"
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
        <div className="space-y-2 border-t px-2 py-3">
          {navLink({ href: "/settings", label: "Settings", icon: Settings })}
          <div className="flex items-center gap-2 px-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              {user?.email?.[0]?.toUpperCase() ?? "V"}
            </span>
            {(!collapsed || mobile) && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-700">
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
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-4 sm:px-6">
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
          <span className="hidden text-xs text-slate-400 sm:inline">
            Workspace
          </span>
          <ChevronRight className="hidden h-3 w-3 text-slate-300 sm:block" />
          <span className="truncate text-xs font-medium text-slate-600">
            {current}
          </span>
          {canAccessPath("/companies", pagePermissions) && (
            <form
              className="relative ml-auto w-40 sm:w-60"
              onSubmit={(event) => {
                event.preventDefault();
                navigate(`/companies?q=${encodeURIComponent(search.trim())}`);
                setSearch("");
              }}
            >
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                aria-label="Find a company"
                placeholder="Find a company…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs outline-none focus:border-primary"
              />
            </form>
          )}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
