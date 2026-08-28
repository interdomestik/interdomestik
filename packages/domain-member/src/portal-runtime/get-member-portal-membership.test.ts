import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const h = vi.hoisted(() => ({
  find: vi.fn(),
  scope: vi.fn(),
  eq: vi.fn((...pair: unknown[]) => pair),
  authSession: vi.fn(),
  requestValues: new Map<() => unknown, unknown>(),
}));

vi.mock('../../../../apps/web/src/lib/auth.server', () => ({
  getCachedSession: () => {
    if (!h.requestValues.has(h.authSession)) {
      h.requestValues.set(h.authSession, h.authSession());
    }
    return h.requestValues.get(h.authSession);
  },
  resolveSessionInner: h.authSession,
}));

const MEMBER_CONTEXT_MODULE = new URL(
  '../../../../apps/web/src/components/shell/member-portal-context.ts',
  import.meta.url
).href;

vi.mock('@interdomestik/database', () => ({
  subscriptions: { tenantId: 'subscription.tenantId', userId: 'subscription.userId' },
  withTenantContext: h.scope,
}));
vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  and: (...parts: unknown[]) => parts,
  eq: h.eq,
}));

import { getMemberPortalMembership } from './get-member-portal-membership';

const get = (tenantId = 'tenant-1') =>
  getMemberPortalMembership({
    memberId: 'member-1',
    now: new Date('2026-08-28T12:00:00.000Z'),
    tenantId,
  });

describe('getMemberPortalMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.find.mockResolvedValue(null);
    h.scope.mockImplementation(async (_context, action) =>
      action({ query: { subscriptions: { findFirst: h.find } } })
    );
  });

  it('rejects a missing tenant and performs one tenant/member read', async () => {
    await expect(get('')).rejects.toThrow('Missing tenant context');
    await expect(get()).resolves.toEqual({ bucket: 'none' });
    expect(h.scope).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', role: 'member' },
      expect.any(Function)
    );
    expect(h.find).toHaveBeenCalledTimes(1);
    expect(h.eq.mock.calls.flat()).toEqual([
      'subscription.tenantId',
      'tenant-1',
      'subscription.userId',
      'member-1',
    ]);
    expect(h.find.mock.calls[0][0].columns).toEqual({
      cancelAtPeriodEnd: true,
      gracePeriodEndsAt: true,
      status: true,
    });
  });

  it.each([
    [{ status: 'active' }, 'active'],
    [{ status: 'trialing' }, 'trialing'],
    [{ status: 'past_due', gracePeriodEndsAt: new Date('2026-08-29') }, 'active_in_grace'],
    [{ status: 'past_due', gracePeriodEndsAt: new Date('2026-08-27') }, 'grace_expired'],
    [{ status: 'active', cancelAtPeriodEnd: true }, 'scheduled_cancel'],
    [{ status: 'canceled' }, 'canceled'],
  ] as const)('uses the canonical lifecycle bucket for %o', async (subscription, bucket) => {
    h.find.mockResolvedValueOnce(subscription);
    await expect(get()).resolves.toEqual({ bucket });
  });

  it('propagates read failures', async () => {
    h.find.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(get()).rejects.toThrow('database unavailable');
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
    const secondSession = { user: { id: 'member-1', tenantId: 'tenant-1' } };
    h.authSession.mockResolvedValue(firstSession);
    const { getMemberPortalContext } = await import(/* @vite-ignore */ MEMBER_CONTEXT_MODULE);

    const first = await getMemberPortalContext();
    await vi.advanceTimersByTimeAsync(2_100);
    const slowSibling = await getMemberPortalContext();
    expect(slowSibling?.session).toBe(first?.session);
    expect(h.authSession).toHaveBeenCalledTimes(1);

    h.requestValues.clear();
    h.authSession.mockResolvedValue(secondSession);
    const nextRequest = await getMemberPortalContext();
    expect(nextRequest).not.toBe(first);
    expect(nextRequest?.session).toBe(secondSession);
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
    expect(contextSource).toContain(
      'getMemberPortalContext = cache(resolveMemberPortalContextInner)'
    );
    expect(`${authSource}\n${contextSource}`).not.toMatch(/Date\.now|setTimeout|new Map|TTL/u);
  });
});
