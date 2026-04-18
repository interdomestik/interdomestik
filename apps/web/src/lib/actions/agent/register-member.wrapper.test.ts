import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMemberCore } from './register-member.core';

const mocks = vi.hoisted(() => ({
  generateMemberNumber: vi.fn().mockResolvedValue({
    memberNumber: 'MEM-2026-000001',
    isNew: true,
  }),
  selectResults: [] as unknown[][],
  withTransactionRetry: vi.fn(),
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

  return {
    and: vi.fn((...conditions: unknown[]) => ({ kind: 'and', conditions })),
    asc: vi.fn((value: unknown) => ({ kind: 'asc', value })),
    eq: vi.fn((column: unknown, value: unknown) => ({ kind: 'eq', column, value })),
    membershipPlans: helper.CANONICAL_MEMBERSHIP_PLAN_COLUMNS,
    db: {
      select: helper.createQueuedSelectMock(mocks.selectResults),
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

vi.mock('@interdomestik/database/member-number', () => ({
  generateMemberNumber: mocks.generateMemberNumber,
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn().mockReturnValue('new-id'),
  customAlphabet: vi.fn(() => () => 'REFCODE01'),
}));

describe('registerMemberCore', () => {
  const mockAgent = { id: 'agent1', name: 'Agent Smith' };
  const mockTenantId = 'tenant-1';
  const mockBranchId = 'mk_branch_a';
  const insertValues: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    insertValues.length = 0;
    mocks.selectResults.length = 0;
    mocks.selectResults.push([], [], [{ id: 'tenant-standard-plan', tier: 'standard' }]);
    mocks.withTransactionRetry.mockImplementation(async callback => {
      const tx = {
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockImplementation(async (value: unknown) => {
          insertValues.push(value);
          return true;
        }),
      };
      return await callback(tx);
    });
    mocks.emailExecute.mockImplementation(async operation => operation());
  });

  it('should register member successfully', async () => {
    const formData = new FormData();
    formData.append('fullName', 'John Doe');
    formData.append('email', 'john@example.com');
    formData.append('phone', '1234567890');
    formData.append('password', 'Secret123!');
    formData.append('planId', 'standard');

    const result = await registerMemberCore(mockAgent, mockTenantId, mockBranchId, formData);

    expect(result).toEqual({ ok: true });
    expect(mocks.withTransactionRetry).toHaveBeenCalled();
    expect(mocks.generateMemberNumber).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'new-id',
        joinedAt: expect.any(Date),
      })
    );
    expect(insertValues).toContainEqual(
      expect.objectContaining({
        status: 'active',
        planId: 'standard',
        planKey: 'tenant-standard-plan',
      })
    );
  });

  it('should fail validation', async () => {
    const formData = new FormData();
    formData.append('fullName', 'John Doe');
    formData.append('email', 'invalid-email'); // Invalid email
    formData.append('phone', '1234567890');
    formData.append('password', 'Secret123!');
    formData.append('planId', 'standard');

    const result = await registerMemberCore(mockAgent, mockTenantId, mockBranchId, formData);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Validation failed');
    }
  });

  it('should handle transaction errors (e.g., email duplicate)', async () => {
    mocks.withTransactionRetry.mockRejectedValue(new Error('Duplicate'));

    const formData = new FormData();
    formData.append('fullName', 'John Doe');
    formData.append('email', 'john@example.com');
    formData.append('phone', '1234567890');
    formData.append('password', 'Secret123!');
    formData.append('planId', 'standard');

    const result = await registerMemberCore(mockAgent, mockTenantId, mockBranchId, formData);

    expect(result).toEqual({
      ok: false,
      error: 'Failed to register member. Email might already exist.',
    });
  });

  it('creates paused sponsored subscriptions for sponsored imports', async () => {
    const formData = new FormData();
    formData.append('fullName', 'Sponsored User');
    formData.append('email', 'sponsored@example.com');
    formData.append('phone', '1234567890');
    formData.append('password', 'Secret123!');
    formData.append('planId', 'standard');

    const result = await registerMemberCore(mockAgent, mockTenantId, mockBranchId, formData, {
      membershipMode: 'sponsored',
    });

    expect(result).toEqual({ ok: true });
    expect(insertValues).toContainEqual(
      expect.objectContaining({
        status: 'paused',
        planId: 'standard',
        provider: 'group_sponsor',
        acquisitionSource: 'group_roster_import',
        currentPeriodStart: null,
        currentPeriodEnd: null,
      })
    );
  });
});
