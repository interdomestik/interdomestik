import { vi } from 'vitest';

export type MockFunction = ReturnType<typeof vi.fn>;
export interface PaddleResolutionMocks {
  /** Producer of the `paddle-webhook` authority; defaults to a test authority for the owner's tenant. */
  authorizePaddleTenant: MockFunction;
  /** Billing-scope producer; defaults to a permissive stand-in (tests of the binding override it). */
  authorizePaddleBillingTenant: MockFunction;
  resolvePaddleSubscriptionOwner: MockFunction;
  resolvePaddleUserOwner: MockFunction;
  resolvePaddleCustomerEmailOwner: MockFunction;
  readVerifiedPaddleTransactionEvidence: MockFunction;
}

/** Fixed identity producers (credential existence, member-number issuance) from the root. */
export interface PaddleIdentityMocks {
  hasTenantMemberCredential: MockFunction;
  issueTenantMemberNumber: MockFunction;
}

export interface PaddleHandlerMocks {
  db: {
    query: {
      user: { findFirst: MockFunction };
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
  /** Tenant-context boundary; tests assert the tenant it received. */
  withTenantContext: MockFunction;
  /** Privileged provider-reference resolvers, re-exported from the `@interdomestik/database` root. */
  resolution: PaddleResolutionMocks;
  identity: PaddleIdentityMocks;
  selectResults: unknown[][];
  and: MockFunction;
  appendEvent: MockFunction;
  asc: MockFunction;
  subscriptions: { id: string };
  webhookEvents: { payload: string };
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
    select: MockFunction;
    update: MockFunction;
    query: PaddleHandlerMocks['db']['query'];
  };
  insertedUserValues: MockFunction;
  updatedUserValues: MockFunction;
}
export interface PaddleDatabaseMockModule extends PaddleResolutionMocks, PaddleIdentityMocks {
  agentClients: {
    tenantId: string;
    memberId: string;
    agentId: string;
  };
  and: MockFunction;
  appendEvent: MockFunction;
  asc: MockFunction;
  db: PaddleHandlerMocks['db'];
  eq: MockFunction;
  inArray: MockFunction;
  membershipPlans: PaddleHandlerMocks['membershipPlans'];
  sql: MockFunction;
  subscriptions: PaddleHandlerMocks['subscriptions'];
  user: PaddleHandlerMocks['user'];
  webhookEvents: PaddleHandlerMocks['webhookEvents'];
  withTenantContext: MockFunction;
}

export interface CommissionMockModule {
  createCommissionCore: MockFunction;
  createCommissionWithDispositionCore: MockFunction;
}

export interface MemberNumberMockModule {
  generateMemberNumber: MockFunction;
}

export function createHoistedPaddleHandlerMocks(): PaddleHandlerMocks {
  const query = {
    user: { findFirst: vi.fn() },
    agentClients: { findFirst: vi.fn() },
    membershipPlans: { findFirst: vi.fn() },
    subscriptions: { findFirst: vi.fn() },
    tenantSettings: { findFirst: vi.fn() },
    webhookEvents: { findFirst: vi.fn() },
  };
  return {
    db: {
      query,
      transaction: vi.fn(),
      select: vi.fn(),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn() })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
    },
    withTenantContext: vi.fn(),
    resolution: {
      authorizePaddleTenant: vi.fn(),
      authorizePaddleBillingTenant: vi.fn(),
      resolvePaddleSubscriptionOwner: vi.fn(),
      resolvePaddleUserOwner: vi.fn(),
      resolvePaddleCustomerEmailOwner: vi.fn(),
      readVerifiedPaddleTransactionEvidence: vi.fn(),
    },
    identity: {
      hasTenantMemberCredential: vi.fn(),
      issueTenantMemberNumber: vi.fn(),
    },
    selectResults: [] as unknown[][],
    and: vi.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
    appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
    asc: vi.fn((value: unknown) => ({ op: 'asc', value })),
    subscriptions: { id: 'id_col' },
    webhookEvents: { payload: 'webhook_events.payload' },
    user: { id: 'user.id' },
    membershipPlans: {
      id: 'membership_plans.id',
      tenantId: 'membership_plans.tenant_id',
      tier: 'membership_plans.tier',
      paddlePriceId: 'membership_plans.paddle_price_id',
      interval: 'membership_plans.interval',
      isActive: 'membership_plans.is_active',
    },
    // The tenant-context transaction also serves tenant-scoped reads through `tx.query`.
    tx: {
      insert: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
      query,
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
    appendEvent: hoisted.appendEvent,
    asc: hoisted.asc,
    db: hoisted.db,
    eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
    inArray: vi.fn((left: unknown, right: unknown) => ({ op: 'inArray', left, right })),
    membershipPlans: hoisted.membershipPlans,
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
    subscriptions: hoisted.subscriptions,
    user: hoisted.user,
    webhookEvents: hoisted.webhookEvents,
    withTenantContext: hoisted.withTenantContext,
    ...hoisted.resolution,
    ...hoisted.identity,
  };
}

export function createCommissionMockModule(): CommissionMockModule {
  return {
    createCommissionCore: vi.fn(),
    createCommissionWithDispositionCore: vi.fn(),
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
