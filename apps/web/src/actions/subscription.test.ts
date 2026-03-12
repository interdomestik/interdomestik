import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database';
import { getPaddle } from '@interdomestik/domain-membership-billing/paddle-server';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cancelSubscription } from './subscription';

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      subscriptions: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(),
    update: vi.fn(),
  },
  and: vi.fn(),
  eq: vi.fn(),
  subscriptions: {
    id: { name: 'id' },
    userId: { name: 'userId' },
    tenantId: { name: 'tenantId' },
    updatedAt: { name: 'updatedAt' },
  },
  claims: { id: { name: 'id' }, userId: { name: 'userId' }, tenantId: { name: 'tenantId' } },
  claimEscalationAgreements: {
    claimId: { name: 'claimId' },
    tenantId: { name: 'tenantId' },
  },
  auditLog: {},
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('@interdomestik/domain-membership-billing/paddle-server', () => ({
  getPaddle: vi.fn(),
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({}),
}));

describe('cancelSubscription', () => {
  const mockPaddle = {
    subscriptions: {
      cancel: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getPaddle as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockPaddle);
    (ensureTenantId as unknown as ReturnType<typeof vi.fn>).mockReturnValue('tenant_mk');

    const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    (db.update as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      set: mockUpdateSet,
    });

    const mockSelectLimit = vi.fn().mockResolvedValue([]);
    const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
    const mockSelectInnerJoin = vi.fn().mockReturnValue({ where: mockSelectWhere });
    const mockSelectFrom = vi.fn().mockReturnValue({ innerJoin: mockSelectInnerJoin });
    (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockSelectFrom });
  });

  it('should succeed if user owns subscription', async () => {
    (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'u1', tenantId: 'tenant_mk' },
    });
    (db.query.subscriptions.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sub1',
      tenantId: 'tenant_mk',
      userId: 'u1',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2027-03-01T00:00:00.000Z'),
    });
    (mockPaddle.subscriptions.cancel as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const result = await cancelSubscription('sub1');
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
    expect(mockPaddle.subscriptions.cancel).toHaveBeenCalledWith('sub1', {
      effectiveFrom: 'next_billing_period',
    });
  });

  it('should fail if unauthorized', async () => {
    (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await cancelSubscription('sub1');
    expect(result).toEqual({ error: 'Unauthorized' });
  });

  it('should fail if not owner', async () => {
    (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'u1', tenantId: 'tenant_mk' },
    });
    (db.query.subscriptions.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sub1',
      tenantId: 'tenant_mk',
      userId: 'u2',
    });

    const result = await cancelSubscription('sub1');
    expect(result).toEqual({ error: 'Subscription not found or access denied' });
  });

  it('should fail if subscription not found', async () => {
    (auth.api.getSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'u1', tenantId: 'tenant_mk' },
    });
    (db.query.subscriptions.findFirst as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    const result = await cancelSubscription('sub1');
    expect(result).toEqual({ error: 'Subscription not found or access denied' });
  });
});
