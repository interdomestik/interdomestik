import type { IngressCapability } from '@interdomestik/database/ingress';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// prettier-ignore
const h = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
  authorizeCronRequest: vi.fn(), enforceRateLimit: vi.fn(),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  findFirstUser: vi.fn(), findManySubscriptions: vi.fn(),
  gt: vi.fn((left: unknown, right: unknown) => ({ op: 'gt', left, right })),
  listScheduledTenantWork: vi.fn(), txFindManySubscriptions: vi.fn(),
  runDunningCronCore: vi.fn(), txSet: vi.fn(), txUpdate: vi.fn(), txWhere: vi.fn(), withTenantContext: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: h.enforceRateLimit }));

vi.mock('../_auth', () => ({ authorizeCronRequest: h.authorizeCronRequest }));

vi.mock('./_core', () => ({ runDunningCronCore: h.runDunningCronCore }));

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/email', () => ({
  sendPaymentFinalWarningEmail: vi.fn(),
  sendPaymentReminderEmail: vi.fn(),
}));
vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      subscriptions: { findMany: h.findManySubscriptions },
      user: { findFirst: h.findFirstUser },
    },
  },
  subscriptions: {
    gracePeriodEndsAt: 'subscriptions.gracePeriodEndsAt',
    id: 'subscriptions.id',
    status: 'subscriptions.status',
    tenantId: 'subscriptions.tenantId',
  },
  user: { id: 'user.id', tenantId: 'user.tenantId' },
  withTenantContext: h.withTenantContext,
  listScheduledTenantWork: h.listScheduledTenantWork,
}));

vi.mock('drizzle-orm', () => ({ and: h.and, eq: h.eq, gt: h.gt }));

import { GET } from './route';

// The producer is mocked; this stands in for the capability the route's cron admission returns.
const INGRESS = Object.freeze({}) as IngressCapability<'cron'>;
const authorities = new Map<string, TenantAuthority>();
let scheduled: string[] = [];
const publish = () =>
  h.listScheduledTenantWork.mockResolvedValue(
    scheduled.map(tenantId => ({ tenantId, authority: authorities.get(tenantId) }))
  );
const schedule = (tenantIds: string[]) => {
  scheduled = tenantIds;
  for (const tenantId of tenantIds) authorities.set(tenantId, mintTestTenantAuthority(tenantId));
  publish();
};
// vi.resetModules() gives the code under test a new authority registry, so tokens minted before it
// are unrecognized there. Mint the scheduled tenants again from the module graph it will use.
const rescheduleAfterReset = async () => {
  const { mintTestTenantAuthority: mint } =
    await import('@interdomestik/database/testing/tenant-authority');
  for (const tenantId of scheduled) authorities.set(tenantId, mint(tenantId));
  publish();
};
const tenantOf = (authority: unknown) =>
  [...authorities].find(([, value]) => value === authority)?.[0] ?? 'unknown';

// prettier-ignore
describe('GET /api/cron/dunning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.enforceRateLimit.mockResolvedValue(null);
    h.authorizeCronRequest.mockReturnValue(INGRESS);
    schedule(['tenant-1']);
    h.runDunningCronCore.mockResolvedValue({
      stats: { checked: 1, day7Sent: 0, day13Sent: 0, errors: 0 },
    });
  });

  it('returns early when rate limited', async () => {
    h.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 429 }));
    const res = await GET(new NextRequest('http://localhost:3000/api/cron/dunning'));
    expect(res.status).toBe(429); expect(await res.text()).toBe('limited');
  });

  it('returns 401 when unauthorized', async () => {
    h.authorizeCronRequest.mockReturnValue(null);
    const res = await GET(new NextRequest('http://localhost:3000/api/cron/dunning'));
    expect(res.status).toBe(401); expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns success payload when authorized', async () => {
    const res = await GET(new NextRequest('http://localhost:3000/api/cron/dunning'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({ success: true, stats: { checked: 1, day7Sent: 0, day13Sent: 0, errors: 0 }, timestamp: expect.any(String) }));
    expect(h.runDunningCronCore).toHaveBeenCalledWith({ ingress: INGRESS, now: expect.any(Date), headers: expect.any(Headers) });
  });

  it('updates lastDunningAt through the subscription tenant context', async () => {
    vi.resetModules();
    await rescheduleAfterReset();
    h.txFindManySubscriptions.mockResolvedValueOnce([{ gracePeriodEndsAt: new Date('2026-01-15T00:00:00.000Z'), id: 'sub-1', pastDueAt: new Date('2026-01-01T00:00:00.000Z'), planId: 'standard', tenantId: 'tenant-1', userId: 'user-1' }]).mockResolvedValueOnce([]);
    h.findFirstUser.mockResolvedValue({ email: 'member@example.com', name: 'Member One' });
    h.txUpdate.mockReturnValue({ set: h.txSet });
    h.txSet.mockReturnValue({ where: h.txWhere });
    h.txWhere.mockResolvedValue(undefined);
    h.withTenantContext.mockImplementation(async (_context: TenantAuthority, action: (tx: unknown) => Promise<void>) => await action({ update: h.txUpdate, query: { subscriptions: { findMany: h.txFindManySubscriptions }, user: { findFirst: h.findFirstUser } } }));
    const { runDunningCronCore } = await vi.importActual<typeof import('./_core')>('./_core');
    const now = new Date('2026-01-08T00:00:00.000Z');
    await runDunningCronCore({ ingress: INGRESS, headers: new Headers(), now });
    expect(h.listScheduledTenantWork).toHaveBeenCalledWith(INGRESS);
    expect(h.withTenantContext).toHaveBeenCalledTimes(4); // page, member read, update, empty page
    for (const [context] of h.withTenantContext.mock.calls) expect(context).toBe(authorities.get('tenant-1'));
    expect(h.txUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'subscriptions.id' }));
    expect(h.txSet).toHaveBeenCalledWith({ lastDunningAt: now });
    expect(h.findManySubscriptions).not.toHaveBeenCalled();
  });

  describe('per-tenant paging', () => {
    const now = new Date('2026-01-08T00:00:00.000Z');
    // Grace period far away, so no email is due and only the paging behaviour is exercised.
    const pending = (id: string, tenantId: string) => ({ gracePeriodEndsAt: new Date('2026-06-01T00:00:00.000Z'), id, pastDueAt: new Date('2026-01-07T00:00:00.000Z'), planId: 'standard', tenantId, userId: `user-${id}` });
    const run = async () => {
      vi.resetModules();
      await rescheduleAfterReset();
      const { runDunningCronCore } = await vi.importActual<typeof import('./_core')>('./_core');
      return runDunningCronCore({ ingress: INGRESS, headers: new Headers(), now });
    };
    const events: string[] = [];

    beforeEach(() => {
      events.length = 0;
      schedule(['tenant-a', 'tenant-b']);
      h.withTenantContext.mockImplementation(async (context: TenantAuthority, action: (tx: unknown) => Promise<unknown>) => {
        events.push(`ctx:${tenantOf(context)}`);
        return await action({ query: { subscriptions: { findMany: (args: { where: { conditions: Array<{ op: string; left: string; right: unknown }> } }) => { events.push(`page:${args.where.conditions.map(c => c.op + ':' + c.left + ':' + String(c.right instanceof Date ? 'date' : c.right)).join(',')}`); return h.txFindManySubscriptions(args); } }, user: { findFirst: h.findFirstUser } } });
      });
    });

    it('resets the id cursor for each tenant and pages inside that tenant context', async () => {
      h.txFindManySubscriptions
        .mockResolvedValueOnce([pending('sub-a1', 'tenant-a'), pending('sub-a2', 'tenant-a')])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([pending('sub-b1', 'tenant-b')])
        .mockResolvedValueOnce([]);

      const { stats } = await run();

      expect(stats.checked).toBe(3);
      expect(h.listScheduledTenantWork).toHaveBeenCalledTimes(1);
      const tenantA = 'eq:subscriptions.tenantId:tenant-a,eq:subscriptions.status:past_due,gt:subscriptions.gracePeriodEndsAt:date';
      const tenantB = tenantA.replace('tenant-a', 'tenant-b');
      expect(events).toEqual([
        'ctx:tenant-a', `page:${tenantA}`,
        'ctx:tenant-a', `page:${tenantA},gt:subscriptions.id:sub-a2`,
        'ctx:tenant-b', `page:${tenantB}`,
        'ctx:tenant-b', `page:${tenantB},gt:subscriptions.id:sub-b1`,
      ]);
      expect(h.findManySubscriptions).not.toHaveBeenCalled();
    });

    it('never pages with the ambient db when there are no tenants', async () => {
      schedule([]);

      const { stats } = await run();

      expect(stats).toEqual({ checked: 0, day7Sent: 0, day13Sent: 0, errors: 0 });
      expect(h.withTenantContext).not.toHaveBeenCalled();
      expect(h.findManySubscriptions).not.toHaveBeenCalled();
    });
  });
});
