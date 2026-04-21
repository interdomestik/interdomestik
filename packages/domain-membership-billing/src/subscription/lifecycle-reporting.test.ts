import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  subscriptions: {
    tenantId: 'subscriptions.tenant_id',
    status: 'subscriptions.status',
    cancelAtPeriodEnd: 'subscriptions.cancel_at_period_end',
    gracePeriodEndsAt: 'subscriptions.grace_period_ends_at',
  },
  aggregateRows: [] as Array<{
    total: number;
    active: number;
    trialing: number;
    activeInGrace: number;
    graceExpired: number;
    scheduledCancel: number;
    canceled: number;
    accessActive: number;
  }>,
  where: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    select: hoisted.select,
  },
  eq: hoisted.eq,
  sql: hoisted.sql,
  subscriptions: hoisted.subscriptions,
}));

import {
  deriveMembershipStatus,
  getTenantMembershipLifecycleCounts,
  membershipLifecycleGrantsAccess,
  summarizeMembershipLifecycle,
} from './lifecycle-reporting';

describe('membership lifecycle reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.aggregateRows.length = 0;
    hoisted.where.mockResolvedValue(hoisted.aggregateRows);
    hoisted.from.mockReturnValue({ where: hoisted.where });
    hoisted.select.mockReturnValue({ from: hoisted.from });
  });

  it('derives deterministic lifecycle buckets at the grace-period boundary', () => {
    const now = new Date('2026-04-21T12:00:00.000Z');
    const gracePeriodEndsAt = new Date('2026-04-21T12:00:00.001Z');

    expect(deriveMembershipStatus({ status: 'past_due', gracePeriodEndsAt }, now)).toBe(
      'active_in_grace'
    );

    expect(
      deriveMembershipStatus({ status: 'past_due', gracePeriodEndsAt }, gracePeriodEndsAt)
    ).toBe('grace_expired');
  });

  it('classifies scheduled cancellation as access-active until period end', () => {
    const bucket = deriveMembershipStatus(
      {
        status: 'active',
        cancelAtPeriodEnd: true,
        gracePeriodEndsAt: null,
      },
      new Date('2026-04-21T12:00:00.000Z')
    );

    expect(bucket).toBe('scheduled_cancel');
    expect(membershipLifecycleGrantsAccess(bucket)).toBe(true);
  });

  it('maps legacy past_due rows without grace date to grace_expired instead of throwing', () => {
    const bucket = deriveMembershipStatus(
      { status: 'past_due', gracePeriodEndsAt: null },
      new Date('2026-04-21T12:00:00.000Z')
    );

    expect(bucket).toBe('grace_expired');
    expect(membershipLifecycleGrantsAccess(bucket)).toBe(false);
  });

  it('maps paused, expired, and unknown persisted statuses to the non-access canceled bucket', () => {
    const now = new Date('2026-04-21T12:00:00.000Z');

    expect(deriveMembershipStatus({ status: 'paused' }, now)).toBe('canceled');
    expect(deriveMembershipStatus({ status: 'expired' }, now)).toBe('canceled');
    expect(deriveMembershipStatus({ status: 'provider_unknown' }, now)).toBe('canceled');
  });

  it('summarizes lifecycle rows into reporting counts', () => {
    const counts = summarizeMembershipLifecycle(
      [
        { status: 'active', cancelAtPeriodEnd: false, gracePeriodEndsAt: null },
        { status: 'trialing', cancelAtPeriodEnd: false, gracePeriodEndsAt: null },
        { status: 'past_due', gracePeriodEndsAt: new Date('2026-04-22T00:00:00.000Z') },
        { status: 'past_due', gracePeriodEndsAt: new Date('2026-04-20T00:00:00.000Z') },
        { status: 'active', cancelAtPeriodEnd: true, gracePeriodEndsAt: null },
        { status: 'canceled', cancelAtPeriodEnd: false, gracePeriodEndsAt: null },
      ],
      new Date('2026-04-21T00:00:00.000Z')
    );

    expect(counts).toMatchObject({
      total: 6,
      active: 1,
      trialing: 1,
      activeInGrace: 1,
      graceExpired: 1,
      scheduledCancel: 1,
      canceled: 1,
      accessActive: 4,
    });
  });

  it('loads tenant lifecycle counts through an aggregate reporting query', async () => {
    hoisted.aggregateRows.push({
      total: 2,
      active: 1,
      trialing: 0,
      activeInGrace: 0,
      graceExpired: 1,
      scheduledCancel: 0,
      canceled: 0,
      accessActive: 1,
    });

    const counts = await getTenantMembershipLifecycleCounts({
      tenantId: 'tenant_ks',
      now: new Date('2026-04-21T00:00:00.000Z'),
    });

    expect(hoisted.eq).toHaveBeenCalledWith('subscriptions.tenant_id', 'tenant_ks');
    expect(hoisted.select).toHaveBeenCalledWith(
      expect.objectContaining({
        activeInGrace: expect.anything(),
        scheduledCancel: expect.anything(),
        accessActive: expect.anything(),
      })
    );
    expect(counts.accessActive).toBe(1);
    expect(counts.graceExpired).toBe(1);
  });
});
