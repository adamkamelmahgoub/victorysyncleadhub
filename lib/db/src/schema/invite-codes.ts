import { integer, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const inviteCodesTable = pgTable("invite_codes", {
  id: serial("id").primaryKey(),
  codeHash: text("code_hash").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"),
  clientAccountId: uuid("client_account_id"),
  teamMemberId: integer("team_member_id"),
  createdBy: text("created_by").notNull().default("admin"),
  usedByUserId: text("used_by_user_id"),
  usedAt: timestamp("used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InviteCode = typeof inviteCodesTable.$inferSelect;
