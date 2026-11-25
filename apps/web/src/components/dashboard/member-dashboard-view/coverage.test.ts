import '@/test/tenant-transaction.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ resolve: vi.fn(), findFirst: vi.fn(), admit: vi.fn() }));
vi.mock('@/lib/privacy/require-member-acceptance', () => ({ requireAdmittedMember: h.admit }));
vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage/resolve', () => ({
  resolveEffectiveMembership: h.resolve,
}));
vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  withTenantContext: (_authority: unknown, callback: (tx: unknown) => unknown) =>
    callback({
      query: { subscriptions: { findFirst: h.findFirst } },
      select: () => ({
        from: () => ({ leftJoin: () => ({ where: () => Promise.resolve([{ count: 0 }]) }) }),
      }),
    }),
}));
vi.mock('next-intl/server', () => ({ getTranslations: vi.fn() }));
import { getDashboardSupplementalData } from './index';
const authority = mintTestTenantAuthority('tenant-ks', { userId: 'me' });

describe('dashboard effective membership reader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.admit.mockResolvedValue({
      ok: true,
      authorized: { authority, session: { user: { id: 'me' } } },
    });
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
    const [subscription, documents, resolved] = await getDashboardSupplementalData();
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
    expect((await getDashboardSupplementalData())[0]).toMatchObject({
      id: 'row',
      status: 'active',
    });
  });
  it('source 3 never grants dashboard membership access', async () => {
    h.resolve.mockResolvedValue(new Map([['me', { source: 'none' }]]));
    expect(await getDashboardSupplementalData()).toEqual([null, 0, true]);
  });
});
