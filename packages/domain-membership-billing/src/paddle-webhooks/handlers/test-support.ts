import { vi } from 'vitest';

import { createQueuedFrom } from '../../../../../scripts/tests/queued-select-mock';

export { createQueuedFrom };

type MockFunction = ReturnType<typeof vi.fn>;

interface PaddleHandlerMocks {
  db: {
    query: {
      user: { findFirst: MockFunction };
      account: { findFirst: MockFunction };
      agentClients: { findFirst: MockFunction };
      membershipPlans: { findFirst: MockFunction };
      subscriptions: { findFirst: MockFunction };
      tenantSettings: { findFirst: MockFunction };
      webhookEvents: { findFirst: MockFunction };
    };
    transaction: MockFunction;
    select: MockFunction;
    insert: MockFunction;
    update: MockFunction;
  };
  selectResults: unknown[][];
  and: MockFunction;
  asc: MockFunction;
  subscriptions: { id: string };
  user: { id: string };
  membershipPlans: {
    id: string;
    tenantId: string;
    tier: string;
    paddlePriceId: string;
    interval: string;
    isActive: string;
  };
  tx: {
    insert: MockFunction;
    update: MockFunction;
  };
  insertedUserValues: MockFunction;
  updatedUserValues: MockFunction;
}

export function createHoistedPaddleHandlerMocks(): PaddleHandlerMocks {
  return {
    db: {
      query: {
        user: { findFirst: vi.fn() },
        account: { findFirst: vi.fn() },
        agentClients: { findFirst: vi.fn() },
        membershipPlans: { findFirst: vi.fn() },
        subscriptions: { findFirst: vi.fn() },
        tenantSettings: { findFirst: vi.fn() },
        webhookEvents: { findFirst: vi.fn() },
      },
      transaction: vi.fn(),
      select: vi.fn(),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn() })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
    },
    selectResults: [] as unknown[][],
    and: vi.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
    asc: vi.fn((value: unknown) => ({ op: 'asc', value })),
    subscriptions: { id: 'id_col' },
    user: { id: 'user.id' },
    membershipPlans: {
      id: 'membership_plans.id',
      tenantId: 'membership_plans.tenant_id',
      tier: 'membership_plans.tier',
      paddlePriceId: 'membership_plans.paddle_price_id',
      interval: 'membership_plans.interval',
      isActive: 'membership_plans.is_active',
    },
    tx: {
      insert: vi.fn(),
      update: vi.fn(),
    },
    insertedUserValues: vi.fn(),
    updatedUserValues: vi.fn(),
  };
}

export function resetPaddleHandlerMocks(
  hoisted: ReturnType<typeof createHoistedPaddleHandlerMocks>
) {
  vi.clearAllMocks();
  hoisted.selectResults.length = 0;
  hoisted.db.select.mockImplementation(() => ({
    from: createQueuedFrom(vi.fn, hoisted.selectResults),
  }));
  hoisted.db.transaction.mockImplementation(async callback => callback(hoisted.tx));
  hoisted.db.insert.mockImplementation(() => ({
    values: vi.fn().mockResolvedValue(undefined),
  }));
  hoisted.db.query.agentClients.findFirst.mockResolvedValue(null);
  hoisted.db.query.membershipPlans.findFirst.mockResolvedValue(null);
  hoisted.db.update.mockImplementation(() => ({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }));
  hoisted.tx.insert.mockImplementation(() => ({
    values: hoisted.insertedUserValues,
  }));
  hoisted.insertedUserValues.mockReturnValue({
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
  });
  hoisted.tx.update.mockImplementation(() => ({
    set: hoisted.updatedUserValues,
  }));
  hoisted.updatedUserValues.mockReturnValue({
    where: async () => undefined,
  });
}
