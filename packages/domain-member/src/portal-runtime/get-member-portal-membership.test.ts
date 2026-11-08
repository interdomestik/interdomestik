import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const h = vi.hoisted(() => ({
  find: vi.fn(),
  resolve: vi.fn(),
  scope: vi.fn(),
  eq: vi.fn((...pair: unknown[]) => pair),
  authSession: vi.fn(),
  requestValues: new Map(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../../../apps/web/src/lib/auth.server', () => ({
  getCachedSession: () => {
    if (!h.requestValues.has(h.authSession)) {
      h.requestValues.set(h.authSession, h.authSession());
    }
    return h.requestValues.get(h.authSession);
  },
}));

const MEMBER_CONTEXT_MODULE = new URL(
  '../../../../apps/web/src/components/shell/member-portal-context.ts',
  import.meta.url
).href;

vi.mock('@interdomestik/database/tenant-authority', () => ({
  readTenantAuthority: (authority: { tenantId: string }) => authority,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: h.scope,
}));
vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage', () => ({
  resolveEffectiveMembership: h.resolve,
}));
vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  and: (...parts: unknown[]) => parts,
  eq: h.eq,
}));

import { getMemberPortalMembership } from './get-member-portal-membership';

const authority = { tenantId: 'tenant-1' } as never;
const get = () =>
  getMemberPortalMembership({
    authority,
    memberId: 'member-1',
    now: new Date('2026-08-28T12:00:00.000Z'),
  });

describe('getMemberPortalMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.find.mockResolvedValue(null);
    h.resolve.mockImplementation(async () => {
      const subscription = await h.find();
      return new Map([
        [
          'member-1',
          subscription && subscription.provider !== 'group_sponsor'
            ? { source: 'subscription', subscription }
            : { source: 'none' },
        ],
      ]);
    });
    h.scope.mockImplementation(async (_context, action) =>
      action({ query: { subscriptions: { findFirst: h.find } } })
    );
  });

  it('reads once under the session authority for its tenant and member', async () => {
    await expect(get()).resolves.toEqual({
      bucket: 'none',
      currentPeriodEnd: null,
      grantsNewCaseAccess: false,
    });
    expect(h.scope).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(h.find).toHaveBeenCalledTimes(1);
    expect(h.resolve).toHaveBeenCalledWith(
      expect.any(Object),
      'tenant-1',
      ['member-1'],
      new Date('2026-08-28T12:00:00.000Z')
    );
  });

  it.each([
    [{ status: 'active' }, 'active', true],
    [{ status: 'trialing' }, 'trialing', true],
    [{ status: 'past_due', gracePeriodEndsAt: new Date('2026-08-29') }, 'active_in_grace', true],
    [{ status: 'past_due', gracePeriodEndsAt: new Date('2026-08-27') }, 'grace_expired', false],
    [{ status: 'active', cancelAtPeriodEnd: true }, 'scheduled_cancel', true],
    [{ status: 'canceled' }, 'canceled', false],
    [{ status: 'paused' }, 'canceled', false],
    [{ status: 'expired' }, 'canceled', false],
  ] as const)(
    'uses the canonical lifecycle access consequence for %o',
    async (subscription, bucket, grantsNewCaseAccess) => {
      h.find.mockResolvedValueOnce(subscription);
      await expect(get()).resolves.toEqual({
        bucket,
        currentPeriodEnd: null,
        grantsNewCaseAccess,
      });
    }
  );

  it('returns the factual current-period end without offer or provider metadata', async () => {
    const currentPeriodEnd = new Date('2026-12-31T23:59:59.000Z');
    h.find.mockResolvedValueOnce({
      currentPeriodEnd,
      planId: 'standard-year',
      providerSubscriptionId: 'sub_private',
      status: 'active',
    });

    await expect(get()).resolves.toEqual({
      bucket: 'active',
      currentPeriodEnd,
      grantsNewCaseAccess: true,
    });
  });

  it('propagates read failures', async () => {
    h.find.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(get()).rejects.toThrow('database unavailable');
  });

  it.each([true, false])(
    'uses sponsor lifecycle and current term end (cancel=%s)',
    async cancelAtPeriodEnd => {
      const currentPeriodEnd = new Date('2026-12-31');
      h.resolve.mockResolvedValueOnce(
        new Map([
          [
            'member-1',
            {
              source: 'sponsor',
              windowEnd: currentPeriodEnd,
              coverageEnd: new Date('2027-12-31'),
              lifecycle: { status: 'active', cancelAtPeriodEnd, gracePeriodEndsAt: null },
            },
          ],
        ])
      );
      await expect(get()).resolves.toEqual({
        bucket: cancelAtPeriodEnd ? 'scheduled_cancel' : 'active',
        currentPeriodEnd,
        grantsNewCaseAccess: true,
      });
    }
  );

  it('denies access for a group_sponsor row without covering roster entries', async () => {
    h.find.mockResolvedValueOnce({ provider: 'group_sponsor', status: 'active' });
    await expect(get()).resolves.toEqual({
      bucket: 'none',
      currentPeriodEnd: null,
      grantsNewCaseAccess: false,
    });
  });
});

describe('member portal request context', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    h.requestValues.clear();
  });

  afterEach(() => vi.useRealTimers());

  it('resolves once across a slow render tree and isolates the next request', async () => {
    const firstSession = { user: { id: 'member-1', tenantId: 'tenant-1' } };
    const secondSession = { user: { id: 'member-1' } };
    h.authSession.mockResolvedValue(firstSession);
    const { getMemberPortalContext } = await import(/* @vite-ignore */ MEMBER_CONTEXT_MODULE);

    const first = await getMemberPortalContext();
    await vi.advanceTimersByTimeAsync(2_100);
    const slowSibling = await getMemberPortalContext();
    expect(slowSibling).toEqual(first);
    expect(first).toEqual({ tenantId: 'tenant-1', userId: 'member-1' });
    expect(h.authSession).toHaveBeenCalledTimes(1);

    h.requestValues.clear();
    h.authSession.mockResolvedValue(secondSession);
    const nextRequest = await getMemberPortalContext();
    expect(nextRequest).not.toBe(first);
    expect(nextRequest).toBeNull();
    expect(h.authSession).toHaveBeenCalledTimes(2);
  });

  it('observes revocation in the next request', async () => {
    h.authSession.mockResolvedValue({ user: { id: 'member-1', tenantId: 'tenant-1' } });
    const { getMemberPortalContext } = await import(/* @vite-ignore */ MEMBER_CONTEXT_MODULE);
    await expect(getMemberPortalContext()).resolves.toMatchObject({ userId: 'member-1' });

    h.requestValues.clear();
    h.authSession.mockResolvedValue(null);
    await expect(getMemberPortalContext()).resolves.toBeNull();
    expect(h.authSession).toHaveBeenCalledTimes(2);
  });

  it('binds both resolvers to React cache without a TTL or module-global map', () => {
    const authSource = readFileSync(
      new URL('../../../../apps/web/src/lib/auth.server.ts', import.meta.url),
      'utf8'
    );
    const contextSource = readFileSync(
      new URL(
        '../../../../apps/web/src/components/shell/member-portal-context.ts',
        import.meta.url
      ),
      'utf8'
    );
    expect(authSource).toContain('getCachedSession = cache(resolveSessionInner)');
    expect(contextSource).toContain('getMemberPortalContext = cache(resolvePortalContext)');
    expect(`${authSource}\n${contextSource}`).not.toMatch(/Date\.now|setTimeout|new Map|TTL/u);
  });
});
