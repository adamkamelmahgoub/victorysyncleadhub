import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const segmentsTable = pgTable("segments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  filters: jsonb("filters").notNull().default({}),
  contactCount: integer("contact_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Segment = typeof segmentsTable.$inferSelect;
