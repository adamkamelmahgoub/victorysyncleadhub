import { PageTitle, PageDescription } from "@/components/page-layout";
import { Link } from "wouter";
import {
  BarChart3,
  Building2,
  Key,
  Megaphone,
  Settings,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const modules = [
  {
    href: "/companies",
    title: "Company CRM & Trials",
    description: "Track prospect companies, schedule inbound and outbound trials, and log every call and lead.",
    icon: Megaphone,
    stat: "CRM",
  },
  {
    href: "/sub-accounts",
    title: "Client Accounts",
    description: "Provision and manage client workspaces, plans, status, and white-label settings.",
    icon: Building2,
    stat: "Account ops",
  },
  {
    href: "/team",
    title: "Team & Invites",
    description: "Issue locked invite codes, manage roles, and control workspace access.",
    icon: Users,
    stat: "Invite-only",
  },
  {
    href: "/billing-integration",
    title: "API & SSO",
    description: "Connect external VictorySync services through API keys and SSO workflows.",
    icon: Key,
    stat: "Platform API",
  },
];

export default function VictorySyncHome() {
  const { user } = useAuth();
  const name =
    (typeof user?.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
    user?.email ||
    "there";

  return (
    <div className="page-stack">
      <section className="rounded-lg border border-border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between flex-wrap gap-4 min-w-0">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              VictorySync Command Center
            </div>
            <PageTitle className="mt-4">Welcome, {name}</PageTitle>
            <PageDescription className="max-w-2xl">
              Manage your platform, clients, team access, and lead generation workflows from one dashboard.
            </PageDescription>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:flex">
            <Link href="/companies">
              <button className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90">
                Open Company CRM
              </button>
            </Link>
            <Link href="/trial-queue">
              <button className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">
                View Trial Queue
              </button>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {modules.map((module) => (
          <Link key={module.href} href={module.href}>
            <div className="h-full cursor-pointer rounded-lg border border-border bg-white p-4 shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5">
              <div className="flex items-start justify-between gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <module.icon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {module.stat}
                </span>
              </div>
              <h2 className="mt-4 text-sm font-semibold text-foreground">{module.title}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{module.description}</p>
            </div>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Zap className="h-4 w-4 text-primary" />
            Fast Actions
          </div>
          <div className="mt-4 grid gap-2">
            <Link href="/leads">
              <button className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted">
                Add or import contacts
              </button>
            </Link>
            <Link href="/team">
              <button className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted">
                Invite a team member
              </button>
            </Link>
            <Link href="/integrations">
              <button className="w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted">
                Connect integrations
              </button>
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <BarChart3 className="h-4 w-4 text-primary" />
            Module Health
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Contacts, campaigns, automation, client provisioning, and team invites share the same VictorySync auth session.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Settings className="h-4 w-4 text-primary" />
            Next Integration Step
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Add account-level scoping so every client only sees data for their assigned workspace.
          </p>
        </div>
      </section>
    </div>
  );
}
