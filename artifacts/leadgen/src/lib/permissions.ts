export const PAGE_PERMISSIONS = [
  { key: "home", label: "Home", paths: ["/", "/dashboard"] },
  { key: "client-accounts", label: "Client Accounts", paths: ["/sub-accounts"] },
  { key: "team", label: "Team & Invites", paths: ["/team"] },
  { key: "contacts", label: "Contacts", paths: ["/leads"] },
  { key: "imports", label: "Import Contacts", paths: ["/lead-import"] },
  { key: "segments", label: "Segments", paths: ["/segments"] },
  { key: "conversations", label: "Conversations", paths: ["/conversations"] },
  { key: "pipeline", label: "Company CRM & Pipelines", paths: ["/pipeline", "/companies", "/trial-queue", "/company-kpis", "/crm-tasks"] },
  { key: "prospecting", label: "Prospecting & Lead Finder", paths: ["/prospect-search", "/scraper"] },
  { key: "calendar", label: "Calendars & Scheduler", paths: ["/calendars", "/meeting-scheduler"] },
  { key: "sequences", label: "Sequences", paths: ["/sequences", "/sequence-analytics"] },
  { key: "campaigns", label: "Campaigns", paths: ["/campaigns"] },
  { key: "email", label: "Email Templates & Mailboxes", paths: ["/email-templates", "/email-accounts"] },
  { key: "social", label: "Social Planner", paths: ["/social-planner"] },
  { key: "automation", label: "Automation", paths: ["/automation"] },
  { key: "forms", label: "Sites / Forms", paths: ["/forms"] },
  { key: "integrations", label: "Integrations & Webhooks", paths: ["/integrations", "/webhooks"] },
  { key: "reputation", label: "Reputation", paths: ["/reputation"] },
  { key: "reporting", label: "Reports & Attribution", paths: ["/analytics", "/revenue-attribution"] },
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

export function canAccessPath(path: string, permissions: string[] | null) {
  if (permissions === null) return true;
  const required = permissionForPath(path);
  return !required || permissions.includes(required);
}
