import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";

export const integrationsTable = pgTable("integrations", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  accountIdentifier: text("account_identifier"),
  status: text("status").notNull().default("disconnected"),
  config: jsonb("config").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Integration = typeof integrationsTable.$inferSelect;
