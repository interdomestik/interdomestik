import type { TenantTransaction } from '@interdomestik/database';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { prepareNotificationDelivery } from './prepare';
import { delivery } from './run.test-support';

const original = {
  ...delivery({ state: 'claimed', kind: 'staff_member_message' }),
  leaseUntil: '2026-11-22T12:10:00.000Z',
};

function setup(responses: object[][]) {
  const where = vi.fn().mockImplementation(() => {
    const rows = Promise.resolve(responses.shift() ?? []);
    return Object.assign(rows, { for: () => rows });
  });
  const select = vi.fn((_fields: object) => ({ from: () => ({ where }) }));
  const tx = { select } as unknown as TenantTransaction;
  const deps = {
    appOrigin: () => 'https://example.test',
    canStaffReadClaim: vi.fn().mockResolvedValue(false),
  };
  return { tx, deps, select, where };
}

describe('prepareNotificationDelivery', () => {
  it('locks the current lease and short-circuits a delivery over 72 hours old', async () => {
    const h = setup([[{ ...original, stale: true }]]);
    await expect(prepareNotificationDelivery(h.tx, original, h.deps)).resolves.toEqual({
      skip: 'stale',
    });
    expect(h.select).toHaveBeenCalledOnce();
    const fields = h.select.mock.calls[0][0] as { stale: SQL };
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(fields.stale).sql).toBe(
      `"notification_deliveries"."created_at" < clock_timestamp() - interval '72 hours'`
    );
    expect(dialect.sqlToQuery(h.where.mock.calls[0][0]).params).toEqual([
      original.tenantId,
      original.id,
      'claimed',
      original.leaseUntil,
    ]);
  });

  it('skips staff whose access was removed without looking up locale or rendering', async () => {
    const h = setup([
      [{ ...original, stale: false }],
      [
        {
          id: original.recipientUserId,
          role: 'staff',
          branchId: 'previous-branch',
          emailVerified: true,
        },
      ],
      [{ ownerId: 'different-user', category: 'vehicle', claimNumber: 'CLM-1' }],
    ]);
    await expect(prepareNotificationDelivery(h.tx, original, h.deps)).resolves.toEqual({
      skip: 'recipient_out_of_scope',
    });
    expect(h.deps.canStaffReadClaim).toHaveBeenCalledExactlyOnceWith(h.tx, {
      tenantId: original.tenantId,
      claimId: original.claimId,
      userId: original.recipientUserId,
      branchId: 'previous-branch',
    });
    expect(h.select).toHaveBeenCalledTimes(3);
  });
});
