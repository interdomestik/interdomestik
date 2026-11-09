import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelSubscriptionCore } from './cancel';
import type { SubscriptionSession } from './types';

const hoisted = vi.hoisted(() => ({
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
  db: {
    query: { subscriptions: { findFirst: vi.fn() } },
    select: vi.fn(),
    transaction: vi.fn(),
    update: vi.fn(),
  },
  subscriptions: { id: 'id', tenantId: 'tenantId' },
  claims: { id: 'claim_id', userId: 'claim_user_id', tenantId: 'claim_tenant_id' },
  claimEscalationAgreements: {
    claimId: 'agreement_claim_id',
    acceptedAt: 'agreement_accepted_at',
    tenantId: 'agreement_tenant_id',
  },
  ensureTenantId: vi.fn(),
  paddle: { subscriptions: { cancel: vi.fn() } },
}));

vi.mock('@interdomestik/database', () => ({
  appendEvent: hoisted.appendEvent,
  db: hoisted.db,
  withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: any) => unknown) =>
    hoisted.db.transaction(cb)
  ),
  subscriptions: hoisted.subscriptions,
  claims: hoisted.claims,
  claimEscalationAgreements: hoisted.claimEscalationAgreements,
  and: vi.fn(),
  eq: vi.fn(),
  desc: vi.fn(),
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantId,
}));

vi.mock('../paddle-server', () => ({
  getPaddle: () => hoisted.paddle,
}));

describe('cancelSubscriptionCore row guard', () => {
  const authority = mintTestTenantAuthority('tenant_abc');
  const logAuditEvent = vi.fn();
  const session: SubscriptionSession = { user: { id: 'user_123' } };

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.ensureTenantId.mockReturnValue('tenant_abc');
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub_123',
      userId: 'user_123',
      tenantId: 'tenant_abc',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2027-03-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
      status: 'active',
    });
    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
    hoisted.db.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ innerJoin: mockInnerJoin }),
    });
    hoisted.db.transaction.mockImplementation(async callback => callback(hoisted.db));
    hoisted.paddle.subscriptions.cancel.mockResolvedValue({});
  });

  it.each(['active', 'paused', 'canceled'])(
    'refuses a %s group_sponsor row before any Paddle call or mutation',
    async status => {
      hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
        id: 'sub_123',
        userId: 'user_123',
        tenantId: 'tenant_abc',
        provider: 'group_sponsor',
        providerSubscriptionId: 'sub_provider',
        status,
      });
      await expect(
        cancelSubscriptionCore({ session, authority, subscriptionId: 'sub_123' }, { logAuditEvent })
      ).resolves.toEqual({
        error: 'Subscription not found or access denied',
        success: undefined,
      });
      expect(hoisted.paddle.subscriptions.cancel).not.toHaveBeenCalled();
      expect(hoisted.db.select).not.toHaveBeenCalled();
      expect(hoisted.db.update).not.toHaveBeenCalled();
      expect(hoisted.appendEvent).not.toHaveBeenCalled();
      expect(logAuditEvent).not.toHaveBeenCalled();
    }
  );

  it('does not emit a cancellation event when the tenant-scoped update matches no rows', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockReturning = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    hoisted.db.update.mockReturnValue({ set: vi.fn().mockReturnValue({ where: mockWhere }) });

    try {
      const result = await cancelSubscriptionCore(
        {
          session,
          authority,
          subscriptionId: 'sub_123',
          now: new Date('2026-03-12T00:00:00.000Z'),
        },
        { logAuditEvent }
      );

      expect(result.success).toBe(true);
      expect(hoisted.appendEvent).not.toHaveBeenCalled();
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ localPersistenceFailed: true }),
        })
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
