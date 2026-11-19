import * as schema from '@interdomestik/database/schema';
import { getTableColumns, is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';

// Identity keys an input may never carry: the tenant columns always, and for a `self` action every
// column that references a user or a tenant (the same set CHK-05 derives from the schema source).
export const TENANT_IDENTITY_KEYS: ReadonlySet<string> = new Set(['tenantId', 'accessTenantId']);

const OWNER_TABLES = new Set(['user', 'tenants']);

let ownerKeys: ReadonlySet<string> | null = null;

function collectOwnerKeys(): ReadonlySet<string> {
  const keys = new Set<string>(TENANT_IDENTITY_KEYS);
  for (const table of Object.values(schema)) {
    if (!is(table, PgTable)) continue;
    const columns = Object.entries(getTableColumns(table));
    for (const foreignKey of getTableConfig(table).foreignKeys) {
      const reference = foreignKey.reference();
      const target = getTableConfig(reference.foreignTable).name;
      const pointsAtId =
        reference.foreignColumns.length === 1 && reference.foreignColumns[0]?.name === 'id';
      if (!OWNER_TABLES.has(target) || !pointsAtId) continue;
      for (const column of reference.columns) {
        for (const [key, candidate] of columns) if (candidate === column) keys.add(key);
      }
    }
  }
  return keys;
}

/** Property keys of every column with `.references(() => user.id | tenants.id)`, plus the tenant keys. */
export function ownerColumnKeys(): ReadonlySet<string> {
  ownerKeys ??= collectOwnerKeys();
  return ownerKeys;
}
