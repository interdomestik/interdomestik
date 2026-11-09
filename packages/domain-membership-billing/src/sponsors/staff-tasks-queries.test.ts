import { auditLog, type TenantTransaction } from '@interdomestik/database';
import { PgDialect } from 'drizzle-orm/pg-core';
import { type SQL } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { readScheduleConfirmations } from './staff-tasks-queries';

describe('staff-task schedule confirmation reader', () => {
  it('reads valid attempt confirmations in one tenant-scoped statement', async () => {
    const where = vi.fn(async (predicate: SQL) => {
      const query = new PgDialect().sqlToQuery(predicate);
      expect(query.params).toEqual([
        'tenant',
        'sponsor_intent.schedule_confirmed',
        'sponsor_handover_intent',
      ]);
      expect(query.sql).toContain('"audit_log"."tenant_id" =');
      return [
        { intentId: 'intent', metadata: { afterAttempt: 6 } },
        { intentId: 'other', metadata: { afterAttempt: 3 } },
        { intentId: null, metadata: { afterAttempt: 6 } },
        ...[
          null,
          {},
          { afterAttempt: '6' },
          { afterAttempt: 1.5 },
          { afterAttempt: -1 },
          { afterAttempt: 0 },
          { afterAttempt: Number.MAX_SAFE_INTEGER + 1 },
        ].map(metadata => ({
          intentId: 'malformed',
          metadata,
        })),
      ];
    });
    const from = vi.fn((table: unknown) => {
      expect(table).toBe(auditLog);
      return { where };
    });
    const select = vi.fn(() => ({ from }));
    const tx = { select } as unknown as TenantTransaction;
    await expect(readScheduleConfirmations(tx, 'tenant')).resolves.toEqual([
      { intentId: 'intent', afterAttempt: 6 },
      { intentId: 'other', afterAttempt: 3 },
    ]);
    expect(select).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
  });
});
