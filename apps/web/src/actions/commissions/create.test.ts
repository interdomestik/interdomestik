import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbInsertValues: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    insert: () => ({ values: mocks.dbInsertValues }),
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  agentCommissions: {},
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'commission-1',
}));

import { createCommissionCore } from './create';

describe('createCommissionCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores amount with 2 decimals and status pending', async () => {
    mocks.dbInsertValues.mockResolvedValue(undefined);

    const result = await createCommissionCore({
      agentId: 'agent-1',
      memberId: 'member-1',
      subscriptionId: 'sub-1',
      type: 'new_membership',
      amount: 12.3,
      currency: 'EUR',
      metadata: { source: 'test' },
    });

    expect(result).toEqual({ success: true, data: { id: 'commission-1' } });
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'commission-1',
        agentId: 'agent-1',
        memberId: 'member-1',
        subscriptionId: 'sub-1',
        type: 'new_membership',
        status: 'pending',
        amount: '12.30',
        currency: 'EUR',
        metadata: { source: 'test' },
        earnedAt: expect.any(Date),
      })
    );
  });
});
