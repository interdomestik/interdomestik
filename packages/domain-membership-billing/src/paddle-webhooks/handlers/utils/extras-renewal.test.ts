import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemberReferralRewardCore } from '../../../../../domain-referrals/src';
import { createRenewalCommissionCore } from '../../../commissions/create-renewal';
import { handleRenewalSubscriptionExtras } from './extras';

vi.mock('@interdomestik/database', () => ({
  db: { query: {} },
  appendEvent: vi.fn(),
}));

vi.mock('../../../../../domain-referrals/src', () => ({
  createMemberReferralRewardCore: vi.fn(),
}));

vi.mock('../../../commissions/create', () => ({
  createCommissionCore: vi.fn(),
}));

vi.mock('../../../commissions/create-renewal', () => ({
  createRenewalCommissionCore: vi.fn(),
}));

describe('handleRenewalSubscriptionExtras', () => {
  const deps = { logAuditEvent: vi.fn() };
  const subscription = {
    id: 'sub_renewal',
    items: [{ price: { id: 'price_renewal', unitPrice: { amount: '3000', currencyCode: 'EUR' } } }],
    customData: { agentId: 'agent_current' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createRenewalCommissionCore).mockResolvedValue({
      success: true,
      data: { kind: 'created', id: 'renew_1' },
    });
  });

  it('creates a renewal commission using canonical ownership metadata', async () => {
    await handleRenewalSubscriptionExtras({
      sub: subscription,
      userId: 'user_1',
      tenantId: 'tenant_1',
      customData: { agentId: 'agent_current' },
      priceId: 'price_renewal',
      userRecord: null,
      ownership: {
        subscriptionAgentId: 'agent_current',
        userAgentId: 'agent_previous',
        agentClientAgentIds: ['agent_current'],
        originalSellerAgentId: 'agent_original',
      },
      deps,
    });

    expect(createRenewalCommissionCore).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionAgentId: 'agent_current',
        userAgentId: 'agent_previous',
        agentClientAgentIds: ['agent_current'],
        originalSellerAgentId: 'agent_original',
        subscriptionId: 'sub_renewal',
        tenantId: 'tenant_1',
      })
    );
  });

  it('does not create a commission for company-owned renewals', async () => {
    await handleRenewalSubscriptionExtras({
      sub: subscription,
      userId: 'user_1',
      tenantId: 'tenant_1',
      customData: undefined,
      priceId: 'price_renewal',
      userRecord: null,
      ownership: {
        subscriptionAgentId: null,
        userAgentId: 'agent_previous',
        agentClientAgentIds: [],
        originalSellerAgentId: null,
      },
      deps,
    });

    expect(createRenewalCommissionCore).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionAgentId: null,
        userAgentId: 'agent_previous',
        agentClientAgentIds: [],
        originalSellerAgentId: null,
      })
    );
  });

  it('logs unresolved ownership instead of falling back to custom data', async () => {
    vi.mocked(createRenewalCommissionCore).mockResolvedValue({
      success: true,
      data: {
        kind: 'no-op',
        noCommissionReason: 'unresolved',
        ownerType: 'unresolved',
        ownershipDiagnostics: [
          { source: 'subscription.agentId', expectedAgentId: null, actualAgentId: null },
        ],
      },
    });

    await handleRenewalSubscriptionExtras({
      sub: subscription,
      userId: 'user_1',
      tenantId: 'tenant_1',
      customData: { agentId: 'agent_current' },
      priceId: 'price_renewal',
      userRecord: null,
      ownership: {
        subscriptionAgentId: undefined,
        userAgentId: 'agent_previous',
        agentClientAgentIds: ['agent_previous'],
        originalSellerAgentId: 'agent_original',
      },
      deps,
    });

    expect(createRenewalCommissionCore).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionAgentId: undefined,
        userAgentId: 'agent_previous',
        agentClientAgentIds: ['agent_previous'],
        originalSellerAgentId: 'agent_original',
      })
    );
    expect(deps.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'commission.unresolved',
        metadata: expect.objectContaining({ noCommissionReason: 'unresolved' }),
      })
    );
  });

  it('never creates a member referral reward on renewal flows', async () => {
    await handleRenewalSubscriptionExtras({
      sub: subscription,
      userId: 'user_1',
      tenantId: 'tenant_1',
      customData: undefined,
      priceId: 'price_renewal',
      userRecord: null,
      ownership: {
        subscriptionAgentId: null,
        userAgentId: null,
        agentClientAgentIds: [],
        originalSellerAgentId: null,
      },
      deps,
    });

    expect(createMemberReferralRewardCore).not.toHaveBeenCalled();
  });
});
