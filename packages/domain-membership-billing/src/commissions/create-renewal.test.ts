import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRenewalCommissionCore } from './create-renewal';

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      agentSettings: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('./ownership', () => ({
  resolveCommissionOwnership: vi.fn(),
}));

vi.mock('./create', () => ({
  createCommissionCore: vi.fn(),
}));

vi.mock('./types', () => ({
  calculateCommission: vi.fn(() => 12.5),
}));

describe('createRenewalCommissionCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a renewal commission for the resolved agent and records ownership metadata', async () => {
    const { resolveCommissionOwnership } = await import('./ownership');
    const { createCommissionCore } = await import('./create');

    (db.query.agentSettings.findFirst as any).mockResolvedValue({
      commissionRates: { renewal: 0.25 },
    });
    (resolveCommissionOwnership as any).mockReturnValue({
      ownerType: 'agent',
      agentId: 'agent-current',
      resolvedFrom: 'agent_clients',
      diagnostics: [
        {
          source: 'user.agentId',
          expectedAgentId: 'agent-current',
          actualAgentId: 'agent-legacy',
        },
      ],
    });
    (createCommissionCore as any).mockResolvedValue({
      success: true,
      data: { id: 'comm-renewal' },
    });

    const result = await createRenewalCommissionCore({
      tenantId: 'tenant-1',
      memberId: 'member-1',
      subscriptionId: 'sub-1',
      transactionTotal: 50,
      currency: 'USD',
      priceId: 'price-1',
      subscriptionAgentId: 'agent-current',
      userAgentId: 'agent-legacy',
      agentClientAgentIds: ['agent-current'],
      originalSellerAgentId: 'agent-original',
    });

    expect(result.success).toBe(true);
    expect(resolveCommissionOwnership).toHaveBeenCalledWith({
      subscriptionAgentId: 'agent-current',
      userAgentId: 'agent-legacy',
      agentClientAgentIds: ['agent-current'],
    });
    expect(createCommissionCore).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-current',
        memberId: 'member-1',
        subscriptionId: 'sub-1',
        type: 'renewal',
        amount: 12.5,
        currency: 'USD',
        tenantId: 'tenant-1',
        metadata: expect.objectContaining({
          saleOwnerType: 'agent',
          saleOwnerId: 'agent-current',
          originalSellerAgentId: 'agent-original',
          ownershipResolvedFrom: ['agent_clients', 'user.agentId'],
        }),
      })
    );
    if (result.success) {
      expect(result.data).toEqual({
        kind: 'created',
        id: 'comm-renewal',
      });
    }
  });

  it('skips renewal commissions for company-owned subscriptions', async () => {
    const { resolveCommissionOwnership } = await import('./ownership');
    const { createCommissionCore } = await import('./create');

    (resolveCommissionOwnership as any).mockReturnValue({
      ownerType: 'company',
      agentId: null,
      resolvedFrom: 'agent_clients',
      diagnostics: [],
    });

    const result = await createRenewalCommissionCore({
      tenantId: 'tenant-1',
      memberId: 'member-1',
      subscriptionId: 'sub-1',
      transactionTotal: 50,
      currency: 'USD',
      priceId: 'price-1',
      subscriptionAgentId: null,
      userAgentId: 'agent-legacy',
      agentClientAgentIds: [],
      originalSellerAgentId: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        kind: 'no-op',
        noCommissionReason: 'company_owned',
        ownerType: 'company',
        ownershipDiagnostics: [],
      });
    }
    expect(createCommissionCore).not.toHaveBeenCalled();
  });

  it('forwards the renewal commission type so idempotency stays scoped by subscription and type', async () => {
    const { resolveCommissionOwnership } = await import('./ownership');
    const { createCommissionCore } = await import('./create');

    (resolveCommissionOwnership as any).mockReturnValue({
      ownerType: 'agent',
      agentId: 'agent-current',
      resolvedFrom: 'agent_clients',
      diagnostics: [],
    });
    (createCommissionCore as any).mockResolvedValue({
      success: true,
      data: { id: 'comm-renewal' },
    });

    await createRenewalCommissionCore({
      tenantId: 'tenant-1',
      memberId: 'member-1',
      subscriptionId: 'sub-1',
      transactionTotal: 50,
      currency: 'USD',
      priceId: 'price-1',
      subscriptionAgentId: 'agent-current',
      userAgentId: 'agent-current',
      agentClientAgentIds: ['agent-current'],
      originalSellerAgentId: 'agent-original',
    });

    expect(createCommissionCore).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'renewal',
        subscriptionId: 'sub-1',
      })
    );
  });

  it('preserves unresolved canonical ownership when subscription owner is missing', async () => {
    const { resolveCommissionOwnership } = await import('./ownership');
    const { createCommissionCore } = await import('./create');

    (resolveCommissionOwnership as any).mockReturnValue({
      ownerType: 'agent',
      agentId: 'agent-current',
      resolvedFrom: 'agent_clients',
      diagnostics: [],
    });
    (createCommissionCore as any).mockResolvedValue({
      success: true,
      data: { id: 'comm-renewal-fallback' },
    });

    const result = await createRenewalCommissionCore({
      tenantId: 'tenant-1',
      memberId: 'member-1',
      subscriptionId: 'sub-1',
      transactionTotal: 50,
      currency: 'USD',
      priceId: 'price-1',
      subscriptionAgentId: undefined,
      userAgentId: 'agent-current',
      agentClientAgentIds: ['agent-current'],
      originalSellerAgentId: null,
    });

    expect(resolveCommissionOwnership).toHaveBeenCalledWith({
      subscriptionAgentId: undefined,
      userAgentId: 'agent-current',
      agentClientAgentIds: ['agent-current'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        kind: 'created',
        id: 'comm-renewal-fallback',
      });
    }
    expect(createCommissionCore).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-current',
        metadata: expect.objectContaining({
          ownershipResolvedFrom: ['agent_clients'],
        }),
      })
    );
  });
});
