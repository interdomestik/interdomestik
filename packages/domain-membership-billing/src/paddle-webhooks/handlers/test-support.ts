import { expect, vi } from 'vitest';

import { createQueuedFrom as createQueuedFromMock } from '../../../../../scripts/tests/queued-select-mock';

export { createQueuedFromMock as createQueuedFrom };

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

interface ProviderSubscriptionLookupArgs {
  where?: (
    subs: Record<string, string>,
    operators: {
      eq: (left: unknown, right: unknown) => unknown;
      or: (...clauses: unknown[]) => unknown;
    }
  ) => unknown;
}

interface PaddleDatabaseMockModule {
  agentClients: {
    tenantId: string;
    memberId: string;
    agentId: string;
  };
  and: MockFunction;
  asc: MockFunction;
  db: PaddleHandlerMocks['db'];
  eq: MockFunction;
  membershipPlans: PaddleHandlerMocks['membershipPlans'];
  subscriptions: PaddleHandlerMocks['subscriptions'];
  user: PaddleHandlerMocks['user'];
}

interface CommissionMockModule {
  createCommissionCore: MockFunction;
}

interface MemberNumberMockModule {
  generateMemberNumber: MockFunction;
}

interface RacedSubscriptionInsertMocks {
  mockSet: MockFunction;
  mockWhere: MockFunction;
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

export function createPaddleDatabaseMockModule(
  hoisted: ReturnType<typeof createHoistedPaddleHandlerMocks>
): PaddleDatabaseMockModule {
  return {
    agentClients: {
      tenantId: 'agent_clients.tenant_id',
      memberId: 'agent_clients.member_id',
      agentId: 'agent_clients.agent_id',
    },
    and: hoisted.and,
    asc: hoisted.asc,
    db: hoisted.db,
    eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
    membershipPlans: hoisted.membershipPlans,
    subscriptions: hoisted.subscriptions,
    user: hoisted.user,
  };
}

export function createCommissionMockModule(): CommissionMockModule {
  return {
    createCommissionCore: vi.fn(),
  };
}

export function createMemberNumberMockModule(): MemberNumberMockModule {
  return {
    generateMemberNumber: vi.fn().mockResolvedValue({
      memberNumber: 'MEM-2026-000123',
      isNew: true,
    }),
  };
}

export function createPastDueSubscriptionEvent() {
  return {
    data: {
      id: 'sub_paddle_456',
      status: 'past_due',
      customData: { userId: 'user_123' },
      items: [
        {
          price: {
            id: 'pri_123',
            description: 'Asistenca',
            unitPrice: { amount: '1000', currencyCode: 'USD' },
          },
        },
      ],
      currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
    },
  };
}

export function createActiveSubscriptionUpdatedEvent() {
  return {
    eventType: 'subscription.updated',
    data: {
      id: 'sub_paddle_456',
      status: 'active',
      customData: { userId: 'user_123' },
      items: [
        {
          price: { id: 'pri_123', unitPrice: { amount: '1000', currencyCode: 'USD' } },
        },
      ],
      currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
    },
  };
}

export function expectProviderSubscriptionReferenceLookup(
  args: ProviderSubscriptionLookupArgs,
  providerSubscriptionId: string
) {
  const whereNode = args.where?.(
    {
      id: 'subscriptions.id',
      providerSubscriptionId: 'subscriptions.provider_subscription_id',
    },
    {
      eq: (left, right) => ({ op: 'eq', left, right }),
      or: (...clauses) => ({ op: 'or', clauses }),
    }
  ) as
    | { op?: string; clauses?: Array<{ op?: string; left?: unknown; right?: unknown }> }
    | undefined;

  expect(whereNode).toEqual({
    op: 'or',
    clauses: [
      { op: 'eq', left: 'subscriptions.id', right: providerSubscriptionId },
      {
        op: 'eq',
        left: 'subscriptions.provider_subscription_id',
        right: providerSubscriptionId,
      },
    ],
  });
}

export function mockRacedSubscriptionInsert(
  hoisted: ReturnType<typeof createHoistedPaddleHandlerMocks>
): RacedSubscriptionInsertMocks {
  const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });

  hoisted.db.update.mockReturnValue({ set: mockSet });
  hoisted.db.insert.mockReturnValue({
    values: vi.fn().mockRejectedValue(uniqueViolation),
  });

  return { mockSet, mockWhere };
}

export function resetPaddleHandlerMocks(
  hoisted: ReturnType<typeof createHoistedPaddleHandlerMocks>
) {
  vi.clearAllMocks();
  hoisted.selectResults.length = 0;
  hoisted.db.select.mockImplementation(() => ({
    from: createQueuedFromMock(vi.fn, hoisted.selectResults),
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
