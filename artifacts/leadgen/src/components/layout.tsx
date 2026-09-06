import React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, MessageSquare, Users, GitBranch, Calendar,
  Megaphone, Zap, Layers, Globe, BarChart3, Star, Settings,
  Search, Mail, Share2, UserPlus, Plug, Upload, Filter,
  ChevronDown, Bell, Webhook, FileText, Building2, Target,
  CalendarClock, TrendingUp, Gift, Rocket, Key, BookOpen, Menu, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canAccessPath } from "@/lib/permissions";

type NavItem = { href: string; label: string; icon: React.ElementType; badge?: string };
type NavEntry = NavItem | { section: string } | null;

const NAV: NavEntry[] = [
  { section: "VictorySync" },
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/sub-accounts", label: "Client Accounts", icon: Building2 },
  { href: "/team", label: "Team & Invites", icon: UserPlus },
  { href: "/training", label: "Agent Training", icon: BookOpen },
  null,
  { section: "CRM" },
  { href: "/companies", label: "Company Pipeline", icon: Building2 },
  { href: "/trial-queue", label: "Trial Queue", icon: CalendarClock },
  { href: "/company-kpis", label: "Daily Performance", icon: BarChart3 },
  { href: "/leads", label: "Contacts", icon: Users },
  { href: "/lead-import", label: "Import Contacts", icon: Upload },
  { href: "/segments", label: "Segments", icon: Filter },
  { href: "/conversations", label: "Conversations", icon: MessageSquare, badge: "3" },
  null,
  { section: "Sales" },
  { href: "/pipeline", label: "Deals / Pipeline", icon: GitBranch },
  { href: "/prospect-search", label: "Prospecting", icon: Target },
  { href: "/calendars", label: "Calendars", icon: Calendar },
  { href: "/meeting-scheduler", label: "Scheduler", icon: CalendarClock },
  { href: "/sequences", label: "Sequences", icon: Layers },
  null,
  { section: "Marketing" },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/email-templates", label: "Email Templates", icon: FileText },
  { href: "/email-accounts", label: "Mailboxes", icon: Mail },
  { href: "/social-planner", label: "Social Planner", icon: Share2 },
  { href: "/automation", label: "Automation", icon: Zap },
  null,
  { section: "Operations" },
  { href: "/forms", label: "Sites / Forms", icon: Globe },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/scraper", label: "Lead Finder", icon: Search },
  { href: "/reputation", label: "Reputation", icon: Star },
  null,
  { section: "Reporting" },
  { href: "/analytics", label: "Dashboard Reports", icon: BarChart3 },
  { href: "/sequence-analytics", label: "Sequence Analytics", icon: TrendingUp },
  { href: "/revenue-attribution", label: "Revenue Attribution", icon: TrendingUp },
  null,
  { section: "Growth" },
  { href: "/affiliates", label: "Affiliates", icon: Gift },
];

function VictorySyncLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8 flex-shrink-0" role="img" aria-label="Victory Sync">
      <rect width="32" height="32" rx="8" fill="#FF3C00" />
      <path d="m7 10 8 14L25 8h-6l-4 7-3-5H7Z" fill="white" />
    </svg>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileNav, setMobileNav] = React.useState(false);
  React.useEffect(() => { setMobileNav(false); }, [location]);
  const { user, role, clientAccountId, pagePermissions, signOut } = useAuth();
  const userEmail = user?.email ?? "Signed in user";
  const initials = userEmail
    .split("@")[0]
    .split(/[._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "VS";

  function isActive(href: string) {
    if (href === "/") return location === "/" || location === "/dashboard";
    return location.startsWith(href);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {mobileNav && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileNav(false)} />}
      {/* ── Dark Sidebar ── */}
      <aside
        id="main-navigation"
        className={`w-52 flex-shrink-0 flex-col overflow-hidden md:relative md:flex ${mobileNav ? "fixed inset-y-0 left-0 z-50 flex" : "hidden"}`}
        style={{ background: "hsl(var(--sidebar))", borderRight: "1px solid hsl(var(--sidebar-border))" }}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 gap-2.5 flex-shrink-0" style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}>
          <VictorySyncLogo />
          <div>
            <div className="font-bold text-white text-sm leading-none">VictorySync</div>
            <div className="text-[9px] leading-none mt-0.5 font-medium tracking-widest" style={{ color: "hsl(215 20% 50%)" }}>PLATFORM</div>
          </div>
        </div>

        {/* Agency selector */}
        <div className="px-3 py-2 flex-shrink-0">
          <button
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: "hsl(var(--sidebar-accent))", color: "hsl(var(--sidebar-foreground))" }}
          >
            <span className="truncate">VictorySync Platform</span>
            <ChevronDown className="w-3 h-3 opacity-60 flex-shrink-0 ml-1" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {NAV.map((item, i) => {
            if (!item) {
              return <div key={`d-${i}`} className="my-1 mx-1" style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }} />;
            }
            if ("section" in item) {
              return (
                <div
                  key={`s-${item.section}`}
                  className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "hsl(215 20% 45%)" }}
                >
                  {item.section}
                </div>
              );
            }
            if (!canAccessPath(item.href, pagePermissions)) return null;
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all mb-0.5 relative"
                  style={
                    active
                      ? { background: "hsl(14 100% 50% / 0.18)", color: "#ff987a", borderLeft: "2px solid #FF3C00", paddingLeft: "8px" }
                      : { color: "hsl(var(--sidebar-foreground))", borderLeft: "2px solid transparent", paddingLeft: "8px" }
                  }
                  onMouseEnter={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = "hsl(var(--sidebar-accent))";
                      (e.currentTarget as HTMLElement).style.color = "white";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                      (e.currentTarget as HTMLElement).style.color = "hsl(var(--sidebar-foreground))";
                    }
                  }}
                >
                  <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="flex-shrink-0 text-[10px] bg-primary text-white px-1.5 rounded-full font-bold">
                      {item.badge}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="p-2 flex-shrink-0" style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }}>
          {canAccessPath("/settings", pagePermissions) && <Link href="/settings">
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer mb-1"
              style={isActive("/settings") ? { background: "hsl(14 100% 50% / 0.18)", color: "#ff987a" } : { color: "hsl(var(--sidebar-foreground))" }}
            >
              <Settings className="w-3.5 h-3.5 flex-shrink-0" />
              Settings
            </div>
          </Link>}
          {canAccessPath("/billing-integration", pagePermissions) && <Link href="/billing-integration">
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer mb-1"
              style={isActive("/billing-integration") ? { background: "hsl(14 100% 50% / 0.18)", color: "#ff987a" } : { color: "hsl(var(--sidebar-foreground))" }}
            >
              <Key className="w-3.5 h-3.5 flex-shrink-0" />
              API & SSO
            </div>
          </Link>}
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg mt-1">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: "#FF3C00" }}>
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-white truncate">{userEmail}</div>
              <div className="text-[10px] capitalize" style={{ color: "#ff987a" }}>
                {role}{role === "agent" && clientAccountId ? ` · Client ${clientAccountId}` : ""}
              </div>
              <button
                type="button"
                className="text-[10px] truncate text-left hover:text-white"
                style={{ color: "hsl(215 20% 45%)" }}
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-white flex items-center px-3 sm:px-5 gap-3 flex-shrink-0 shadow-sm">
          <button aria-label={mobileNav ? "Close menu" : "Open menu"} aria-expanded={mobileNav} aria-controls="main-navigation" className="rounded-md p-2 md:hidden" onClick={() => setMobileNav(value => !value)}>{mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          <div className="flex-1 relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              placeholder="Search contacts, campaigns..."
              className="w-full max-w-72 pl-9 pr-3 py-1.5 text-sm bg-muted rounded-lg border-0 outline-none focus:ring-2 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
            </button>
            {canAccessPath("/lead-import", pagePermissions) && <Link href="/lead-import">
              <button className="text-sm font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" /> Import
              </button>
            </Link>}
            {canAccessPath("/leads", pagePermissions) && <Link href="/leads">
              <button className="text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors">
                + Add Contact
              </button>
            </Link>}
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
