import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { leadsTable } from "./leads";

export const contactTasksTable = pgTable("contact_tasks", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  priority: text("priority").notNull().default("medium"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ContactTask = typeof contactTasksTable.$inferSelect;
