import {
  installExtrasHooks,
  handleCreatedSubscriptionExtras,
  mockDeps,
  mockSub,
  mockUserRecord,
  tx,
  onConflictDoUpdate,
  updateWhere,
} from './extras.fixtures.test-support';
import { authority } from './extras.test-support';
import { db, withTenantContext } from '@interdomestik/database';
import { describe, expect, it } from 'vitest';
import { createMemberReferralRewardCore } from '../../../../../domain-referrals/src';
import { createCommissionWithDispositionCore } from '../../../commissions/create';

describe('handleNewSubscriptionExtras', () => {
  installExtrasHooks();

  it('should skip commission if no agentId', async () => {
    await handleCreatedSubscriptionExtras({
      sub: mockSub,
      userId: 'user_1',
      authority,
      customData: { locale: 'en' },
      priceId: 'price_1',
      userRecord: mockUserRecord,
      deps: mockDeps,
    });

    expect(createCommissionWithDispositionCore).not.toHaveBeenCalled();
    // The only tenant context left is the read-only referral lookup: no write statement ran.
    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('records read-only attribution without reactivating agent-client read-scope links', async () => {
    await handleCreatedSubscriptionExtras({
      sub: mockSub,
      userId: 'user_1',
      authority,
      customData: { agentId: 'agent_1' },
      priceId: 'price_1',
      userRecord: mockUserRecord,
      deps: mockDeps,
    });

    expect(db.transaction).toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
    expect(updateWhere).toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(onConflictDoUpdate).not.toHaveBeenCalled();
  });

  it('creates a member referral reward for a first paid subscription without an agent commission', async () => {
    (db.query.referrals.findFirst as any).mockResolvedValue({ id: 'ref_1' });
    (createMemberReferralRewardCore as any).mockResolvedValue({
      success: true,
      data: {
        kind: 'created',
        created: true,
        id: 'reward_1',
        rewardCents: 500,
        status: 'pending',
        rewardType: 'fixed',
        currencyCode: 'EUR',
      },
    });

    await handleCreatedSubscriptionExtras({
      sub: mockSub,
      userId: 'user_1',
      authority,
      customData: { locale: 'en' },
      priceId: 'price_1',
      userRecord: mockUserRecord,
      deps: mockDeps,
    });

    expect(createCommissionWithDispositionCore).not.toHaveBeenCalled();
    expect(createMemberReferralRewardCore).toHaveBeenCalledWith(
      expect.objectContaining({
        authority,
        referralId: 'ref_1',
        subscriptionId: 'sub_123',
        qualifyingEventType: 'first_paid_membership',
        paymentAmountCents: 2000,
      })
    );
    expect(mockDeps.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'referral.reward.created',
        entityType: 'referral_reward',
      })
    );
  });
});
