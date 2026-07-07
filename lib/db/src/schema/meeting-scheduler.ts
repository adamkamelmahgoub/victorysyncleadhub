import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const meetingEventTypesTable = pgTable("meeting_event_types", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  color: text("color").notNull().default("#f97316"),
  location: text("location"),
  isActive: boolean("is_active").notNull().default(true),
  requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
  bufferBefore: integer("buffer_before").notNull().default(0),
  bufferAfter: integer("buffer_after").notNull().default(15),
  maxBookingsPerDay: integer("max_bookings_per_day"),
  questions: jsonb("questions").default([]),
  availableDays: text("available_days").array().notNull().default(["mon", "tue", "wed", "thu", "fri"]),
  availableStart: text("available_start").notNull().default("09:00"),
  availableEnd: text("available_end").notNull().default("17:00"),
  timezone: text("timezone").notNull().default("America/New_York"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const bookingAppointmentsTable = pgTable("booking_appointments", {
  id: serial("id").primaryKey(),
  eventTypeId: integer("event_type_id").notNull(),
  guestName: text("guest_name").notNull(),
  guestEmail: text("guest_email").notNull(),
  guestPhone: text("guest_phone"),
  guestCompany: text("guest_company"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  status: text("status").notNull().default("confirmed"),
  notes: text("notes"),
  answers: jsonb("answers").default({}),
  meetingLink: text("meeting_link"),
  cancelReason: text("cancel_reason"),
  leadId: integer("lead_id"),
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMeetingEventTypeSchema = createInsertSchema(meetingEventTypesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertBookingSchema = createInsertSchema(bookingAppointmentsTable).omit({
  id: true,
  status: true,
  reminderSentAt: true,
  createdAt: true,
  updatedAt: true,
});

export type MeetingEventType = typeof meetingEventTypesTable.$inferSelect;
export type InsertMeetingEventType = z.infer<typeof insertMeetingEventTypeSchema>;
export type BookingAppointment = typeof bookingAppointmentsTable.$inferSelect;
export type InsertBooking = z.infer<typeof insertBookingSchema>;
