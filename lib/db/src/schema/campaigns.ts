import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  sourceType: text("source_type"),
  // Email composition
  subject: text("subject"),
  fromName: text("from_name"),
  fromEmail: text("from_email"),
  body: text("body"),
  // Sending controls
  sendRatePerHour: integer("send_rate_per_hour").notNull().default(20),
  dailyLimit: integer("daily_limit").notNull().default(100),
  sendWindowStart: text("send_window_start").notNull().default("09:00"),
  sendWindowEnd: text("send_window_end").notNull().default("17:00"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  launchedAt: timestamp("launched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
