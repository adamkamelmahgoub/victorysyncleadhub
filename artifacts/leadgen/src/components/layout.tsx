import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Megaphone,
  FormInput,
  BarChart3,
  Settings,
  Bell,
  Search,
  Globe,
  Mail,
  GitBranch,
  Layers,
  ChevronRight,
  Zap,
} from "lucide-react";

const NAV_GROUPS = [
  {
    label: "Prospecting",
    items: [
      { href: "/leads", label: "Contacts", icon: Users },
      { href: "/pipeline", label: "Pipeline", icon: GitBranch },
      { href: "/scraper", label: "Lead Finder", icon: Globe },
    ],
  },
  {
    label: "Outreach",
    items: [
      { href: "/sequences", label: "Sequences", icon: Layers },
      { href: "/email-accounts", label: "Mailboxes", icon: Mail },
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
    ],
  },
  {
    label: "Grow",
    items: [
      { href: "/forms", label: "Forms", icon: FormInput },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
];

function VictorySyncLogo() {
  return (
    <svg viewBox="0 0 28 28" fill="none" className="w-7 h-7 flex-shrink-0">
      <rect width="28" height="28" rx="7" fill="url(#vs-bg)" />
      <path
        d="M8 7L14 21L20 7"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 13H22"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      <defs>
        <linearGradient id="vs-bg" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C5CF7" />
          <stop offset="1" stopColor="#5B3FE8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);

  function isActive(href: string) {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border gap-2.5">
          <VictorySyncLogo />
          <div>
            <div className="font-semibold text-foreground text-sm tracking-tight leading-none">VictorySync</div>
            <div className="text-[10px] text-muted-foreground leading-none mt-0.5 tracking-wide">REVENUE INTELLIGENCE</div>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 pt-3 pb-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 bg-muted/60 hover:bg-muted border border-border/60 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="text-xs">Search…</span>
            <span className="ml-auto text-[10px] bg-border/80 px-1.5 py-0.5 rounded text-muted-foreground/70">⌘K</span>
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-4 mt-2">
          {/* Dashboard */}
          <div>
            <Link href="/">
              <div
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  isActive("/") && location === "/"
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
                Dashboard
              </div>
            </Link>
          </div>

          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 mb-1">
                <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest">
                  {group.label}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                          active
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        }`}
                      >
                        <item.icon className="w-4 h-4 flex-shrink-0" />
                        {item.label}
                        {active && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-sidebar-border px-2 py-2 space-y-0.5">
          <Link href="/settings">
            <div
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                isActive("/settings")
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Settings className="w-4 h-4 flex-shrink-0" />
              Settings
            </div>
          </Link>
        </div>

        {/* Upgrade hint */}
        <div className="mx-2 mb-3 rounded-lg bg-primary/10 border border-primary/20 p-3">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Pro Plan</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">Unlimited sequences, enrichment & AI features</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-border flex items-center px-6 gap-4 bg-background/80 backdrop-blur-sm flex-shrink-0">
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full" />
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-700 flex items-center justify-center text-xs font-bold text-white">
              VS
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
