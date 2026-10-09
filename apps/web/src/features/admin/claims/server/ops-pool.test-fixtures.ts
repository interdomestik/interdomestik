import type { TenantTransaction } from '@interdomestik/database';
import { vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withTenantContext: vi.fn(),
  captureException: vi.fn(),
  globalDbReads: [] as string[],
}));

// Any access to the imported global handles is a defect: reads must use the callback tx.
vi.mock('@interdomestik/database', async () => {
  const schema = await vi.importActual<typeof import('@interdomestik/database/schema')>(
    '@interdomestik/database/schema'
  );
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
  return {
    claims: schema.claims,
    db: forbidden,
    dbRls: forbidden,
    withTenantContext: hoisted.withTenantContext,
  };
});

vi.mock('@sentry/nextjs', () => ({ captureException: hoisted.captureException }));

export { hoisted };

/**
 * Runs every withTenantContext call on the given tx and tracks transaction lifetimes,
 * so tests can prove transactions never overlap (a max-1 pool would deadlock on nesting).
 */
export function runInTx(tx: TenantTransaction) {
  const contexts: unknown[] = [];
  const events: Array<'open' | 'close'> = [];
  let active = 0;
  let maxActive = 0;
  hoisted.withTenantContext.mockImplementation(
    async (context: unknown, callback: (tx: TenantTransaction) => Promise<unknown>) => {
      contexts.push(context);
      active += 1;
      maxActive = Math.max(maxActive, active);
      events.push('open');
      try {
        return await callback(tx);
      } finally {
        active -= 1;
        events.push('close');
      }
    }
  );
  return { contexts, events, getMaxActive: () => maxActive };
}
