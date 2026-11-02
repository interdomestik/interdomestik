import {
  installExtrasHooks,
  handleCreatedSubscriptionExtras,
  mockDeps,
  mockSub,
  mockUserRecord,
  tx,
  insertValues,
} from './extras.fixtures.test-support';
import { authority } from './extras.test-support';
import { db, withTenantContext } from '@interdomestik/database';
import { describe, expect, it } from 'vitest';
import { createMemberReferralRewardCore } from '../../../../../domain-referrals/src';
import { createCommissionWithDispositionCore } from '../../../commissions/create';

describe('handleNewSubscriptionExtras', () => {
  installExtrasHooks();

  it('should process commission if agentId is present', async () => {
    await handleCreatedSubscriptionExtras({
      sub: mockSub,
      userId: 'user_1',
      authority,
      customData: { agentId: 'agent_1' },
      priceId: 'price_1',
      userRecord: mockUserRecord,
      deps: mockDeps,
    });

    expect(db.query.agentSettings.findFirst).toHaveBeenCalled();
    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(createCommissionWithDispositionCore).toHaveBeenCalledWith(
      expect.objectContaining({
        authority,
        agentId: 'agent_1',
        amount: 4, // 20% of 20.00 EUR default
        memberId: 'user_1',
        metadata: expect.objectContaining({
          saleOwnerType: 'agent',
          saleOwnerId: 'agent_1',
          originalSellerAgentId: 'agent_1',
          ownershipResolvedFrom: ['checkout.customData.agentId'],
        }),
      })
    );
    expect(mockDeps.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'commission.created',
      })
    );
    expect(db.transaction).toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('should use custom commission rates if found', async () => {
    (db.query.agentSettings.findFirst as any).mockResolvedValue({
      commissionRates: { new_membership: 0.5 }, // 50% custom rate
    });
    await handleCreatedSubscriptionExtras({
      sub: mockSub,
      userId: 'user_1',
      authority,
      customData: { agentId: 'agent_1' },
      priceId: 'price_1',
      userRecord: mockUserRecord,
      deps: mockDeps,
    });

    expect(createCommissionWithDispositionCore).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10, // 50% of 20
      })
    );
  });

  it('prefers the canonical user owner over stale webhook agent attribution', async () => {
    await handleCreatedSubscriptionExtras({
      sub: mockSub,
      userId: 'user_1',
      authority,
      customData: { agentId: 'agent_stale' },
      priceId: 'price_1',
      userRecord: {
        ...mockUserRecord,
        agentId: 'agent_canonical',
      },
      deps: mockDeps,
    });

    expect(createCommissionWithDispositionCore).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent_canonical',
      })
    );
    expect(db.transaction).toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('treats company-owned canonical users as company-owned even when webhook customData is stale', async () => {
    await handleCreatedSubscriptionExtras({
      sub: mockSub,
      userId: 'user_1',
      authority,
      customData: { agentId: 'agent_stale' },
      priceId: 'price_1',
      userRecord: {
        ...mockUserRecord,
        agentId: null,
      },
      deps: mockDeps,
    });

    expect(createCommissionWithDispositionCore).not.toHaveBeenCalled();
    // The only tenant context left is the read-only referral lookup: no write statement ran.
    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(createMemberReferralRewardCore).toHaveBeenCalledWith(
      expect.objectContaining({
        authority,
        subscriptionId: 'sub_123',
      })
    );
  });
});
