import { pgTable, text, serial, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const emailTemplatesTable = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  previewText: text("preview_text"),
  category: text("category").notNull().default("general"),
  tags: jsonb("tags").notNull().default([]),
  isDefault: boolean("is_default").notNull().default(false),
  useCount: serial("use_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailTemplate = typeof emailTemplatesTable.$inferSelect;
