import pg from "pg";

export const expectedTables = [
  "activities",
  "affiliates",
  "api_keys",
  "automation_workflows",
  "campaign_leads",
  "campaigns",
  "contact_tasks",
  "email_accounts",
  "email_logs",
  "email_templates",
  "form_submissions",
  "forms",
  "integrations",
  "invite_codes",
  "leads",
  "meeting_appointments",
  "meeting_event_types",
  "notes",
  "onboarding_progress",
  "pipeline_stages",
  "prospects",
  "referrals",
  "review_requests",
  "review_sources",
  "reviews",
  "segments",
  "sequence_enrollments",
  "sequence_steps",
  "sequences",
  "sso_tokens",
  "sub_accounts",
  "webhooks",
  "white_label_settings",
] as const;

export const defaultPipelineStages = [
  { name: "New", color: "#38bdf8", position: 1 },
  { name: "Contacted", color: "#8b5cf6", position: 2 },
  { name: "Qualified", color: "#f59e0b", position: 3 },
  { name: "Proposal", color: "#3b82f6", position: 4 },
  { name: "Converted", color: "#22c55e", position: 5 },
  { name: "Lost", color: "#ef4444", position: 6 },
] as const;

export const defaultEmailTemplates = [
  {
    name: "Welcome Email",
    subject: "Welcome to {{company}}!",
    category: "onboarding",
    body: "Hi {{firstName}},\n\nWe're thrilled to have you on board. Reply any time if you have questions.\n\nBest,\nThe Team",
    previewText: "Welcome aboard. Here's everything you need to get started.",
  },
  {
    name: "Follow-up After Demo",
    subject: "Great speaking with you, {{firstName}}",
    category: "sales",
    body: "Hi {{firstName}},\n\nThank you for taking the time to see our demo. Are you free for a quick next-steps call this week?\n\nBest,\n{{senderName}}",
    previewText: "Following up on our recent conversation.",
  },
  {
    name: "Cold Outreach",
    subject: "Quick question about {{company}}",
    category: "outreach",
    body: "Hi {{firstName}},\n\nI came across {{company}} and thought there may be a useful fit. Would you be open to a 15-minute call this week?\n\nBest,\n{{senderName}}",
    previewText: "A quick question about your growth.",
  },
  {
    name: "Review Request",
    subject: "How was your experience with us, {{firstName}}?",
    category: "reviews",
    body: "Hi {{firstName}},\n\nWe would love to hear about your experience. Would you mind leaving us a quick review?\n\nThank you,\nThe Team",
    previewText: "Share your experience with a quick review.",
  },
] as const;

export function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required. Use the Supabase Postgres connection string.");
  }
  return url;
}

export function createPool() {
  return new pg.Pool({
    connectionString: getDatabaseUrl(),
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
  });
}

export async function getTableNames(client: pg.PoolClient) {
  const result = await client.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public'",
  );
  return new Set(result.rows.map((row) => row.table_name));
}

export function assertRequiredTables(existing: Set<string>) {
  return expectedTables.filter((table) => !existing.has(table));
}
