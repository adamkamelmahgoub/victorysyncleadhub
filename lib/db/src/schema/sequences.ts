import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sequencesTable = pgTable("sequences", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  emailAccountId: integer("email_account_id"),
  totalEnrolled: integer("total_enrolled").notNull().default(0),
  totalSent: integer("total_sent").notNull().default(0),
  totalOpened: integer("total_opened").notNull().default(0),
  totalReplied: integer("total_replied").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const sequenceStepsTable = pgTable("sequence_steps", {
  id: serial("id").primaryKey(),
  sequenceId: integer("sequence_id").notNull(),
  stepNumber: integer("step_number").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  delayDays: integer("delay_days").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const sequenceEnrollmentsTable = pgTable("sequence_enrollments", {
  id: serial("id").primaryKey(),
  sequenceId: integer("sequence_id").notNull(),
  leadId: integer("lead_id").notNull(),
  currentStep: integer("current_step").notNull().default(1),
  status: text("status").notNull().default("active"),
  nextSendAt: timestamp("next_send_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSequenceSchema = createInsertSchema(sequencesTable).omit({
  id: true,
  totalEnrolled: true,
  totalSent: true,
  totalOpened: true,
  totalReplied: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSequenceStepSchema = createInsertSchema(sequenceStepsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertSequenceEnrollmentSchema = createInsertSchema(sequenceEnrollmentsTable).omit({
  id: true,
  currentStep: true,
  status: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSequence = z.infer<typeof insertSequenceSchema>;
export type Sequence = typeof sequencesTable.$inferSelect;
export type InsertSequenceStep = z.infer<typeof insertSequenceStepSchema>;
export type SequenceStep = typeof sequenceStepsTable.$inferSelect;
export type InsertSequenceEnrollment = z.infer<typeof insertSequenceEnrollmentSchema>;
export type SequenceEnrollment = typeof sequenceEnrollmentsTable.$inferSelect;
