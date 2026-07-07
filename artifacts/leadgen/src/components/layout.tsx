import React from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, MessageSquare, Users, GitBranch, Calendar,
  Megaphone, Zap, Layers, Globe, BarChart3, Star, Settings,
  Search, Mail, Share2, UserPlus, Plug, Upload, Image,
  ChevronDown, Bell,
} from "lucide-react";

const NAV: Array<{ href: string; label: string; icon: React.ElementType; badge?: string } | null> = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/conversations", label: "Conversations", icon: MessageSquare, badge: "3" },
  { href: "/leads", label: "Contacts", icon: Users },
  { href: "/pipeline", label: "Opportunities", icon: GitBranch },
  { href: "/calendars", label: "Calendars", icon: Calendar },
  null,
  { href: "/campaigns", label: "Email Marketing", icon: Megaphone },
  { href: "/social-planner", label: "Social Planner", icon: Share2 },
  { href: "/automation", label: "Automation", icon: Zap },
  { href: "/sequences", label: "Sequences", icon: Layers },
  null,
  { href: "/forms", label: "Sites / Forms", icon: Globe },
  { href: "/analytics", label: "Reporting", icon: BarChart3 },
  { href: "/reputation", label: "Reputation", icon: Star },
  null,
  { href: "/team", label: "Team", icon: UserPlus },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/email-accounts", label: "Mailboxes", icon: Mail },
  { href: "/lead-import", label: "Import Leads", icon: Upload },
  { href: "/scraper", label: "Lead Finder", icon: Search },
];

function GHLLogo() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8 flex-shrink-0">
      <rect width="32" height="32" rx="8" fill="#F97316" />
      <path d="M16 8C11.582 8 8 11.582 8 16s3.582 8 8 8c2.387 0 4.536-.97 6.092-2.535l-2.828-2.829A4 4 0 1 1 16 12v4h4v-2h2.899A7.96 7.96 0 0 0 24 16c0-4.418-3.582-8-8-8z" fill="white" />
    </svg>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  function isActive(href: string) {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Dark Sidebar ── */}
      <aside
        className="w-52 flex-shrink-0 flex flex-col overflow-hidden"
        style={{ background: "hsl(var(--sidebar))", borderRight: "1px solid hsl(var(--sidebar-border))" }}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 gap-2.5 flex-shrink-0" style={{ borderBottom: "1px solid hsl(var(--sidebar-border))" }}>
          <GHLLogo />
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
            <span className="truncate">My Agency</span>
            <ChevronDown className="w-3 h-3 opacity-60 flex-shrink-0 ml-1" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {NAV.map((item, i) => {
            if (!item) {
              return <div key={`d-${i}`} className="my-1 mx-1" style={{ borderTop: "1px solid hsl(var(--sidebar-border))" }} />;
            }
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all mb-0.5 relative"
                  style={
                    active
                      ? { background: "hsl(25 95% 53% / 0.18)", color: "#FB923C", borderLeft: "2px solid #F97316", paddingLeft: "8px" }
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
          <Link href="/settings">
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer mb-1"
              style={isActive("/settings") ? { background: "hsl(25 95% 53% / 0.18)", color: "#FB923C" } : { color: "hsl(var(--sidebar-foreground))" }}
            >
              <Settings className="w-3.5 h-3.5 flex-shrink-0" />
              Settings
            </div>
          </Link>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer mt-1">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: "#F97316" }}>
              VS
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-white truncate">Admin User</div>
              <div className="text-[10px] truncate" style={{ color: "hsl(215 20% 45%)" }}>admin@victorysync.io</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-white flex items-center px-5 gap-4 flex-shrink-0 shadow-sm">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              placeholder="Search contacts, campaigns..."
              className="w-72 pl-9 pr-3 py-1.5 text-sm bg-muted rounded-lg border-0 outline-none focus:ring-2 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex items-center gap-2">
            <button className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
            </button>
            <Link href="/lead-import">
              <button className="text-sm font-medium px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" /> Import
              </button>
            </Link>
            <Link href="/leads">
              <button className="text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors">
                + Add Contact
              </button>
            </Link>
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
