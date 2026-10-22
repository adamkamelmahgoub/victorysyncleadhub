export const PAGE_PERMISSIONS = [
  { key: "home", label: "Home", paths: ["/", "/dashboard", "/victorysync"] },
  { key: "client-accounts", label: "Client Accounts", paths: ["/sub-accounts"] },
  { key: "team", label: "Team & Invites", paths: ["/team"] },
  { key: "contacts", label: "Contacts", paths: ["/leads", "/call-queue"] },
  { key: "imports", label: "Import Contacts", paths: ["/lead-import"] },
  { key: "segments", label: "Segments", paths: ["/segments"] },
  { key: "conversations", label: "Conversations", paths: ["/conversations", "/dm-queue", "/dm-campaigns"] },
  { key: "pipeline", label: "Company CRM & Pipelines", paths: ["/pipeline", "/companies", "/company-import", "/trial-queue", "/company-kpis", "/crm-tasks"] },
  { key: "prospecting", label: "Prospecting & Lead Finder", paths: ["/prospect-search", "/scraper"] },
  { key: "calendar", label: "Calendars & Scheduler", paths: ["/calendars", "/meeting-scheduler"] },
  { key: "sequences", label: "Sequences", paths: ["/sequences", "/sequence-analytics"] },
  { key: "campaigns", label: "Campaigns", paths: ["/campaigns"] },
  { key: "email", label: "Email Templates & Mailboxes", paths: ["/email-templates", "/email-accounts"] },
  { key: "social", label: "Social Planner", paths: ["/social-planner"] },
  { key: "automation", label: "Automation", paths: ["/automation"] },
  { key: "forms", label: "Sites / Forms", paths: ["/forms", "/landing-pages", "/marketing-reports"] },
  { key: "integrations", label: "Integrations & Webhooks", paths: ["/integrations", "/webhooks"] },
  { key: "reputation", label: "Reputation", paths: ["/reputation"] },
  { key: "reporting", label: "Reports & Attribution", paths: ["/outreach-weekly", "/analytics", "/revenue-attribution"] },
  { key: "affiliates", label: "Affiliates", paths: ["/affiliates"] },
  { key: "settings", label: "Settings & API / SSO", paths: ["/settings", "/billing-integration"] },
] as const;

export const ALL_PAGE_PERMISSION_KEYS = PAGE_PERMISSIONS.map((permission) => permission.key);

export function permissionForPath(path: string) {
  const normalized = path.replace(/^\/leadgen(?=\/|$)/, "") || "/";
  return PAGE_PERMISSIONS.find((permission) =>
    permission.paths.some((allowedPath) => allowedPath === "/" ? normalized === "/" : normalized.startsWith(allowedPath)),
  )?.key;
}

export function canAccessPath(path: string, permissions: string[] | null, role?: string) {
  if (role === "no_access") return false;
  if (role === "client" && path === "/victorysync") return true;
  if (role === "agent" && path === "/victorysync") return true;
  if (role === "client" && !(/^\/(?:leadgen\/)?(?:leads|pipeline)(?:\/|$)/.test(path))) return false;
  if (role === "agent" && !(/^\/(?:leadgen\/)?(?:leads|pipeline|call-queue)(?:\/|$)/.test(path))) return false;
  if (permissions === null) return true;
  const required = permissionForPath(path);
  return !required || permissions.includes(required);
}
