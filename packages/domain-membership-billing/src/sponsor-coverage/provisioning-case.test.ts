import { describe, expect, it } from 'vitest';

import { classifyProvisioning, type SubscriptionStatus } from './provisioning-case';

const member = (provider: string | null, status: SubscriptionStatus | null) =>
  classifyProvisioning({
    kind: 'visible',
    role: 'member',
    subscription: { provider, status },
  });

describe('classifyProvisioning', () => {
  it('separates new, foreign and non-member accounts', () => {
    expect(classifyProvisioning({ kind: 'created' })).toBe('new_user');
    expect(classifyProvisioning({ kind: 'not_visible' })).toBe('foreign');
    expect(classifyProvisioning({ kind: 'visible', role: 'agent', subscription: null })).toBe(
      'not_eligible'
    );
  });

  it('starts a member at once without a renewing Paddle row', () => {
    expect(classifyProvisioning({ kind: 'visible', role: 'member', subscription: null })).toBe(
      'immediate'
    );
    expect(member('group_sponsor', 'active')).toBe('immediate');
    expect(member('paddle', 'canceled')).toBe('immediate');
    expect(member('paddle', 'expired')).toBe('immediate');
  });

  it('hands an active Paddle member over and sends uncertain states to staff', () => {
    expect(member('paddle', 'active')).toBe('handover');
    for (const status of ['trialing', 'past_due', 'paused'] as const) {
      expect(member('paddle', status)).toBe('paddle_review');
    }
  });
});
