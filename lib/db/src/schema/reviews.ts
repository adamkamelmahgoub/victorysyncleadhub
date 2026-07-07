import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const reviewSourcesTable = pgTable("review_sources", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),
  name: text("name").notNull(),
  businessId: text("business_id"),
  reviewUrl: text("review_url"),
  config: jsonb("config").notNull().default({}),
  status: text("status").notNull().default("active"),
  reviewCount: integer("review_count").notNull().default(0),
  avgRating: text("avg_rating").notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").references(() => reviewSourcesTable.id),
  platform: text("platform").notNull(),
  reviewer: text("reviewer").notNull(),
  reviewerAvatar: text("reviewer_avatar"),
  rating: integer("rating").notNull(),
  text: text("text"),
  reply: text("reply"),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  platformReviewId: text("platform_review_id"),
  reviewUrl: text("review_url"),
  sentiment: text("sentiment"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reviewRequestsTable = pgTable("review_requests", {
  id: serial("id").primaryKey(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  channel: text("channel").notNull().default("email"),
  platform: text("platform").notNull().default("google"),
  status: text("status").notNull().default("sent"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),
});

export type Review = typeof reviewsTable.$inferSelect;
export type ReviewSource = typeof reviewSourcesTable.$inferSelect;
