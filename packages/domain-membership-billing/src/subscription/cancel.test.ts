import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelSubscriptionCore } from './cancel';
import type { SubscriptionSession } from './types';

// Mock DB
const hoisted = vi.hoisted(() => ({
  db: {
    query: {
      subscriptions: { findFirst: vi.fn() },
    },
    select: vi.fn(),
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
  paddle: {
    subscriptions: { cancel: vi.fn() },
  },
}));

vi.mock('@interdomestik/database', () => ({
  db: hoisted.db,
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

describe('cancelSubscriptionCore', () => {
  const logAuditEvent = vi.fn();

  function mockCancellationContext(params?: {
    acceptedEscalationRows?: Array<{ acceptedAt: Date }>;
    subscriptionCreatedAt?: Date;
  }) {
    hoisted.ensureTenantId.mockReturnValue('tenant_abc');
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub_123',
      userId: 'user_123',
      tenantId: 'tenant_abc',
      createdAt: params?.subscriptionCreatedAt ?? new Date('2026-03-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2027-03-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    const mockLimit = vi.fn().mockResolvedValue(params?.acceptedEscalationRows ?? []);
    const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
    hoisted.db.select.mockReturnValue({ from: mockFrom });
    hoisted.paddle.subscriptions.cancel.mockResolvedValue({});
  }

  beforeEach(() => {
    vi.clearAllMocks();
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    hoisted.db.update.mockReturnValue({ set: mockSet });
  });

  it('schedules next-term cancellation, persists cancelAtPeriodEnd, and returns refund eligibility', async () => {
    const session: SubscriptionSession = {
      user: { id: 'user_123' },
    };

    mockCancellationContext();

    const result = await cancelSubscriptionCore(
      {
        session,
        subscriptionId: 'sub_123',
        now: new Date('2026-03-12T00:00:00.000Z'),
      },
      { logAuditEvent }
    );

    expect(result).toEqual({
      cancellationTerms: {
        coolingOffAppliesSeparately: true,
        currentPeriodEndsAt: '2027-03-01T00:00:00.000Z',
        effectiveFrom: 'next_billing_period',
        hasAcceptedEscalation: false,
        refundStatus: 'eligible',
        refundWindowEndsAt: '2026-03-31T00:00:00.000Z',
      },
      error: undefined,
      success: true,
    });
    expect(hoisted.paddle.subscriptions.cancel).toHaveBeenCalledWith('sub_123', expect.anything());
    expect(hoisted.db.update).toHaveBeenCalledWith(hoisted.subscriptions);

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.canceled_scheduled',
        entityId: 'sub_123',
        tenantId: 'tenant_abc',
        actorId: 'user_123',
        actorRole: 'member',
      })
    );
  });

  it('returns the accepted-escalation refund lock when a recovery matter has already been accepted', async () => {
    const session: SubscriptionSession = {
      user: { id: 'user_123' },
    };

    mockCancellationContext({
      acceptedEscalationRows: [{ acceptedAt: new Date('2026-03-05T00:00:00.000Z') }],
    });

    const result = await cancelSubscriptionCore(
      {
        session,
        subscriptionId: 'sub_123',
        now: new Date('2026-03-12T00:00:00.000Z'),
      },
      { logAuditEvent }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.cancellationTerms.refundStatus).toBe('blocked_by_accepted_escalation');
      expect(result.cancellationTerms.hasAcceptedEscalation).toBe(true);
    }
  });

  it('does not treat accepted escalations from an earlier membership term as blocking', async () => {
    const session: SubscriptionSession = {
      user: { id: 'user_123' },
    };

    mockCancellationContext({
      acceptedEscalationRows: [{ acceptedAt: new Date('2026-02-15T00:00:00.000Z') }],
      subscriptionCreatedAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    const result = await cancelSubscriptionCore(
      {
        session,
        subscriptionId: 'sub_123',
        now: new Date('2026-03-12T00:00:00.000Z'),
      },
      { logAuditEvent }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.cancellationTerms.refundStatus).toBe('eligible');
      expect(result.cancellationTerms.hasAcceptedEscalation).toBe(false);
    }
  });

  it('returns success after provider cancellation even if local persistence fails', async () => {
    const session: SubscriptionSession = {
      user: { id: 'user_123' },
    };

    mockCancellationContext();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockWhere = vi.fn().mockRejectedValue(new Error('write failed'));
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    hoisted.db.update.mockReturnValue({ set: mockSet });

    try {
      const result = await cancelSubscriptionCore(
        {
          session,
          subscriptionId: 'sub_123',
          now: new Date('2026-03-12T00:00:00.000Z'),
        },
        { logAuditEvent }
      );

      expect(result.success).toBe(true);
      expect(hoisted.paddle.subscriptions.cancel).toHaveBeenCalledWith(
        'sub_123',
        expect.anything()
      );
      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            localPersistenceFailed: true,
          }),
        })
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it('denies access if user mismatch', async () => {
    const session: SubscriptionSession = {
      user: { id: 'user_123' },
    };

    hoisted.ensureTenantId.mockReturnValue('tenant_abc');
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub_123',
      userId: 'other_user', // Mismatch
      tenantId: 'tenant_abc',
    });

    const result = await cancelSubscriptionCore(
      { session, subscriptionId: 'sub_123' },
      { logAuditEvent }
    );

    expect(result.error).toContain('access denied');
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('uses the stored provider subscription id when present', async () => {
    const session: SubscriptionSession = {
      user: { id: 'user_123' },
    };

    mockCancellationContext();
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'mock_sub_internal',
      providerSubscriptionId: 'sub_paddle_123',
      userId: 'user_123',
      tenantId: 'tenant_abc',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2027-03-01T00:00:00.000Z'),
      cancelAtPeriodEnd: false,
    });

    await cancelSubscriptionCore(
      {
        session,
        subscriptionId: 'mock_sub_internal',
        now: new Date('2026-03-12T00:00:00.000Z'),
      },
      { logAuditEvent }
    );

    expect(hoisted.paddle.subscriptions.cancel).toHaveBeenCalledWith(
      'sub_paddle_123',
      expect.anything()
    );
  });
});
