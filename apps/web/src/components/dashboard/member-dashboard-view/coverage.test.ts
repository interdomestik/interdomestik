import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ resolve: vi.fn(), findFirst: vi.fn() }));
vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage/resolve', () => ({
  resolveEffectiveMembership: h.resolve,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: (_authority: unknown, callback: (tx: unknown) => unknown) =>
    callback({
      query: { subscriptions: { findFirst: h.findFirst } },
    }),
}));
vi.mock('./data', () => ({ getCachedClaimDocumentCount: async () => 0 }));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));
import { getDashboardSupplementalData } from './index';
const args = { memberId: 'me', authority: mintTestTenantAuthority('tenant-ks') };

describe('dashboard effective membership reader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('source 1 is active despite a canceled Paddle row', async () => {
    h.findFirst.mockResolvedValue({
      id: 'row',
      status: 'canceled',
      planId: 'old',
      provider: 'paddle',
    });
    h.resolve.mockResolvedValue(
      new Map([
        [
          'me',
          {
            source: 'sponsor',
            planId: 'family',
            planKey: 'family-year',
            windowStart: new Date('2026-01-01'),
            windowEnd: new Date('2027-01-01'),
            lifecycle: { status: 'active', cancelAtPeriodEnd: true, gracePeriodEndsAt: null },
          },
        ],
      ])
    );
    const [subscription, documents, resolved] = await getDashboardSupplementalData(args);
    expect(subscription).toMatchObject({
      status: 'active',
      planId: 'family',
      currentPeriodEnd: new Date('2027-01-01'),
    });
    expect(documents).toBe(0);
    expect(resolved).toBe(true);
  });
  it('source 2 preserves an active subscription', async () => {
    h.resolve.mockResolvedValue(
      new Map([
        [
          'me',
          {
            source: 'subscription',
            subscription: { id: 'row', status: 'active', provider: 'paddle' },
          },
        ],
      ])
    );
    expect((await getDashboardSupplementalData(args))[0]).toMatchObject({
      id: 'row',
      status: 'active',
    });
  });
  it('source 3 never grants dashboard membership access', async () => {
    h.resolve.mockResolvedValue(new Map([['me', { source: 'none' }]]));
    expect(await getDashboardSupplementalData(args)).toEqual([null, 0, true]);
  });
});
