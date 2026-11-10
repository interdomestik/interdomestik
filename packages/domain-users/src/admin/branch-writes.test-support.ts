import type { TenantTransaction } from '@interdomestik/database';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { vi } from 'vitest';

export type Branch = {
  id: string;
  tenantId: string;
  slug: string;
  code: string | null;
  isActive: boolean;
};
const dialect = new PgDialect();
export const tenantId = 'tenant_ks';
export const branch = (id: string, isActive = true, tenant = tenantId): Branch => ({
  id,
  tenantId: tenant,
  slug: id,
  code: null,
  isActive,
});

export function fixture(rows: Branch[] = []) {
  const events: string[] = [];
  const settings: Array<{
    tenantId: string;
    category: string;
    key: string;
    value: Record<string, unknown>;
  }> = [];
  const predicates: SQL[] = [];
  const scopedRows = (where: SQL) => {
    predicates.push(where);
    const query = dialect.sqlToQuery(where);
    const [tenant, value] = query.params;
    return rows.filter(row => {
      if (row.tenantId !== tenant) return false;
      if (query.sql.includes('"is_active"')) return row.isActive === value;
      if (query.sql.includes('"slug"')) return row.slug === value;
      if (query.sql.includes('"code"')) return row.code === value;
      return row.id === value;
    });
  };
  const lock = vi.fn((query: SQL) => {
    predicates.push(query);
    events.push('lock');
    return Promise.resolve([]);
  });
  const values = vi.fn((row: Branch) => {
    events.push('insert');
    rows.push(row);
    return Promise.resolve();
  });
  const update = vi.fn((patch: Partial<Branch>) => ({
    where: (where: SQL) => {
      events.push('update');
      for (const row of scopedRows(where)) Object.assign(row, patch);
      return Promise.resolve();
    },
  }));
  const tx = {
    execute: lock,
    query: {
      tenantSettings: {
        findFirst: vi.fn(({ where }: { where: SQL }) => {
          events.push('setting');
          predicates.push(where);
          const [tenant, category, key] = dialect.sqlToQuery(where).params;
          return Promise.resolve(
            settings.find(
              row => row.tenantId === tenant && row.category === category && row.key === key
            )
          );
        }),
      },
      branches: {
        findMany: vi.fn(({ where }: { where: SQL }) => {
          events.push('active');
          return Promise.resolve(scopedRows(where));
        }),
        findFirst: vi.fn(({ where }: { where: SQL }) => Promise.resolve(scopedRows(where)[0])),
      },
    },
    insert: () => ({ values }),
    update: () => ({ set: update }),
  };
  return {
    tx: tx as unknown as TenantTransaction,
    events,
    rows,
    settings,
    predicates,
    lock,
    values,
    update,
  };
}
