import { pgTable, text, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const automationsTable = pgTable("automations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  triggerType: text("trigger_type").notNull().default("contact_created"),
  triggerConfig: jsonb("trigger_config").notNull().default({}),
  actions: jsonb("actions").notNull().default([]),
  isActive: boolean("is_active").notNull().default(false),
  enrolledCount: integer("enrolled_count").notNull().default(0),
  completedCount: integer("completed_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Automation = typeof automationsTable.$inferSelect;
