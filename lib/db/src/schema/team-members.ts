import { pgTable, text, serial, uuid, timestamp } from "drizzle-orm/pg-core";

export const teamMembersTable = pgTable("team_members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  authUserId: text("auth_user_id").unique(),
  role: text("role").notNull().default("member"),
  clientAccountId: uuid("client_account_id"),
  status: text("status").notNull().default("invited"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TeamMember = typeof teamMembersTable.$inferSelect;
