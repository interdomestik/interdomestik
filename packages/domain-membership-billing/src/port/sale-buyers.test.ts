import type { TenantTransaction } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readSponsorOutlook,
  resolveEffectiveMembership,
  type SubscriptionRow,
} from '../sponsor-coverage';
import { buyerCoverageFailure } from './sale-buyers';

vi.mock('../sponsor-coverage', () => ({
  readSponsorOutlook: vi.fn(),
  resolveEffectiveMembership: vi.fn(),
}));

const tx = {} as TenantTransaction;
const tenantId = 'test-tenant';
const userId = 'test-member';
const resolve = vi.mocked(resolveEffectiveMembership);
const outlook = vi.mocked(readSponsorOutlook);

describe('buyerCoverageFailure', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resolve.mockResolvedValue(new Map([[userId, { source: 'none' }]]));
    outlook.mockResolvedValue(new Map([[userId, { covering: null, nextStart: null }]]));
  });

  it('fails closed when the linked user is absent from the tenant-scoped result', async () => {
    resolve.mockResolvedValue(new Map());
    await expect(buyerCoverageFailure(tx, tenantId, userId)).resolves.toBe('not_found');
    expect(outlook).not.toHaveBeenCalled();
  });

  it.each([
    ['active', 'already_covered'],
    ['canceled', null],
  ] as const)(
    'checks whether an individual subscription with status %s grants access',
    async (status, failure) => {
      resolve.mockResolvedValue(
        new Map([
          [
            userId,
            {
              source: 'subscription',
              subscription: { status } as SubscriptionRow,
            },
          ],
        ])
      );
      await expect(buyerCoverageFailure(tx, tenantId, userId)).resolves.toBe(failure);
    }
  );

  it('refuses a future accepted seat using the same tenant, buyer and time for both readers', async () => {
    outlook.mockResolvedValue(
      new Map([
        [
          userId,
          {
            covering: null,
            nextStart: new Date('2099-01-01T00:00:00Z'),
          },
        ],
      ])
    );

    await expect(buyerCoverageFailure(tx, tenantId, userId)).resolves.toBe('already_covered');
    const now = resolve.mock.calls[0][3];
    expect(resolve).toHaveBeenCalledExactlyOnceWith(tx, tenantId, [userId], expect.any(Date));
    expect(outlook).toHaveBeenCalledExactlyOnceWith(tx, tenantId, [userId], now);
  });
});
