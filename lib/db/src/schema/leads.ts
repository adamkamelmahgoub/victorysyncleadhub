import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  jsonb,
  uuid,
  boolean,
  numeric,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const outreachVerificationStatus = pgEnum('outreach_verification_status', ['valid','risky','invalid','unverified']);
export const outreachDisposition = pgEnum("outreach_disposition", [
  "no_answer",
  "voicemail",
  "gatekeeper",
  "wrong_number",
  "not_interested",
  "callback_scheduled",
  "meeting_booked",
  "dnc",
]);
export const outreachSuppressionReason = pgEnum("outreach_suppression_reason", [
  "dnc",
  "unsubscribed",
  "bounced_hard",
  "manual_exclude",
]);
export const outreachTimezone = pgEnum("outreach_timezone", [
  "Etc/UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Adak",
  "Pacific/Honolulu",
  "America/Detroit",
  "America/Indiana/Indianapolis",
  "America/Indiana/Knox",
  "America/Indiana/Tell_City",
  "America/Indiana/Marengo",
  "America/Indiana/Petersburg",
  "America/Indiana/Vevay",
  "America/Indiana/Vincennes",
  "America/Indiana/Winamac",
  "America/Kentucky/Louisville",
  "America/Kentucky/Monticello",
  "America/Menominee",
  "America/North_Dakota/Beulah",
  "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem",
]);

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  clientAccountId: uuid("client_account_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  emailVerificationStatus: outreachVerificationStatus('email_verification_status').notNull().default('unverified'),
  verifiedAt: timestamp('verified_at', {withTimezone:true}),
  verifiedEmail: text('verified_email'),
  phone: text("phone"),
  company: text("company"),
  title: text("title"),
  source: text("source"),
  status: text("status").notNull().default("new"),
  disposition: outreachDisposition("disposition"),
  contactAttempts: integer("contact_attempts").notNull().default(0),
  // SQL migration owns enum/check constraints, generated identity columns, and write guards.
  timezone: outreachTimezone("timezone").notNull().default("Etc/UTC"),
  timezoneConfirmed: boolean("timezone_confirmed").notNull().default(false),
  nextActionAt: timestamp("next_action_at", {
    withTimezone: true,
  }).defaultNow(),
  attemptCount: integer("attempt_count").notNull().default(0),
  firstAttemptAt: timestamp("first_attempt_at", { withTimezone: true }),
  revisitAt: timestamp("revisit_at", { withTimezone: true }),
  dnc: boolean("dnc").notNull().default(false),
  suppressedReason: outreachSuppressionReason("suppressed_reason"),
  avgJobValue: numeric("avg_job_value", { precision: 14, scale: 2 }),
  missedCallsPerWeek: integer("missed_calls_per_week"),
  afterHoursCoverage: text("after_hours_coverage"),
  usesAnsweringService: boolean("uses_answering_service"),
  score: integer("score").notNull().default(0),
  campaignId: integer("campaign_id"),
  formId: integer("form_id"),
  pipelineStageId: integer("pipeline_stage_id"),
  tags: text("tags").array().notNull().default([]),
  customFields: jsonb("custom_fields").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertLeadSchema = createInsertSchema(leadsTable)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .superRefine((lead, ctx) => {
    if (
      lead.nextActionAt === null &&
      !["wrong_number", "not_interested", "dnc"].includes(
        lead.disposition ?? "",
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["nextActionAt"],
        message: "A non-terminal lead requires a next action",
      });
    }
  });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
