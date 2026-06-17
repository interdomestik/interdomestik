import { and, eq, type SQL } from 'drizzle-orm';
import { type PgColumn } from 'drizzle-orm/pg-core';

export type AccessTenantScope = {
  accessTenantId: string;
};

export type AccessTenantTable = {
  accessTenantId: PgColumn;
};

/**
 * Securely scopes a query to a specific tenant.
 *
 * Usage in where clause:
 * where: (table, { eq, and }) => withTenant(tenantId, table.tenantId, eq(table.someCol, value))
 *
 * @deprecated Prefer withTenantContext plus withAccessTenant for tables that
 * carry an explicit accessTenantId column.
 */
export function withTenant(
  tenantId: string,
  tenantColumn: PgColumn | unknown,
  userConditions?: SQL | undefined
): SQL {
  if (!tenantColumn || typeof tenantColumn !== 'object') {
    // Runtime check to prevent accidental usage on tables without tenantId
    // Though static analysis should catch this if typed correctly
    throw new Error('Invalid tenant column provided to withTenant');
  }

  // Cast strictly in implementation
  const tenantCheck = eq(tenantColumn as PgColumn, tenantId);

  return userConditions ? and(tenantCheck, userConditions)! : tenantCheck;
}

export function withAccessTenant(
  context: AccessTenantScope,
  table: AccessTenantTable,
  userConditions?: SQL | undefined
): SQL {
  const accessTenantId = context.accessTenantId.trim();
  if (!accessTenantId) {
    throw new Error('withAccessTenant requires a non-empty accessTenantId');
  }

  const tenantCheck = eq(table.accessTenantId, accessTenantId);
  return userConditions ? and(tenantCheck, userConditions)! : tenantCheck;
}

/**
 * Validates that a record belongs to the expected tenant.
 * Useful for post-query verification (e.g. getById).
 */
export function assertTenant(
  record: { tenantId?: string | null } | null | undefined,
  tenantId: string
) {
  if (!record) return;
  if (!record.tenantId || record.tenantId !== tenantId) {
    throw new Error('Security Violation: Record credential mismatch');
  }
}
