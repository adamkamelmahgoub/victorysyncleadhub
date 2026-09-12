import {pgTable,pgEnum,text,uuid,boolean,timestamp} from 'drizzle-orm/pg-core';

export const outreachDomainStatus = pgEnum('outreach_domain_status', ['warming','active','burned']);
export const sendingDomainsTable = pgTable('sending_domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  domain: text('domain').notNull().unique(),
  isPrimary: boolean('is_primary').notNull().default(false),
 allowPrimarySending: boolean('allow_primary_sending').notNull().default(false),
 deletedAt: timestamp('deleted_at', {withTimezone:true}),
 spfHost: text('spf_host'),
  spfVerified: boolean('spf_verified').notNull().default(false),
  dkimVerified: boolean('dkim_verified').notNull().default(false),
  dmarcVerified: boolean('dmarc_verified').notNull().default(false),
  dkimSelector: text('dkim_selector').notNull().default('default'),
  status: outreachDomainStatus('status').notNull().default('warming'),
  verifiedAt: timestamp('verified_at', {withTimezone:true}),
  createdAt: timestamp('created_at', {withTimezone:true}).notNull().defaultNow(),
});
