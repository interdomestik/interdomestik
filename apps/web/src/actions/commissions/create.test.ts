import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbInsertValues: vi.fn(),
  dbSelectFrom: vi.fn(),
  dbSelectWhere: vi.fn(),
  dbSelectLimit: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    insert: () => ({ values: mocks.dbInsertValues }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mocks.dbSelectLimit,
        }),
      }),
    }),
    query: {
      user: {
        findFirst: vi.fn().mockResolvedValue({ tenantId: 'tenant_mk' }),
      },
    },
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  agentCommissions: {
    id: 'id',
    tenantId: 'tenant_id',
    subscriptionId: 'subscription_id',
    type: 'type',
  },
  user: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'commission-1',
}));

import { createCommissionCore } from './create';

describe('createCommissionCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock: no existing commission (idempotency check returns empty)
    mocks.dbSelectLimit.mockResolvedValue([]);
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
      tenantId: 'tenant_mk',
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
        tenantId: 'tenant_mk',
        metadata: { source: 'test' },
        earnedAt: expect.any(Date),
      })
    );
  });

  it('returns existing commission ID on duplicate (idempotency)', async () => {
    // Mock: existing commission found
    mocks.dbSelectLimit.mockResolvedValue([{ id: 'existing-commission' }]);

    const result = await createCommissionCore({
      agentId: 'agent-1',
      memberId: 'member-1',
      subscriptionId: 'sub-1',
      type: 'new_membership',
      amount: 12.3,
      currency: 'EUR',
      tenantId: 'tenant_mk',
    });

    expect(result).toEqual({ success: true, data: { id: 'existing-commission' } });
    expect(mocks.dbInsertValues).not.toHaveBeenCalled();
  });
});
