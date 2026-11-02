import { vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendTenantMemberCredential: vi.fn(),
  hasTenantMemberCredential: vi.fn(),
  issueTenantMemberNumber: vi.fn(),
  deletedTables: [] as unknown[],
  selectResults: [] as unknown[][],
  withTransactionRetry: vi.fn(),
  withTenantContext: vi.fn(),
  emailExecute: vi.fn(),
}));

vi.mock('@interdomestik/shared-utils/resilience', () => ({
  withTransactionRetry: mocks.withTransactionRetry,
}));

vi.mock('@interdomestik/shared-utils/circuit-breaker', () => ({
  circuitBreakers: {
    email: {
      execute: mocks.emailExecute,
    },
  },
}));

vi.mock('@interdomestik/database', async () => {
  const helper = await import('@/test/canonical-membership-db-mock');

  const db = {
    select: helper.createQueuedSelectMock(mocks.selectResults),
  };

  return {
    agentClients: {
      tenantId: 'agent_clients.tenant_id',
      memberId: 'agent_clients.member_id',
      agentId: 'agent_clients.agent_id',
    },
    and: vi.fn((...conditions: unknown[]) => ({ kind: 'and', conditions })),
    appendTenantMemberCredential: mocks.appendTenantMemberCredential,
    hasTenantMemberCredential: mocks.hasTenantMemberCredential,
    issueTenantMemberNumber: mocks.issueTenantMemberNumber,
    asc: vi.fn((value: unknown) => ({ kind: 'asc', value })),
    eq: vi.fn((column: unknown, value: unknown) => ({ kind: 'eq', column, value })),
    membershipPlans: helper.CANONICAL_MEMBERSHIP_PLAN_COLUMNS,
    db,
    withTenantContext: async (context: unknown, cb: (tx: unknown) => unknown) => {
      mocks.withTenantContext(context);
      return cb(db);
    },
  };
});

vi.mock('@interdomestik/database/schema', () => ({
  user: {},
  account: {},
  agentClients: {},
  subscriptions: {},
}));

vi.mock('@/lib/email', () => ({
  sendMemberWelcomeEmail: vi.fn(),
}));

export function registrationForm(email = 'john@example.com'): FormData {
  const formData = new FormData();
  formData.append('fullName', 'John Doe');
  formData.append('email', email);
  formData.append('phone', '1234567890');
  formData.append('password', 'Secret123!');
  formData.append('planId', 'standard');
  return formData;
}

vi.mock('nanoid', () => ({
  nanoid: vi.fn().mockReturnValue('new-id'),
  customAlphabet: vi.fn(() => () => 'REFCODE01'),
}));

export { mocks };
