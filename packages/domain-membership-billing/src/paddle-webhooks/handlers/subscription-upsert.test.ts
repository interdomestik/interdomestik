import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const returning = vi.fn();
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const tx = { insert: vi.fn(), update: vi.fn().mockReturnValue({ set }) };
  return {
    and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
    appendEvent: vi.fn(),
    db: {
      query: { subscriptions: { findFirst: vi.fn() } },
    },
    withTenantContext: vi.fn(async (_context, callback) => callback(tx)),
    eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
    returning,
    set,
    subscriptions: { id: 'subscriptions.id', tenantId: 'subscriptions.tenant_id' },
    tx,
    where,
  };
});

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  appendEvent: hoisted.appendEvent,
  db: hoisted.db,
  eq: hoisted.eq,
  subscriptions: hoisted.subscriptions,
  withTenantContext: hoisted.withTenantContext,
}));

vi.mock('../../subscription', () => ({ findPaddleSubscriptionInTenant: vi.fn() }));

import { upsertSubscription } from './subscription-upsert';

describe('upsertSubscription tenant-scoped update guard', () => {
  const authority = mintTestTenantAuthority('tenant_abc');

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.returning.mockResolvedValue([]);
  });

  it.each(['active', 'past_due', 'paused', 'canceled', 'trialing', 'expired'] as const)(
    'takes over a sponsored anchor in the same %s snapshot update',
    async mappedStatus => {
      hoisted.returning.mockResolvedValue([{ id: 'sub_anchor' }]);
      hoisted.appendEvent.mockResolvedValue({ id: 'event-1' });
      const existingSub = {
        id: 'sub_anchor',
        tenantId: 'tenant_abc',
        userId: 'user_123',
        status: 'active',
        provider: 'group_sponsor',
      };
      await expect(
        upsertSubscription({
          existingSub,
          mappedStatus,
          authority,
          userId: 'user_123',
          planState: { planId: 'standard', planKey: 'mk-standard-plan' },
          sub: { id: 'sub_paddle', customerId: 'ctm_1' },
        })
      ).resolves.toEqual({ subscriptionId: 'sub_anchor', effectsApplied: true });
      expect(hoisted.set).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          provider: 'paddle',
          status: mappedStatus,
          providerSubscriptionId: 'sub_paddle',
          tenantId: 'tenant_abc',
          userId: 'user_123',
        })
      );
      expect(hoisted.tx.insert).not.toHaveBeenCalled();
    }
  );

  it('does not emit a subscription event when the update matches no tenant row', async () => {
    await expect(
      upsertSubscription({
        existingSub: { id: 'sub_existing', tenantId: 'tenant_abc', userId: 'user_123' },
        mappedStatus: 'active',
        planState: { planId: 'standard', planKey: 'mk-standard-plan' },
        sub: {
          id: 'sub_paddle_456',
          customerId: 'ctm_1',
          currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
        },
        authority,
        userId: 'user_123',
      })
    ).rejects.toThrow('update matched no tenant-scoped row');

    expect(hoisted.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(hoisted.set).toHaveBeenCalled();
    expect(hoisted.appendEvent).not.toHaveBeenCalled();
  });

  it('treats a duplicate deterministic provider event as an already-applied effect', async () => {
    hoisted.returning.mockResolvedValue([{ id: 'sub_existing' }]);
    hoisted.appendEvent.mockRejectedValue(
      Object.assign(new Error('duplicate domain event'), {
        code: '23505',
        constraint: 'domain_events_pkey',
      })
    );

    await expect(
      upsertSubscription({
        existingSub: {
          id: 'sub_existing',
          status: 'active',
          tenantId: 'tenant_abc',
          userId: 'user_123',
        },
        mappedStatus: 'active',
        planState: { planId: 'standard', planKey: 'mk-standard-plan' },
        providerEventId: 'evt_provider_1',
        sub: {
          id: 'sub_paddle_456',
          customerId: 'ctm_1',
          currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
        },
        authority,
        userId: 'user_123',
      })
    ).resolves.toEqual({ subscriptionId: 'sub_existing', effectsApplied: false });

    expect(hoisted.appendEvent).toHaveBeenCalledWith(
      hoisted.tx,
      expect.objectContaining({
        id: 'paddle:tenant_abc:evt_provider_1:subscription-changed',
      })
    );
  });
  it('fails closed without writes when the existing subscription belongs to another tenant', async () => {
    await expect(
      upsertSubscription({
        existingSub: { id: 'sub_existing', tenantId: 'tenant_other', userId: 'user_123' },
        mappedStatus: 'active',
        planState: { planId: 'standard', planKey: 'mk-standard-plan' },
        sub: {
          id: 'sub_paddle_456',
          customerId: 'ctm_1',
          currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
        },
        authority,
        userId: 'user_123',
      })
    ).rejects.toThrow('tenant conflict: existing=tenant_other resolved=tenant_abc');

    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.set).not.toHaveBeenCalled();
    expect(hoisted.appendEvent).not.toHaveBeenCalled();
  });
});
