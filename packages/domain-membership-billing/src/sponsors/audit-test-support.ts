import { auditLog, type TenantTransaction } from '@interdomestik/database';
import { expect, vi } from 'vitest';

import type { SponsorAuditEvent } from './audit';

type Row = Record<string, unknown>;
type Write = { table: unknown; values: Row | Row[] };

/** Executes the real audit writer against a transaction double, without a database. */
export function auditTransaction(
  options: {
    selects?: Row[][];
    inserted?: Row[][];
    updated?: Row[][];
    failAudit?: boolean;
  } = {}
): {
  tx: TenantTransaction;
  writes: Write[];
  audits: () => Row[];
  auditBatches: () => Write[];
} {
  const selects = [...(options.selects ?? [])];
  const inserted = [...(options.inserted ?? [])];
  const updated = [...(options.updated ?? [])];
  const writes: Write[] = [];
  const query = (rows: Row[], write?: Write): object => {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      for: vi.fn(() => chain),
      onConflictDoNothing: vi.fn(() => chain),
      returning: vi.fn(() => chain),
      then: (resolve: (value: Row[]) => unknown, reject: (error: Error) => unknown) => {
        if (write?.table === auditLog && options.failAudit) {
          return Promise.reject(new Error('audit unavailable')).then(resolve, reject);
        }
        if (write) writes.push(write);
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return chain;
  };
  const tx = {
    select: vi.fn(() => query(selects.shift() ?? [])),
    selectDistinct: vi.fn(() => query(selects.shift() ?? [])),
    insert: vi.fn((table: unknown) => ({
      values: (values: Row | Row[]) =>
        query(
          table === auditLog
            ? []
            : (inserted.shift() ?? (Array.isArray(values) ? values : [values])),
          { table, values }
        ),
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: Row) => query(updated.shift() ?? [], { table, values }),
    })),
  } as unknown as TenantTransaction;
  const auditBatches = (): Write[] => writes.filter(write => write.table === auditLog);
  return {
    tx,
    writes,
    auditBatches,
    audits: () =>
      auditBatches().flatMap(write =>
        Array.isArray(write.values) ? write.values : [write.values]
      ),
  };
}

/** Exact metadata allowlists also catch accidental copying of input names, addresses or tokens. */
export function expectAudits(
  db: ReturnType<typeof auditTransaction>,
  events: SponsorAuditEvent[],
  privateValues: string[] = []
): void {
  expect(db.audits()).toEqual(
    events.map(event => ({
      ...event,
      id: expect.stringMatching(/^aud_/u),
      tenantId: 'tenant',
      metadata: event.metadata ?? {},
    }))
  );
  for (const event of db.audits()) {
    for (const value of Object.values(event.metadata as Row)) {
      if (typeof value !== 'string') continue;
      expect(value).not.toMatch(/[^\s@]+@[^\s@]+\.[^\s@]+/u);
      for (const personal of privateValues) expect(value).not.toContain(personal);
    }
  }
}
