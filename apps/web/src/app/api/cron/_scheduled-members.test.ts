import type { IngressCapability } from '@interdomestik/database/ingress';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Predicate = { args?: unknown[]; left?: unknown; op: string; right?: unknown };

const hoisted = vi.hoisted(() => ({
  effectiveCoverageMembers: vi.fn(),
  inArray: vi.fn((left: unknown, right: unknown) => ({ left, op: 'inArray', right })),
  and: vi.fn((...args: unknown[]) => ({ args, op: 'and' })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, op: 'eq', right })),
  gte: vi.fn((left: unknown, right: unknown) => ({ left, op: 'gte', right })),
  listScheduledTenantWork: vi.fn(),
  lte: vi.fn((left: unknown, right: unknown) => ({ left, op: 'lte', right })),
  rowsByTenant: {} as Record<string, unknown[]>,
  selectedFields: vi.fn(),
  tables: {
    subscriptions: new Proxy({}, { get: (_t, prop) => `subscriptions.${String(prop)}` }),
    user: new Proxy({}, { get: (_t, prop) => `user.${String(prop)}` }),
  },
  txCalls: [] as Array<{
    joinOn: Predicate;
    limit: number;
    tenantId: string;
    where: Predicate;
  }>,
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContext,
  listScheduledTenantWork: hoisted.listScheduledTenantWork,
}));
vi.mock('@interdomestik/database/schema', () => hoisted.tables);

vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage', () => ({
  effectiveCoverageMembers: hoisted.effectiveCoverageMembers,
}));

vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  inArray: hoisted.inArray,
  eq: hoisted.eq,
  gte: hoisted.gte,
  lte: hoisted.lte,
}));

import {
  selectActiveSubscriptionMembers,
  type ScheduledSubscriptionMember,
} from './_scheduled-members';

function memberRows(tenantId: string, count: number): ScheduledSubscriptionMember[] {
  return Array.from({ length: count }, (_, index) => ({
    email: `${tenantId}-${index}@example.com`,
    name: `${tenantId} ${index}`,
    subId: `${tenantId}-sub-${index}`,
    tenantId,
    userId: `${tenantId}-user-${index}`,
  }));
}

// The producer is mocked; this stands in for the cron route's admitted capability.
const INGRESS = Object.freeze({}) as IngressCapability<'cron'>;
const authorities: Record<string, TenantAuthority> = {};

function scheduleTenants(tenantIds: string[]): void {
  for (const tenantId of tenantIds) authorities[tenantId] = mintTestTenantAuthority(tenantId);
  hoisted.listScheduledTenantWork.mockResolvedValue(
    tenantIds.map(tenantId => ({ tenantId, authority: authorities[tenantId] }))
  );
}

function conditions(predicate: Predicate): Predicate[] {
  return (predicate.args ?? []) as Predicate[];
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.rowsByTenant = {};
  hoisted.effectiveCoverageMembers.mockResolvedValue([
    { userId: 'sponsored', membership: { source: 'sponsor' } },
    {
      userId: 'paddle',
      membership: { source: 'subscription', subscription: { status: 'active' } },
    },
    {
      userId: 'canceled',
      membership: { source: 'subscription', subscription: { status: 'canceled' } },
    },
  ]);
  hoisted.txCalls.length = 0;
  hoisted.withTenantContext.mockImplementation(
    async (context: TenantAuthority, action: (tx: unknown) => Promise<unknown>) => {
      const call = {
        joinOn: undefined as unknown as Predicate,
        limit: -1,
        tenantId: readTenantAuthority(context).tenantId,
        where: undefined as unknown as Predicate,
      };
      hoisted.txCalls.push(call);
      const chain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn((_table: unknown, on: Predicate) => {
          call.joinOn = on;
          return chain;
        }),
        limit: vi.fn(async (limit: number) => {
          call.limit = limit;
          return hoisted.rowsByTenant[call.tenantId] ?? [];
        }),
        where: vi.fn((where: Predicate) => {
          call.where = where;
          return chain;
        }),
      };
      return action({
        select: (fields: unknown) => {
          hoisted.selectedFields(fields);
          return chain;
        },
      });
    }
  );
});

describe('selectActiveSubscriptionMembers', () => {
  it('returns no members and opens no tenant context when there are no tenants', async () => {
    scheduleTenants([]);

    await expect(selectActiveSubscriptionMembers({ ingress: INGRESS, limit: 10 })).resolves.toEqual(
      []
    );

    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('opens exactly one system tenant context per visited tenant, in listed order', async () => {
    scheduleTenants(['tenant-a', 'tenant-b']);
    hoisted.rowsByTenant = {
      'tenant-a': memberRows('tenant-a', 1),
      'tenant-b': memberRows('tenant-b', 1),
    };

    const members = await selectActiveSubscriptionMembers({ ingress: INGRESS, limit: 10 });

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(2);
    expect(hoisted.withTenantContext).toHaveBeenNthCalledWith(
      1,
      authorities['tenant-a'],
      expect.any(Function)
    );
    expect(hoisted.withTenantContext).toHaveBeenNthCalledWith(
      2,
      authorities['tenant-b'],
      expect.any(Function)
    );
    expect(members.map(member => member.subId)).toEqual(['tenant-a-sub-0', 'tenant-b-sub-0']);
    expect(hoisted.listScheduledTenantWork).toHaveBeenCalledWith(INGRESS);
  });

  it('shares the run-wide limit as a budget across tenants and stops once it is spent', async () => {
    scheduleTenants(['tenant-a', 'tenant-b', 'tenant-c']);
    hoisted.rowsByTenant = {
      'tenant-a': memberRows('tenant-a', 2),
      'tenant-b': memberRows('tenant-b', 1),
      'tenant-c': memberRows('tenant-c', 1),
    };

    const members = await selectActiveSubscriptionMembers({ ingress: INGRESS, limit: 3 });

    expect(hoisted.txCalls.map(call => [call.tenantId, call.limit])).toEqual([
      ['tenant-a', 3],
      ['tenant-b', 1],
    ]);
    expect(members).toHaveLength(3);
    expect(members.map(member => member.tenantId)).toEqual(['tenant-a', 'tenant-a', 'tenant-b']);
  });

  it('keeps tenant, effective coverage and the optional createdAt window in the where, and binds the user join to the tenant', async () => {
    scheduleTenants(['tenant-a']);
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-01T23:59:59.999Z');

    await selectActiveSubscriptionMembers({
      ingress: INGRESS,
      createdBetween: { start, end },
      limit: 5,
    });

    const [call] = hoisted.txCalls;
    expect(conditions(call.where)).toEqual([
      { left: 'subscriptions.tenantId', op: 'eq', right: 'tenant-a' },
      { left: 'subscriptions.userId', op: 'inArray', right: ['sponsored', 'paddle'] },
      { left: 'subscriptions.createdAt', op: 'gte', right: start },
      { left: 'subscriptions.createdAt', op: 'lte', right: end },
    ]);
    expect(conditions(call.joinOn)).toEqual([
      { left: 'subscriptions.userId', op: 'eq', right: 'user.id' },
      { left: 'user.tenantId', op: 'eq', right: 'tenant-a' },
    ]);
  });

  it('omits the createdAt window when none is given and selects only the member columns', async () => {
    scheduleTenants(['tenant-a']);

    await selectActiveSubscriptionMembers({ ingress: INGRESS, limit: 5 });

    expect(conditions(hoisted.txCalls[0].where)).toEqual([
      { left: 'subscriptions.tenantId', op: 'eq', right: 'tenant-a' },
      { left: 'subscriptions.userId', op: 'inArray', right: ['sponsored', 'paddle'] },
    ]);
    expect(hoisted.gte).not.toHaveBeenCalled();
    expect(hoisted.lte).not.toHaveBeenCalled();
    expect(hoisted.selectedFields).toHaveBeenCalledWith({
      email: 'user.email',
      name: 'user.name',
      subId: 'subscriptions.id',
      tenantId: 'subscriptions.tenantId',
      userId: 'subscriptions.userId',
    });
  });

  it('selects source 1 and access-active source 2, excluding uncovered sponsor rows', async () => {
    scheduleTenants(['tenant-a']);
    await selectActiveSubscriptionMembers({ ingress: INGRESS, limit: 5 });
    expect(hoisted.inArray).toHaveBeenCalledWith('subscriptions.userId', ['sponsored', 'paddle']);
    expect(hoisted.effectiveCoverageMembers).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.any(Function) }),
      'tenant-a',
      expect.any(Date)
    );
  });

  it('does not query recipients when the set has no covered members', async () => {
    scheduleTenants(['tenant-a']);
    hoisted.effectiveCoverageMembers.mockResolvedValue([]);
    expect(await selectActiveSubscriptionMembers({ ingress: INGRESS, limit: 5 })).toEqual([]);
    expect(hoisted.selectedFields).not.toHaveBeenCalled();
  });

  it('binds every tenant visit to its own tenant predicate', async () => {
    scheduleTenants(['tenant-a', 'tenant-b']);

    await selectActiveSubscriptionMembers({ ingress: INGRESS, limit: 5 });

    expect(hoisted.txCalls.map(call => [call.tenantId, conditions(call.where)[0]?.right])).toEqual([
      ['tenant-a', 'tenant-a'],
      ['tenant-b', 'tenant-b'],
    ]);
  });
});
