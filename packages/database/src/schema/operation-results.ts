import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { claims } from './claims';
import { tenants } from './tenants';

// A result is inserted in the same transaction as the operation's effects and audit.
// No pending row or success receipt may survive a failed operation transaction.
export const operationResults = pgTable(
  'operation_results',
  {
    operationId: uuid('operation_id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id),
    claimId: text('claim_id')
      .notNull()
      .references(() => claims.id),
    command: text('command').notNull(),
    version: integer('version').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    response: jsonb('response').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    check('operation_results_version_check', sql`${table.version} = 1`),
    check(
      'operation_results_command_check',
      sql`${table.command} in ('m4.ops.assign-owner', 'm4.legacy.assign-claim', 'm4.staff.assign-claim')`
    ),
    check(
      'operation_results_fingerprint_check',
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`
    ),
    check(
      'operation_results_response_check',
      sql`jsonb_typeof(${table.response}) = 'object' and octet_length(${table.response}::text) <= 16384`
    ),
    pgPolicy('operation_results_access_tenant', {
      for: 'all',
      to: 'public',
      using: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
      withCheck: sql`${table.tenantId} = (select current_setting('app.current_access_tenant_id', true))::text`,
    }),
  ]
).enableRLS();
