import { pgTable, text, serial, integer, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  clientAccountId: uuid("client_account_id"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  title: text("title"),
  source: text("source"),
  status: text("status").notNull().default("new"),
  disposition: text("disposition"),
  contactAttempts: integer("contact_attempts").notNull().default(0),
  score: integer("score").notNull().default(0),
  campaignId: integer("campaign_id"),
  formId: integer("form_id"),
  pipelineStageId: integer("pipeline_stage_id"),
  tags: text("tags").array().notNull().default([]),
  customFields: jsonb("custom_fields").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
