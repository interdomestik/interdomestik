import { describe, expect, it } from 'vitest';

import { forEachBatchedUsers } from './cron-service';

describe('forEachBatchedUsers', () => {
  it('iterates batches and stops on empty batch', async () => {
    const seenAfterIds: Array<string | null> = [];

    const batches: Array<
      Array<{ id: string; email: string | null; name: string | null; tenantId: string | null }>
    > = [
      [
        { id: 'u1', email: 'u1@example.com', name: 'U1', tenantId: 'tenant_mk' },
        { id: 'u2', email: 'u2@example.com', name: 'U2', tenantId: 'tenant_mk' },
      ],
      [{ id: 'u3', email: 'u3@example.com', name: 'U3', tenantId: 'tenant_mk' }],
      [],
    ];

    let call = 0;

    const result = await forEachBatchedUsers({
      fetchBatch: async afterId => {
        seenAfterIds.push(afterId);
        return batches[call++] ?? [];
      },
      onBatch: async () => {},
    });

    expect(seenAfterIds).toEqual([null, 'u2', 'u3']);
    expect(result).toEqual({ batches: 2, totalUsers: 3, lastAfterId: 'u3' });
  });

  it('throws if maxBatches is exceeded (infinite-loop protection)', async () => {
    await expect(
      forEachBatchedUsers({
        fetchBatch: async () => [
          { id: 'u1', email: 'u1@example.com', name: 'U1', tenantId: 'tenant_mk' },
        ],
        onBatch: async () => {},
        maxBatches: 3,
      })
    ).rejects.toThrow(/Exceeded maxBatches=3/);
  });
});
