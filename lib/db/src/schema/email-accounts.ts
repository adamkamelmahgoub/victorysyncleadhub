import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailAccountsTable = pgTable("email_accounts", {
  id: serial("id").primaryKey(),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email").notNull(),
  smtpHost: text("smtp_host").notNull(),
  smtpPort: integer("smtp_port").notNull().default(587),
  smtpUser: text("smtp_user").notNull(),
  smtpPassword: text("smtp_password").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  dailyLimit: integer("daily_limit").notNull().default(100),
  sentToday: integer("sent_today").notNull().default(0),
  lastSentResetAt: timestamp("last_sent_reset_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEmailAccountSchema = createInsertSchema(emailAccountsTable).omit({
  id: true,
  sentToday: true,
  lastSentResetAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmailAccount = z.infer<typeof insertEmailAccountSchema>;
export type EmailAccount = typeof emailAccountsTable.$inferSelect;
