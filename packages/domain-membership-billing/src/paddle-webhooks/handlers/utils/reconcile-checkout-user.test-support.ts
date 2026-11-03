import { vi, type Mock } from 'vitest';

// Matches Vitest's own Procedure so typed mocks stay callable and assignable like inferred ones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFunction = Mock<(...args: any[]) => any>;

type HoistedMocks = {
  db: {
    query: {
      user: {
        findFirst: MockFunction;
      };
      tenantSettings: {
        findFirst: MockFunction;
      };
    };
    transaction: MockFunction;
  };
  tx: {
    insert: MockFunction;
    update: MockFunction;
    query: Record<string, unknown>;
  };
  withTenantContext: MockFunction;
  authorizePaddleBillingTenant: MockFunction;
  authorizePaddleTenant: MockFunction;
  resolvePaddleCustomerEmailOwner: MockFunction;
  readVerifiedPaddleTransactionEvidence: MockFunction;
  insertedUserValues: MockFunction;
  updatedUserValues: MockFunction;
  issueTenantMemberNumber: MockFunction;
  hasTenantMemberCredential: MockFunction;
  nanoid: MockFunction;
};

const hoisted: HoistedMocks = vi.hoisted(() => ({
  db: {
    query: {
      user: { findFirst: vi.fn() },
      tenantSettings: { findFirst: vi.fn() },
    },
    transaction: vi.fn(),
  },
  tx: {
    insert: vi.fn(),
    update: vi.fn(),
    query: {} as Record<string, unknown>,
  },
  withTenantContext: vi.fn(),
  authorizePaddleBillingTenant: vi.fn(),
  authorizePaddleTenant: vi.fn(),
  resolvePaddleCustomerEmailOwner: vi.fn(),
  readVerifiedPaddleTransactionEvidence: vi.fn(),
  insertedUserValues: vi.fn(),
  updatedUserValues: vi.fn(),
  issueTenantMemberNumber: vi.fn(),
  hasTenantMemberCredential: vi.fn(),
  nanoid: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  agentClients: {
    tenantId: 'agent_clients.tenant_id',
    memberId: 'agent_clients.member_id',
    agentId: 'agent_clients.agent_id',
  },
  and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
  db: hoisted.db,
  hasTenantMemberCredential: hoisted.hasTenantMemberCredential,
  issueTenantMemberNumber: hoisted.issueTenantMemberNumber,
  eq: vi.fn((left, right) => ({ left, right })),
  user: { id: 'user.id' },
  withTenantContext: hoisted.withTenantContext,
  authorizePaddleBillingTenant: hoisted.authorizePaddleBillingTenant,
  authorizePaddleTenant: hoisted.authorizePaddleTenant,
  resolvePaddleCustomerEmailOwner: hoisted.resolvePaddleCustomerEmailOwner,
  readVerifiedPaddleTransactionEvidence: hoisted.readVerifiedPaddleTransactionEvidence,
}));

vi.mock('nanoid', () => ({
  nanoid: hoisted.nanoid,
}));

export function insertedUserValuesInclude(fields: Record<string, unknown>): boolean {
  return hoisted.insertedUserValues.mock.calls.some(([value]) => {
    if (!value || typeof value !== 'object') return false;
    return Object.entries(fields).every(([key, expected]) => {
      return (value as Record<string, unknown>)[key] === expected;
    });
  });
}

export { hoisted };
