import { pgTable, text, uuid, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const subAccountsTable = pgTable("sub_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerEmail: text("owner_email").notNull(),
  ownerName: text("owner_name").notNull(),
  phone: text("phone"),
  industry: text("industry"),
  website: text("website"),
  status: text("status").notNull().default("active"),
  plan: text("plan").notNull().default("starter"),
  externalId: text("external_id").unique(),
  leadsCount: integer("leads_count").notNull().default(0),
  campaignsCount: integer("campaigns_count").notNull().default(0),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  healthScore: integer("health_score").notNull().default(100),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const whiteLabelSettingsTable = pgTable("white_label_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  subAccountId: uuid("sub_account_id").notNull().unique(),
  brandName: text("brand_name").notNull().default("VictorySync"),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  primaryColor: text("primary_color").notNull().default("#f97316"),
  accentColor: text("accent_color").notNull().default("#1e293b"),
  customDomain: text("custom_domain"),
  customCss: text("custom_css"),
  supportEmail: text("support_email"),
  supportPhone: text("support_phone"),
  footerText: text("footer_text"),
  hidePoweredBy: boolean("hide_powered_by").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSubAccountSchema = createInsertSchema(subAccountsTable).omit({
  id: true,
  slug: true,
  leadsCount: true,
  campaignsCount: true,
  healthScore: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWhiteLabelSchema = createInsertSchema(whiteLabelSettingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SubAccount = typeof subAccountsTable.$inferSelect;
export type InsertSubAccount = z.infer<typeof insertSubAccountSchema>;
export type WhiteLabelSettings = typeof whiteLabelSettingsTable.$inferSelect;
export type InsertWhiteLabel = z.infer<typeof insertWhiteLabelSchema>;
