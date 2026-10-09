import type { TenantTransaction } from '@interdomestik/database';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import { vi } from 'vitest';

export type Compiled = { sql: string; params: unknown[] };

/**
 * Real drizzle builders; awaiting a query records its SQL and yields the next scripted result.
 * An Error entry rejects the awaited query instead of resolving it.
 */
export function createRecordingTenantTransaction(results: Array<unknown[] | Error>) {
  const builder = new QueryBuilder();
  const executed: Compiled[] = [];

  function record<T extends object>(target: T): T {
    const proxy: T = new Proxy(target, {
      get(obj, prop) {
        if (prop === 'then') {
          return (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
            executed.push((obj as unknown as { toSQL(): Compiled }).toSQL());
            const next = results.shift() ?? [];
            if (next instanceof Error) reject(next);
            else resolve(next);
          };
        }
        const value: unknown = Reflect.get(obj, prop, obj);
        if (typeof value !== 'function' || typeof prop === 'symbol' || prop === 'constructor') {
          return value;
        }
        return (...args: unknown[]) => {
          const out: unknown = Reflect.apply(value, obj, args);
          if (out === obj) return proxy;
          return out !== null && typeof out === 'object' && ('where' in out || 'from' in out)
            ? record(out)
            : out;
        };
      },
    });
    return proxy;
  }

  const select = vi.fn((fields?: Record<string, unknown>) =>
    record(fields ? builder.select(fields as never) : builder.select())
  );
  return { tx: { select } as unknown as TenantTransaction, select, executed };
}
