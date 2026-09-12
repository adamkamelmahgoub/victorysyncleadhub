import { pgTable, pgEnum, uuid, jsonb, numeric, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import {sendingDomainsTable} from './sending-domains';
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const outreachMailboxStatus = pgEnum('outreach_mailbox_status', ['warming','active','paused','burned']);
export const emailAccountsTable = pgTable("email_accounts", {
  id: serial("id").primaryKey(),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email").notNull(),
  smtpHost: text("smtp_host").notNull(),
  smtpPort: integer("smtp_port").notNull().default(587),
  smtpUser: text("smtp_user").notNull(),
  smtpPassword: text("smtp_password").notNull(),
  sendingDomainId: uuid('sending_domain_id').references(()=>sendingDomainsTable.id),
  provider: text('provider').notNull().default('smtp'),
  dailyCap: integer('daily_cap').notNull().default(30),
  mailboxTimezone: text('mailbox_timezone').notNull().default('America/New_York'),
  warmupStartedAt: timestamp('warmup_started_at', {withTimezone:true}).notNull().defaultNow(),
  status: outreachMailboxStatus('status').notNull().default('warming'),
  emailEngineEnabled: boolean('email_engine_enabled').notNull().default(false),
  rotationCredit: numeric('rotation_credit').notNull().default('0'),
  nextSendAfter: timestamp('next_send_after', {withTimezone:true}).notNull().defaultNow(),
  inboundProvider: text('inbound_provider').notNull().default('disabled'),
  inboundCredentials: text('inbound_credentials'),
  inboxConfiguredAt: timestamp('inbox_configured_at', {withTimezone:true}),
  inboxCheckedAt: timestamp('inbox_checked_at', {withTimezone:true}),
  inboxCursor: jsonb('inbox_cursor').notNull().default({}),
  inboxPollAfter: timestamp('inbox_poll_after', {withTimezone:true}).notNull().defaultNow(),
  inboxPollToken: uuid('inbox_poll_token'),
  inboxLockedAt: timestamp('inbox_locked_at', {withTimezone:true}),
  isDefault: boolean("is_default").notNull().default(false),
  dailyLimit: integer("daily_limit").notNull().default(100),
  sentToday: integer("sent_today").notNull().default(0),
  lastSentResetAt: timestamp("last_sent_reset_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEmailAccountSchema = createInsertSchema(emailAccountsTable).omit({
  id: true,
  sentToday: true,
  lastSentResetAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmailAccount = z.infer<typeof insertEmailAccountSchema>;
export type EmailAccount = typeof emailAccountsTable.$inferSelect;
