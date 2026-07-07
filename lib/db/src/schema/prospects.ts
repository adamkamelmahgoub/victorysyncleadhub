import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const prospectsTable = pgTable("prospects", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  title: text("title"),
  seniority: text("seniority"),
  department: text("department"),
  company: text("company"),
  companySize: text("company_size"),
  industry: text("industry"),
  website: text("website"),
  linkedinUrl: text("linkedin_url"),
  twitterUrl: text("twitter_url"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  technologies: text("technologies").array().default([]),
  keywords: text("keywords").array().default([]),
  emailVerified: boolean("email_verified").notNull().default(false),
  enrichedAt: timestamp("enriched_at", { withTimezone: true }),
  source: text("source").notNull().default("manual"),
  savedToLeads: boolean("saved_to_leads").notNull().default(false),
  leadId: integer("lead_id"),
  intentScore: integer("intent_score").notNull().default(0),
  lastFundingRound: text("last_funding_round"),
  fundingTotal: text("funding_total"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProspectSchema = createInsertSchema(prospectsTable).omit({
  id: true,
  savedToLeads: true,
  enrichedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type Prospect = typeof prospectsTable.$inferSelect;
export type InsertProspect = z.infer<typeof insertProspectSchema>;
