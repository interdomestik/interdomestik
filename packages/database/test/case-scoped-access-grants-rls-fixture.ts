import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { caseScopedAccessGrants } from '../src/schema';
import {
  grantRlsTestRole,
  quoteIdentifier,
  quoteSqlLiteral,
  TEST_DB_PASSWORD,
  TEST_DB_ROLE,
} from './rls-test-connection';

export const HOME_TENANT_ID = 'tenant_ks';
export const ACCESS_TENANT_ID = 'tenant_mk';
export const REQUIRED_RLS_TABLES = ['case_scoped_access_grants'] as const;

export function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

export async function allowRlsGrantTableAccess(adminDb: {
  execute(query: unknown): Promise<unknown>;
}): Promise<void> {
  await adminDb.execute(
    sql.raw(`
      do $$
      begin
        create role ${quoteIdentifier(TEST_DB_ROLE)} login password ${quoteSqlLiteral(TEST_DB_PASSWORD)};
      exception
        when duplicate_object then
          alter role ${quoteIdentifier(TEST_DB_ROLE)} with login password ${quoteSqlLiteral(TEST_DB_PASSWORD)};
      end
      $$;
    `)
  );
  await grantRlsTestRole(adminDb as Parameters<typeof grantRlsTestRole>[0], REQUIRED_RLS_TABLES);
  await adminDb.execute(
    sql.raw(`grant insert on table "case_scoped_access_grants" to ${quoteIdentifier(TEST_DB_ROLE)}`)
  );
}

export async function assertRejectsDb(
  assertRejects: (
    action: () => Promise<unknown>,
    validator: (error: unknown) => boolean
  ) => Promise<void>,
  action: () => Promise<unknown>,
  code: string
): Promise<void> {
  await assertRejects(action, error => {
    if (typeof error !== 'object' || error === null) return false;
    const directCode = 'code' in error ? error.code : null;
    const cause = 'cause' in error ? error.cause : null;
    const causeCode = cause && typeof cause === 'object' && 'code' in cause ? cause.code : null;
    return directCode === code || causeCode === code;
  });
}

export function userRow(id: string, tenantId: string, now: Date) {
  return {
    id,
    tenantId,
    name: `RLS ${id}`,
    email: `${id}@example.test`,
    emailVerified: true,
    role: 'member' as const,
    createdAt: now,
    updatedAt: now,
  };
}

type GrantInsert = typeof caseScopedAccessGrants.$inferInsert;

export function grantRow(input: {
  id: string;
  actorId: string;
  caseId: string;
  correlationId?: string;
}): GrantInsert {
  return {
    id: input.id,
    tenantId: HOME_TENANT_ID,
    accessTenantId: ACCESS_TENANT_ID,
    caseId: input.caseId,
    actorId: input.actorId,
    documentClasses: ['legal'],
    expiresAt: null,
    revokedAt: null,
    createdById: input.actorId,
    correlationId: input.correlationId ?? uniqueId('rls_corr'),
    createdAt: new Date(),
  };
}
