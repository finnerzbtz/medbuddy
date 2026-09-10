import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  bigint,
  jsonb,
  timestamp,
  primaryKey,
  foreignKey,
  index,
  pgPolicy,
} from 'drizzle-orm/pg-core';

// Auth users are managed by Neon. The FK is installed by our custom migration.
export const accounts = pgTable(
  'reminduh_accounts',
  {
    userId: uuid('user_id').primaryKey(),
    revision: bigint('revision', { mode: 'number' }).notNull().default(0),
    settings: jsonb('settings').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    pgPolicy('account_owner_read', {
      for: 'select',
      to: 'authenticated',
      using: sql`${t.userId} = (select auth.user_id())::uuid`,
    }),
  ],
).enableRLS();

export const medications = pgTable(
  'reminduh_medications',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => accounts.userId, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    name: text('name').notNull(),
    details: jsonb('details').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    pgPolicy('medication_owner_read', {
      for: 'select',
      to: 'authenticated',
      using: sql`${t.userId} = (select auth.user_id())::uuid`,
    }),
  ],
).enableRLS();

export const checkIns = pgTable(
  'reminduh_check_ins',
  {
    userId: uuid('user_id').notNull(),
    id: text('id').notNull(),
    medicationId: text('medication_id').notNull(),
    status: text('status').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    details: jsonb('details').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    foreignKey({
      columns: [t.userId, t.medicationId],
      foreignColumns: [medications.userId, medications.id],
    }).onDelete('cascade'),
    index('check_ins_user_date').on(t.userId, t.recordedAt),
    pgPolicy('check_in_owner_read', {
      for: 'select',
      to: 'authenticated',
      using: sql`${t.userId} = (select auth.user_id())::uuid`,
    }),
  ],
).enableRLS();
