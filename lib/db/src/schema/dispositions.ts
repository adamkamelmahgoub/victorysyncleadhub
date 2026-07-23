import { pgTable, text, serial, boolean, timestamp } from "drizzle-orm/pg-core";

export const dispositionsTable = pgTable("dispositions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#f97316"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Disposition = typeof dispositionsTable.$inferSelect;
