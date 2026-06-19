import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { claims } from './claims';
import { tenants } from './tenants';

export const caseScopedAccessDocumentClasses = [
  'correspondence',
  'contract',
  'evidence',
  'legal',
  'receipt',
] as const;

export type CaseScopedAccessDocumentClass = (typeof caseScopedAccessDocumentClasses)[number];

export const caseScopedAccessGrants = pgTable(
  'case_scoped_access_grants',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    accessTenantId: text('access_tenant_id')
      .notNull()
      .references(() => tenants.id),
    caseId: text('case_id')
      .notNull()
      .references(() => claims.id),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id),
    documentClasses: text('document_classes')
      .array()
      .$type<CaseScopedAccessDocumentClass[]>()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdById: text('created_by_id')
      .notNull()
      .references(() => user.id),
    correlationId: text('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('case_scoped_access_grants_active_uq')
      .on(table.tenantId, table.accessTenantId, table.caseId, table.actorId)
      .where(sql`${table.revokedAt} is null`),
    uniqueIndex('case_scoped_access_grants_correlation_uq').on(table.tenantId, table.correlationId),
    index('case_scoped_access_grants_access_idx').on(table.accessTenantId, table.actorId),
    index('case_scoped_access_grants_case_idx').on(table.tenantId, table.caseId),
    check(
      'case_scoped_access_grants_document_classes_check',
      sql`array_length(${table.documentClasses}, 1) > 0
        and ${table.documentClasses} <@ array['correspondence','contract','evidence','legal','receipt']::text[]`
    ),
  ]
);
