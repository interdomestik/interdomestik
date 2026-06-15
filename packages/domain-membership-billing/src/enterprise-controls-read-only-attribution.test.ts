import { describe, expect, it } from 'vitest';

import { assertFinancePayability } from './enterprise-controls';

describe('finance control for read-only attribution', () => {
  it('keeps agent commissions payable after read-scope bindings are revoked', () => {
    const result = assertFinancePayability({
      commissionId: 'comm-read-only-attribution',
      subscriptionAgentId: 'agent-1',
      userAgentId: 'agent-1',
      agentClientAgentIds: [],
      subscription: { status: 'active', cancelAtPeriodEnd: false, gracePeriodEndsAt: null },
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        ownership: expect.objectContaining({
          agentId: 'agent-1',
          ownerType: 'agent',
          resolvedFrom: 'subscription.agentId',
        }),
      }),
    });
  });
});
