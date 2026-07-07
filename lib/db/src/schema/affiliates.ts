import { pgTable, text, serial, integer, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const affiliatesTable = pgTable("affiliates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  company: text("company"),
  referralCode: text("referral_code").notNull().unique(),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull().default("20.00"),
  status: text("status").notNull().default("active"),
  totalReferrals: integer("total_referrals").notNull().default(0),
  totalConverted: integer("total_converted").notNull().default(0),
  totalEarned: numeric("total_earned", { precision: 10, scale: 2 }).notNull().default("0.00"),
  totalPaid: numeric("total_paid", { precision: 10, scale: 2 }).notNull().default("0.00"),
  payoutMethod: text("payout_method"),
  payoutDetails: text("payout_details"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  affiliateId: integer("affiliate_id").notNull(),
  referredEmail: text("referred_email").notNull(),
  referredName: text("referred_name"),
  referredCompany: text("referred_company"),
  status: text("status").notNull().default("pending"),
  subAccountId: integer("sub_account_id"),
  dealValue: numeric("deal_value", { precision: 10, scale: 2 }),
  commission: numeric("commission", { precision: 10, scale: 2 }),
  commissionPaid: boolean("commission_paid").notNull().default(false),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAffiliateSchema = createInsertSchema(affiliatesTable).omit({
  id: true,
  totalReferrals: true,
  totalConverted: true,
  totalEarned: true,
  totalPaid: true,
  createdAt: true,
  updatedAt: true,
});
export const insertReferralSchema = createInsertSchema(referralsTable).omit({
  id: true,
  commissionPaid: true,
  paidAt: true,
  convertedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type Affiliate = typeof affiliatesTable.$inferSelect;
export type InsertAffiliate = z.infer<typeof insertAffiliateSchema>;
export type Referral = typeof referralsTable.$inferSelect;
export type InsertReferral = z.infer<typeof insertReferralSchema>;
