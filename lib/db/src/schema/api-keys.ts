import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  scopes: text("scopes").array().notNull().default([]),
  subAccountId: integer("sub_account_id"),
  createdBy: text("created_by").notNull().default("admin"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  requestCount: integer("request_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const ssoTokensTable = pgTable("sso_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  subAccountId: integer("sub_account_id").notNull(),
  externalUserId: text("external_user_id").notNull(),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role").notNull().default("member"),
  usedAt: timestamp("used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertApiKeySchema = createInsertSchema(apiKeysTable).omit({
  id: true,
  keyHash: true,
  keyPrefix: true,
  lastUsedAt: true,
  requestCount: true,
  createdAt: true,
  updatedAt: true,
});

export type ApiKey = typeof apiKeysTable.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type SsoToken = typeof ssoTokensTable.$inferSelect;
