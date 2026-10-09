import type { TenantTransaction } from '@interdomestik/database';
import { vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withTenantContext: vi.fn(),
  globalDbReads: [] as string[],
}));

vi.mock('@interdomestik/database', () => {
  const forbidden = new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === 'symbol' || prop === 'then') return undefined;
        hoisted.globalDbReads.push(String(prop));
        throw new Error(`global database handle used: ${String(prop)}`);
      },
    }
  );
  return { db: forbidden, dbRls: forbidden, withTenantContext: hoisted.withTenantContext };
});

import { createRecordingTenantTransaction } from '@/test/recording-tenant-transaction';

export { hoisted };

export function createRecordingTx(results: Array<unknown[] | Error>) {
  const { tx, select, executed } = createRecordingTenantTransaction(results);
  hoisted.withTenantContext.mockImplementation(
    async (_context: unknown, callback: (tx: TenantTransaction) => Promise<unknown>) => callback(tx)
  );
  return { executed, select };
}

export function ctx(userRole: string, branchId: string | null = null) {
  return { tenantId: 'tenant-ks', userRole, scope: { branchId } };
}
