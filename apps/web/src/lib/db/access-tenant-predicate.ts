import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

type AccessTenantColumns = {
  accessTenantId: SQLWrapper;
  tenantId: SQLWrapper;
};

export function matchesAccessTenant(table: AccessTenantColumns, accessTenantId: string): SQL {
  return sql`(
    ${table.accessTenantId} = ${accessTenantId}
    OR (${table.accessTenantId} IS NULL AND ${table.tenantId} = ${accessTenantId})
  )`;
}
