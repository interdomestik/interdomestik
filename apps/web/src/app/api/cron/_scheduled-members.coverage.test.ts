import type { IngressCapability } from '@interdomestik/database/ingress';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import {
  evaluateCoverage,
  type CoverageEntry,
} from '../../../../../../packages/domain-membership-billing/src/sponsor-coverage/evaluate';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ coverage: vi.fn(), scheduled: vi.fn(), ids: [] as string[] }));
vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  listScheduledTenantWork: mocks.scheduled,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: async (_authority: unknown, callback: (tx: unknown) => Promise<unknown>) => {
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: async (limit: number) =>
        mocks.ids.slice(0, limit).map(userId => ({
          userId,
          subId: `${userId}-sub`,
          tenantId: 'tenant-a',
          name: userId,
          email: `${userId}@example.com`,
        })),
    };
    return callback({ select: () => chain });
  },
}));
vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage', () => ({
  effectiveCoverageMembers: mocks.coverage,
}));
vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  inArray: (_column: unknown, ids: string[]) => {
    mocks.ids = ids;
    return {};
  },
}));
// Exercise actual lifecycle rules without importing unrelated billing services.
vi.mock(
  '@interdomestik/domain-membership-billing',
  async () =>
    import('../../../../../../packages/domain-membership-billing/src/subscription/lifecycle-reporting')
);

import { selectActiveSubscriptionMembers } from './_scheduled-members';

const START = new Date('2027-01-01T00:00:00Z');
const END = new Date('2028-01-01T00:00:00Z');
const entry: CoverageEntry = {
  id: 'entry',
  sponsorId: 'sponsor',
  termId: 'term',
  termStart: START,
  termEnd: END,
  terminatedEffectiveAt: null,
  termEffective: true,
  planId: 'plan',
  planKey: 'plan',
  legalEntityId: 'entity',
  conflictDecision: 'accepted',
  revokedAt: null,
  outcome: 'seated',
  startsAt: START,
  handoverPaidUntil: null,
};
const ingress = Object.freeze({}) as IngressCapability<'cron'>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ids = [];
  mocks.scheduled.mockResolvedValue([
    { tenantId: 'tenant-a', authority: mintTestTenantAuthority('tenant-a') },
  ]);
  mocks.coverage.mockImplementation(async (_tx: unknown, _tenantId: string, now: Date) =>
    [
      {
        userId: 'sponsored',
        membership: evaluateCoverage(
          {
            subscription: { provider: 'paddle', status: 'canceled' },
            entries: [entry],
          },
          now
        ),
      },
      {
        userId: 'paddle',
        membership: evaluateCoverage(
          {
            subscription: { provider: 'paddle', status: 'active' },
            entries: [],
          },
          now
        ),
      },
      {
        userId: 'uncovered',
        membership: evaluateCoverage(
          {
            subscription: { provider: 'group_sponsor', status: 'active' },
            entries: [],
          },
          now
        ),
      },
    ].filter(row => row.membership.source !== 'none')
  );
});

describe('scheduled coverage intervals', () => {
  it.each([
    ['before start', new Date(START.getTime() - 1), ['paddle']],
    ['at start', START, ['sponsored', 'paddle']],
    ['last covered instant', new Date(END.getTime() - 1), ['sponsored', 'paddle']],
    ['at end', END, ['paddle']],
  ])('selects source 1 only while covered: %s', async (_label, now, expected) => {
    const rows = await selectActiveSubscriptionMembers({ ingress, limit: 10, now });
    expect(rows.map(row => row.userId)).toEqual(expected);
    expect(mocks.coverage).toHaveBeenCalledWith(expect.anything(), 'tenant-a', now);
  });
});
