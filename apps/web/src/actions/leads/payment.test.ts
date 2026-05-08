import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  runAuthenticatedAction: vi.fn(),
  startPayment: vi.fn(),
}));

vi.mock('@/lib/safe-action', () => ({
  runAuthenticatedAction: hoisted.runAuthenticatedAction,
}));

vi.mock('@interdomestik/domain-leads', () => ({
  startPayment: hoisted.startPayment,
  startPaymentSchema: {
    parse: (input: unknown) => input,
  },
}));

import { startPaymentAction } from './payment';

const agentSession = {
  user: {
    id: 'agent-1',
    role: 'agent',
    tenantId: 'tenant-1',
  },
};

function paymentContextWithBranch(branchId: string | null) {
  return {
    scope: {
      actorAgentId: 'agent-1',
      attributedAgentId: null,
      branchId,
    },
    session: agentSession,
    tenantId: 'tenant-1',
    userRole: 'agent',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.runAuthenticatedAction.mockImplementation(async callback =>
    callback(paymentContextWithBranch('branch-1'))
  );
  hoisted.startPayment.mockResolvedValue({
    attemptId: 'pay_attempt_1',
    method: 'cash',
    status: 'pending',
  });
});

describe('startPaymentAction', () => {
  it('passes tenant, agent, and branch scope into payment creation', async () => {
    await expect(
      startPaymentAction({
        amountCents: 15000,
        leadId: 'lead-1',
        method: 'cash',
        priceId: 'default_membership',
      })
    ).resolves.toEqual({
      attemptId: 'pay_attempt_1',
      method: 'cash',
      status: 'pending',
    });

    expect(hoisted.startPayment).toHaveBeenCalledWith(
      {
        agentId: 'agent-1',
        branchId: 'branch-1',
        tenantId: 'tenant-1',
      },
      expect.objectContaining({ leadId: 'lead-1' })
    );
  });

  it('rejects callers without agent branch scope before payment creation', async () => {
    hoisted.runAuthenticatedAction.mockImplementationOnce(async callback =>
      callback(paymentContextWithBranch(null))
    );

    await expect(
      startPaymentAction({
        amountCents: 15000,
        leadId: 'lead-1',
        method: 'cash',
        priceId: 'default_membership',
      })
    ).rejects.toThrow(/unauthorized/i);
    expect(hoisted.startPayment).not.toHaveBeenCalled();
  });
});
